import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCanvasImageRequest, defaultImageSettings, filterCanvasImageModels, imageSettingsIssues, resolveImageSettings, switchImageModel } from "../image-models";

test("受控模型交集与 image2 语义尺寸请求，不发送透明背景或旧渠道配置", () => {
    assert.deepEqual(filterCanvasImageModels(["gpt-image-2", "gpt-image-2", "nano-banana-2", "unknown"]), ["gpt-image-2"]);
    assert.deepEqual(buildCanvasImageRequest({ ...defaultImageSettings, resolution: "2k", aspectRatio: "1:3", count: "4" }, " 海报 ", ["gpt-image-2"]), {
        model: "gpt-image-2",
        prompt: "海报",
        size: "1:3 2k",
        quality: "low",
        n: 4,
        response_format: "b64_json",
        output_format: "png",
    });
});

test("拒绝旧工程失效参数与非法数量，不修改输入、不静默换模型", () => {
    for (const patch of [
        { model: "default::gpt-image-2" },
        { quality: "high" },
        { background: "transparent" },
        { size: "1024x1024" },
        { aspectRatio: "1:8" },
        { resolution: "512" },
        ...["0", "-1", "1.5", "5", "NaN", "Infinity"].map((count) => ({ count })),
    ]) {
        const settings = { ...defaultImageSettings, ...patch };
        const snapshot = { ...settings };
        assert.throws(() => buildCanvasImageRequest(settings, "prompt", ["gpt-image-2"]));
        assert.deepEqual(settings, snapshot);
    }
    assert.throws(() => buildCanvasImageRequest(defaultImageSettings, "prompt", []));
    assert.throws(() => buildCanvasImageRequest(defaultImageSettings, "  ", ["gpt-image-2"]));
    assert.ok(imageSettingsIssues(defaultImageSettings, ["gpt-image-2"], "edit").length);
    const legacy = resolveImageSettings(defaultImageSettings, { model: "removed-model", size: "1536x1024", count: 0 });
    assert.equal(legacy.model, "removed-model");
    assert.equal(legacy.count, "0");
    assert.equal(legacy.size, "1536x1024");
    assert.equal(legacy.resolution, undefined);
    assert.equal(legacy.aspectRatio, undefined);
    const resolvedLegacySupported = resolveImageSettings(defaultImageSettings, { model: "gpt-image-2", size: "1024x1024" });
    assert.equal(resolvedLegacySupported.model, "gpt-image-2");
    assert.equal(resolvedLegacySupported.size, "");
    assert.equal(resolvedLegacySupported.resolution, "1k");
    assert.equal(resolvedLegacySupported.aspectRatio, "1:1");
    assert.equal(imageSettingsIssues(resolvedLegacySupported, ["gpt-image-2"]).length, 0);
});

test("主动切换保留兼容选择，调整无效值并列出调整字段", () => {
    const original = { ...defaultImageSettings, model: "old-model", resolution: "2k", aspectRatio: "1:8", quality: "high", background: "transparent", count: "8" };
    const result = switchImageModel(original, "gpt-image-2");
    assert.deepEqual(result.settings, { ...defaultImageSettings, resolution: "2k" });
    assert.deepEqual(result.adjusted, ["aspectRatio", "quality", "background", "count"]);
    assert.equal(original.aspectRatio, "1:8");
    assert.throws(() => switchImageModel(original, "unknown"));
});
