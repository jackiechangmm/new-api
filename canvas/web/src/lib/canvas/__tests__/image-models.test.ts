import { test } from "node:test";
import assert from "node:assert/strict";
import {
    auxiliaryTextIssues,
    buildCanvasImageEditRequest,
    buildCanvasImageRequest,
    DEFAULT_AUXILIARY_TEXT_MODEL,
    defaultImageEditSettings,
    defaultImageSettings,
    filterCanvasAuxiliaryTextModels,
    filterCanvasImageModels,
    imageSettingsIssues,
    resolveAuxiliaryTextModel,
    resolveImageSettings,
    switchImageModel,
} from "../image-models";

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

test("M8 编辑操作受控校验：默认 auto 1k、支持 1~3 张参考图、阻断超限与非法参数", () => {
    assert.deepEqual(buildCanvasImageEditRequest(defaultImageEditSettings, " 修改图片 ", ["gpt-image-2"], 1), {
        model: "gpt-image-2",
        prompt: "修改图片",
        size: "auto 1k",
        quality: "low",
        n: 1,
        response_format: "b64_json",
        output_format: "png",
    });

    assert.deepEqual(buildCanvasImageEditRequest({ ...defaultImageEditSettings, resolution: "2k", aspectRatio: "16:9", count: "2" }, "换风格", ["gpt-image-2"], 3), {
        model: "gpt-image-2",
        prompt: "换风格",
        size: "16:9 2k",
        quality: "low",
        n: 2,
        response_format: "b64_json",
        output_format: "png",
    });

    for (const count of [1, 2, 3]) {
        assert.equal(imageSettingsIssues(defaultImageEditSettings, ["gpt-image-2"], "edit", count).length, 0);
    }

    for (const count of [0, 4, -1]) {
        assert.throws(() => buildCanvasImageEditRequest(defaultImageEditSettings, "修改", ["gpt-image-2"], count));
        const issues = imageSettingsIssues(defaultImageEditSettings, ["gpt-image-2"], "edit", count);
        assert.ok(issues.length > 0);
        assert.ok(issues.some((msg) => msg.includes("参考图")));
    }

    assert.throws(() => buildCanvasImageEditRequest({ ...defaultImageEditSettings, aspectRatio: "1:8" }, "修改", ["gpt-image-2"], 1));
    assert.throws(() => buildCanvasImageEditRequest(defaultImageEditSettings, "  ", ["gpt-image-2"], 1));

    const resolvedEdit = resolveImageSettings(defaultImageSettings, {}, "edit");
    assert.equal(resolvedEdit.aspectRatio, "auto");
    assert.equal(resolvedEdit.resolution, "1k");
    assert.equal(imageSettingsIssues(resolvedEdit, ["gpt-image-2"], "edit", 1).length, 0);
});

test("M9 辅助文本受控候选名单固定为 gpt-5.6-terra，支持权限交集与可用性探测", () => {
    assert.equal(DEFAULT_AUXILIARY_TEXT_MODEL, "gpt-5.6-terra");
    assert.deepEqual(filterCanvasAuxiliaryTextModels(["gpt-5.6-terra", "gpt-4o", "other"]), ["gpt-5.6-terra"]);
    assert.deepEqual(filterCanvasAuxiliaryTextModels(["gpt-image-2"]), []);
    assert.equal(resolveAuxiliaryTextModel(["gpt-5.6-terra", "gpt-image-2"]), "gpt-5.6-terra");
    assert.equal(resolveAuxiliaryTextModel(["other-model"]), undefined);
    assert.deepEqual(auxiliaryTextIssues(["gpt-5.6-terra"]), []);
    assert.ok(auxiliaryTextIssues(["gpt-image-2"]).length > 0);
    assert.ok(auxiliaryTextIssues([]).some((msg) => msg.includes("gpt-5.6-terra")));
});

