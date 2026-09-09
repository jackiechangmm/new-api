import { test } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { defaultConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { defaultImageEditSettings } from "@/lib/canvas/image-models";
import { requestEdit, requestGeneration } from "@/services/api/image";

test("生成通过宿主认证调用本站，一次请求保留全部返回图片", async () => {
    const fetchBefore = globalThis.fetch;
    const postBefore = axios.post;
    const windowBefore = globalThis.window;
    let account = "901";
    useUserStore.setState({ user: { id: account, username: "test", displayName: "", avatarUrl: "" } });
    globalThis.window = { parent: { newApiCanvasHost: { getUser: () => ({ id: account }), getAuthHeaders: async () => ({ Authorization: "Bearer session", Secret: "must-not-forward" }), subscribe: () => () => {} } } } as unknown as Window &
        typeof globalThis;
    globalThis.fetch = (async (url, init) => {
        assert.equal(url, "/api/user/models");
        assert.deepEqual(init?.headers, { Authorization: "Bearer session" });
        return new Response(JSON.stringify({ success: true, data: ["gpt-image-2"] }));
    }) as typeof fetch;
    let posts = 0;
    const controller = new AbortController();
    axios.post = (async (url: unknown, body: unknown, options: unknown) => {
        posts++;
        assert.equal(url, "/api/canvas/images/generations");
        assert.deepEqual(body, { model: "gpt-image-2", prompt: "poster", size: "1:3 2k", quality: "low", n: 4, response_format: "b64_json", output_format: "png" });
        assert.deepEqual(options, { headers: { Authorization: "Bearer session" }, signal: controller.signal });
        return {
            data: {
                success: true,
                data: [
                    { id: "gen-1", url: "https://example.test/image1.png", width: 800, height: 600, bytes: 1000, mime_type: "image/png" },
                    { id: "gen-2", url: "https://example.test/image2.png", width: 800, height: 600, bytes: 2000, mime_type: "image/png" },
                ],
            },
        };
    }) as typeof axios.post;
    try {
        const settings = { ...defaultConfig, resolution: "2k", aspectRatio: "1:3", count: "4", apiKey: "legacy", baseUrl: "https://invalid.example", models: ["gpt-image-2"] };
        const images = await requestGeneration(settings, "poster", { signal: controller.signal });
        assert.deepEqual(
            images.map((image) => image.url),
            ["https://example.test/image1.png", "https://example.test/image2.png"],
        );
        assert.deepEqual(
            images.map((image) => image.storageKey),
            ["gen-1", "gen-2"],
        );
        assert.equal(posts, 1);
        assert.notEqual(images[0].id, images[1].id);
        for (const payload of [{ data: [] }, { data: [null] }, { error: { message: "quota exhausted" } }, "not-json"]) {
            axios.post = (async () => ({ data: payload })) as typeof axios.post;
            await assert.rejects(requestGeneration(settings, "poster"));
        }
        const lateController = new AbortController();
        axios.post = (async () => {
            lateController.abort();
            return { data: { success: true, data: [{ id: "gen-3", url: "https://example.test/image3.png", width: 100, height: 100, bytes: 10, mime_type: "image/png" }] } };
        }) as typeof axios.post;
        await assert.rejects(requestGeneration(settings, "poster", { signal: lateController.signal }), { name: "AbortError" });
        controller.abort();
        await assert.rejects(requestGeneration(settings, "poster", { signal: controller.signal }), { name: "AbortError" });
        assert.equal(posts, 1);
        account = "902";
        await assert.rejects(requestGeneration(settings, "poster"), /登录会话已失效/);
        assert.equal(posts, 1);
    } finally {
        globalThis.fetch = fetchBefore;
        axios.post = postBefore;
        globalThis.window = windowBefore;
        useUserStore.setState({ user: null });
    }
});

test("M8 编辑请求通过宿主认证调用 /api/canvas/images/edits，组装表单且失败不降级", async () => {
    const fetchBefore = globalThis.fetch;
    const postBefore = axios.post;
    const windowBefore = globalThis.window;
    const account = "901";
    useUserStore.setState({ user: { id: account, username: "test", displayName: "", avatarUrl: "" } });
    globalThis.window = { parent: { newApiCanvasHost: { getUser: () => ({ id: account }), getAuthHeaders: async () => ({ Authorization: "Bearer session" }), subscribe: () => () => {} } } } as unknown as Window & typeof globalThis;

    globalThis.fetch = (async (url) => {
        if (url === "/api/user/models") {
            return new Response(JSON.stringify({ success: true, data: ["gpt-image-2"] }));
        }
        if (typeof url === "string" && url.includes("ref-ok.png")) {
            return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), { headers: { "content-type": "image/png" } });
        }
        return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    let editPosts = 0;
    let postedFormData: FormData | null = null;
    axios.post = (async (url: unknown, body: unknown, options: unknown) => {
        editPosts++;
        assert.equal(url, "/api/canvas/images/edits");
        postedFormData = body as FormData;
        return {
            data: {
                success: true,
                data: [{ id: "edit-1", url: "https://example.test/edited.png", width: 512, height: 512, bytes: 5000, mime_type: "image/png" }],
            },
        };
    }) as typeof axios.post;

    try {
        const settings = { ...defaultConfig, ...defaultImageEditSettings, models: ["gpt-image-2"], apiKey: "legacy", baseUrl: "https://invalid.example" };
        const refImage = { id: "ref-1", name: "ref-ok.png", type: "image/png", dataUrl: "https://example.test/ref-ok.png", url: "https://example.test/ref-ok.png", storageKey: "ref-uuid-1" };

        const images = await requestEdit(settings, "make it cyber", [refImage]);
        assert.equal(editPosts, 1);
        assert.equal(images.length, 1);
        assert.equal(images[0].url, "https://example.test/edited.png");
        assert.equal(images[0].storageKey, "edit-1");

        assert.ok(postedFormData);
        const form = postedFormData as FormData;
        assert.equal(form.get("model"), "gpt-image-2");
        assert.equal(form.get("size"), "auto 1k");
        assert.ok((form.get("prompt") as string).includes("make it cyber"));
        assert.ok((form.get("prompt") as string).includes("参考图片编号"));

        // 参考图拉取失败时严格阻断，绝不调用出图接口
        const badRefImage = { id: "ref-bad", name: "bad.png", type: "image/png", dataUrl: "https://example.test/ref-bad.png", url: "https://example.test/ref-bad.png" };
        await assert.rejects(() => requestEdit(settings, "make it cyber", [badRefImage]), /参考图读取失败/);
        assert.equal(editPosts, 1, "参考图拉取失败不得发起接口调用");
    } finally {
        globalThis.fetch = fetchBefore;
        axios.post = postBefore;
        globalThis.window = windowBefore;
        useUserStore.setState({ user: null });
    }
});
