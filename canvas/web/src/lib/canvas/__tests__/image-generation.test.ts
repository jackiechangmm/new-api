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

test("M8 编辑模式派生新节点，写入参考图 UUID 清单并调用 edit", async () => {
    let nodes: CanvasNodeData[] = [
        {
            id: "source-node",
            type: CanvasNodeType.Image,
            title: "ref image",
            position: { x: 100, y: 100 },
            width: 300,
            height: 200,
            metadata: {
                content: "https://example.com/ref.png",
                storageKey: "ref-uuid-1",
                naturalWidth: 300,
                naturalHeight: 200,
            },
        },
    ];
    let connections: Array<{ sourceId: string; targetId: string }> = [];
    let editCalled = false;
    let generateCalled = false;

    const refImage = {
        id: "source-node",
        name: "ref.png",
        type: "image/png",
        dataUrl: "https://example.com/ref.png",
        storageKey: "ref-uuid-1",
    };

    const run = {
        sourceId: "source-node",
        prompt: "oil painting style",
        config: { ...defaultConfig, models: ["gpt-image-2"], count: "2" },
        signal: new AbortController().signal,
        references: [refImage],
        getNodes: () => nodes,
        setNodes: (update: (value: CanvasNodeData[]) => CanvasNodeData[]) => {
            nodes = update(nodes);
        },
        addConnection: (sourceId: string, targetId: string) => {
            connections.push({ sourceId, targetId });
        },
    };

    const result = await runCanvasImageGeneration(run, {
        generate: async () => {
            generateCalled = true;
            return [];
        },
        edit: async (cfg, prompt, refs) => {
            editCalled = true;
            assert.equal(prompt, "oil painting style");
            assert.equal(refs.length, 1);
            assert.equal(refs[0].storageKey, "ref-uuid-1");
            return [
                { id: "out-1", storageKey: "out-uuid-1", url: "https://example.com/out-1.png", dataUrl: "https://example.com/out-1.png", width: 300, height: 200, bytes: 5000, mimeType: "image/png" },
                { id: "out-2", storageKey: "out-uuid-2", url: "https://example.com/out-2.png", dataUrl: "https://example.com/out-2.png", width: 300, height: 200, bytes: 6000, mimeType: "image/png" },
            ];
        },
        store: async () => ({ url: "", width: 0, height: 0, bytes: 0, mimeType: "" }),
    });

    assert.equal(editCalled, true);
    assert.equal(generateCalled, false);
    assert.equal(result.received, 2);

    // 验证派生新节点并在右侧创建
    assert.equal(nodes.length, 2);
    const targetNode = nodes.find((n) => n.id === result.targetId)!;
    assert.ok(targetNode);
    assert.ok(targetNode.position.x >= 100 + 300 + 96);
    assert.ok(targetNode.position.y >= 100);

    // 验证新节点持有编辑类型与参考图 UUID 清单
    assert.equal(targetNode.metadata?.generationType, "edit");
    assert.deepEqual(targetNode.metadata?.references, ["ref-uuid-1"]);
    assert.equal(targetNode.metadata?.status, "success");
    assert.equal(targetNode.metadata?.images?.length, 2);
    assert.equal(targetNode.metadata?.images?.[0].storageKey, "out-uuid-1");

    // 验证自动建立源到目标的连线
    assert.equal(connections.length, 1);
    assert.equal(connections[0].sourceId, "source-node");
    assert.equal(connections[0].targetId, targetNode.id);
});

test("M8 编辑节点单图重试保留原有参考图 UUID 清单与 edit 类型", async () => {
    let nodes: CanvasNodeData[] = [
        {
            id: "edit-node",
            type: CanvasNodeType.Image,
            title: "edited image",
            position: { x: 0, y: 0 },
            width: 340,
            height: 240,
            metadata: {
                content: "https://example.com/out-1.png",
                count: 2,
                primaryImageId: "out-1",
                generationType: "edit",
                references: ["ref-uuid-1", "ref-uuid-2"],
                prompt: "vintage look",
                images: [
                    { id: "out-1", content: "https://example.com/out-1.png", storageKey: "out-uuid-1", status: "success", naturalWidth: 100, naturalHeight: 100, bytes: 10, mimeType: "image/png" },
                    { id: "out-2", content: "", status: "error", naturalWidth: 0, naturalHeight: 0, bytes: 0, mimeType: "" },
                ],
            },
        },
    ];

    const refImages = [
        { id: "r1", name: "r1.png", type: "image/png", dataUrl: "https://example.com/r1.png", storageKey: "ref-uuid-1" },
        { id: "r2", name: "r2.png", type: "image/png", dataUrl: "https://example.com/r2.png", storageKey: "ref-uuid-2" },
    ];

    let editCalled = false;
    const run = {
        sourceId: "edit-node",
        prompt: "vintage look",
        config: { ...defaultConfig, models: ["gpt-image-2"] },
        retry: { imageId: "out-2" },
        references: refImages,
        signal: new AbortController().signal,
        getNodes: () => nodes,
        setNodes: (update: (value: CanvasNodeData[]) => CanvasNodeData[]) => {
            nodes = update(nodes);
        },
        addConnection: () => {},
    };

    await runCanvasImageGeneration(run, {
        edit: async (cfg, prompt, refs) => {
            editCalled = true;
            assert.equal(refs.length, 2);
            return [{ id: "out-2", storageKey: "out-uuid-2-retry", url: "https://example.com/out-2-new.png", dataUrl: "https://example.com/out-2-new.png", width: 100, height: 100, bytes: 10, mimeType: "image/png" }];
        },
        store: async () => ({ url: "", width: 0, height: 0, bytes: 0, mimeType: "" }),
    });

    assert.equal(editCalled, true);
    assert.equal(nodes[0].metadata?.generationType, "edit");
    assert.deepEqual(nodes[0].metadata?.references, ["ref-uuid-1", "ref-uuid-2"]);
    assert.equal(nodes[0].metadata?.images?.[1].status, "success");
    assert.equal(nodes[0].metadata?.images?.[1].content, "https://example.com/out-2-new.png");
});
