import { test } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { defaultConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { requestGeneration } from "@/services/api/image";

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
        assert.equal(url, "/v1/images/generations");
        assert.deepEqual(body, { model: "gpt-image-2", prompt: "poster", size: "1:3 2k", quality: "low", n: 4, response_format: "b64_json", output_format: "png" });
        assert.deepEqual(options, { headers: { Authorization: "Bearer session" }, signal: controller.signal });
        return { data: { data: [{ b64_json: "YWJj" }, { url: "https://example.test/image.png" }] } };
    }) as typeof axios.post;
    try {
        const settings = { ...defaultConfig, resolution: "2k", aspectRatio: "1:3", count: "4", apiKey: "legacy", baseUrl: "https://invalid.example", models: ["gpt-image-2"] };
        const images = await requestGeneration(settings, "poster", { signal: controller.signal });
        assert.deepEqual(
            images.map((image) => image.dataUrl),
            ["data:image/png;base64,YWJj", "https://example.test/image.png"],
        );
        assert.equal(posts, 1);
        assert.notEqual(images[0].id, images[1].id);
        for (const payload of [{ data: [] }, { data: [null] }, { data: [{ url: "javascript:alert(1)" }] }, { error: { message: "quota exhausted" } }, "not-json"]) {
            axios.post = (async () => ({ data: payload })) as typeof axios.post;
            await assert.rejects(requestGeneration(settings, "poster"));
        }
        const lateController = new AbortController();
        axios.post = (async () => {
            lateController.abort();
            return { data: { data: [{ b64_json: "YWJj" }] } };
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
