import { test } from "node:test";
import assert from "node:assert/strict";
import { runCanvasImageGeneration } from "../image-generation";
import { defaultConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

test("一次多图生成保留执行期间的节点修改，不自动补图", async () => {
    let nodes: CanvasNodeData[] = [{ id: "source", type: CanvasNodeType.Image, title: "original", position: { x: 1, y: 2 }, width: 340, height: 240, metadata: {} }];
    let complete!: (images: { id: string; dataUrl: string }[]) => void;
    const response = new Promise<{ id: string; dataUrl: string }[]>((resolve) => {
        complete = resolve;
    });
    let calls = 0;
    const running = runCanvasImageGeneration(
        {
            sourceId: "source",
            prompt: "poster",
            config: { ...defaultConfig, models: ["gpt-image-2"], count: "4" },
            signal: new AbortController().signal,
            getNodes: () => nodes,
            setNodes: (update) => {
                nodes = update(nodes);
            },
            addConnection: () => {},
        },
        {
            generate: async (config) => {
                calls++;
                assert.equal(config.count, "4");
                return response;
            },
            store: async (url) => {
                assert.equal(typeof url, "string");
                return { url: url as string, width: 100, height: 100, bytes: 10, mimeType: "image/png" };
            },
        },
    );
    nodes = nodes.map((node) => ({ ...node, title: "edited", position: { x: 400, y: 500 } }));
    complete([
        { id: "one", dataUrl: "one" },
        { id: "two", dataUrl: "two" },
    ]);
    const result = await running;
    assert.equal(calls, 1);
    assert.equal(result.received, 2);
    assert.equal(nodes[0].title, "edited");
    assert.deepEqual(nodes[0].position, { x: 400, y: 500 });
    assert.equal(nodes[0].metadata?.images?.length, 2);
    assert.equal(nodes[0].metadata?.status, "success");
});

test("停止后即使请求晚到也不回写，删除目标不会重新插入", async () => {
    for (const cancel of [true, false]) {
        let nodes: CanvasNodeData[] = [{ id: "source", type: CanvasNodeType.Image, title: "original", position: { x: 1, y: 2 }, width: 340, height: 240, metadata: {} }];
        let complete!: (images: { id: string; dataUrl: string }[]) => void;
        const response = new Promise<{ id: string; dataUrl: string }[]>((resolve) => {
            complete = resolve;
        });
        const controller = new AbortController();
        const running = runCanvasImageGeneration(
            {
                sourceId: "source",
                prompt: "poster",
                config: { ...defaultConfig, models: ["gpt-image-2"] },
                signal: controller.signal,
                getNodes: () => nodes,
                setNodes: (update) => {
                    nodes = update(nodes);
                },
                addConnection: () => {},
            },
            {
                generate: () => response,
                store: async () => {
                    throw new Error("不得读取已作废结果");
                },
            },
        );
        if (cancel) controller.abort();
        else nodes = [];
        complete([{ id: "late", dataUrl: "late" }]);
        await assert.rejects(running, { name: "AbortError" });
        assert.equal(nodes[0]?.metadata?.content, undefined);
        if (!cancel) assert.equal(nodes.length, 0);
    }
});

test("同一节点请求替换后旧结果不能覆盖新结果", async () => {
    let nodes: CanvasNodeData[] = [{ id: "source", type: CanvasNodeType.Image, title: "original", position: { x: 0, y: 0 }, width: 340, height: 240, metadata: {} }];
    let completeOld!: (images: { id: string; dataUrl: string }[]) => void;
    const oldResponse = new Promise<{ id: string; dataUrl: string }[]>((resolve) => {
        completeOld = resolve;
    });
    const run = {
        sourceId: "source",
        prompt: "poster",
        config: { ...defaultConfig, models: ["gpt-image-2"] },
        signal: new AbortController().signal,
        getNodes: () => nodes,
        setNodes: (update: (value: CanvasNodeData[]) => CanvasNodeData[]) => {
            nodes = update(nodes);
        },
        addConnection: () => {},
    };
    const old = runCanvasImageGeneration(run, {
        generate: () => oldResponse,
        store: async () => {
            throw new Error("不得读取已替换结果");
        },
    });
    await runCanvasImageGeneration(run, { generate: async () => [{ id: "new", dataUrl: "new" }], store: async () => ({ url: "new", width: 100, height: 100, bytes: 10, mimeType: "image/png" }) });
    completeOld([{ id: "old", dataUrl: "old" }]);
    await assert.rejects(old, { name: "AbortError" });
    assert.equal(nodes[0].metadata?.content, "new");
    assert.equal(nodes[0].metadata?.status, "success");
});

test("单图重试保留其他图片、批次数量和主图，失败后允许明确重试", async () => {
    let nodes: CanvasNodeData[] = [
        {
            id: "source",
            type: CanvasNodeType.Image,
            title: "original",
            position: { x: 0, y: 0 },
            width: 340,
            height: 240,
            metadata: {
                content: "one",
                count: 2,
                primaryImageId: "one",
                generationType: "generation",
                images: [
                    { id: "one", content: "one", status: "success", naturalWidth: 100, naturalHeight: 100, bytes: 10, mimeType: "image/png" },
                    { id: "two", content: "", status: "error", naturalWidth: 0, naturalHeight: 0, bytes: 0, mimeType: "" },
                ],
            },
        },
    ];
    const run = {
        sourceId: "source",
        prompt: "poster",
        config: { ...defaultConfig, models: ["gpt-image-2"] },
        retry: { imageId: "two" },
        signal: new AbortController().signal,
        getNodes: () => nodes,
        setNodes: (update: (value: CanvasNodeData[]) => CanvasNodeData[]) => {
            nodes = update(nodes);
        },
        addConnection: () => {},
    };
    await assert.rejects(
        runCanvasImageGeneration(run, {
            generate: async () => {
                throw new Error("quota exhausted");
            },
            store: async () => {
                throw new Error("不得读取失败结果");
            },
        }),
        /quota exhausted/,
    );
    assert.equal(nodes[0].metadata?.images?.[1].status, "error");
    assert.equal(nodes[0].metadata?.content, "one");
    await runCanvasImageGeneration(run, {
        generate: async (settings) => {
            assert.equal(settings.count, "1");
            return [{ id: "new", dataUrl: "two" }];
        },
        store: async () => ({ url: "two", width: 100, height: 100, bytes: 10, mimeType: "image/png" }),
    });
    assert.equal(nodes[0].metadata?.count, 2);
    assert.equal(nodes[0].metadata?.content, "one");
    assert.equal(nodes[0].metadata?.primaryImageId, "one");
    assert.deepEqual(
        nodes[0].metadata?.images?.map((image) => [image.id, image.content, image.status]),
        [
            ["one", "one", "success"],
            ["two", "two", "success"],
        ],
    );
});
