import i18n from "@/i18n";

export type ImageSettings = {
    model: string;
    resolution?: string;
    aspectRatio?: string;
    quality: string;
    size: string;
    background: string;
    count: string;
};

export type ImageOperation = {
    sizing: { kind: "resolution-ratio"; resolutions: readonly string[]; aspectRatios: readonly string[] };
    qualities?: readonly string[];
    backgrounds?: readonly string[];
    maxOutputs: number;
    defaults: ImageSettings;
};

export type CanvasImageModel = {
    model: string;
    protocol: "openai-image";
    operations: { generation?: ImageOperation; edit?: ImageOperation };
};

export const defaultImageSettings: ImageSettings = {
    model: "gpt-image-2",
    resolution: "1k",
    aspectRatio: "1:1",
    quality: "low",
    size: "",
    background: "",
    count: "1",
};

// 此处仅维护已接入的画布模型，不继承作图广场名单或上游渠道配置。
export const canvasImageModels: readonly CanvasImageModel[] = [
    {
        model: "gpt-image-2",
        protocol: "openai-image",
        operations: {
            generation: {
                sizing: {
                    kind: "resolution-ratio",
                    resolutions: ["1k", "2k", "4k"],
                    aspectRatios: ["auto", "1:1", "1:3", "3:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"],
                },
                qualities: ["low", "medium"],
                maxOutputs: 4,
                defaults: defaultImageSettings,
            },
        },
    },
];

export function getCanvasImageModel(model: string) {
    return canvasImageModels.find((item) => item.model === model);
}

export function filterCanvasImageModels(available: readonly string[]) {
    return canvasImageModels.filter((item) => available.includes(item.model)).map((item) => item.model);
}

export function imageSettingsIssues(settings: ImageSettings, available: readonly string[], operation: "generation" | "edit" = "generation") {
    const issues: string[] = [];
    const model = getCanvasImageModel(settings.model);
    if (!model || !available.includes(settings.model)) issues.push(i18n.t("integration.modelUnavailable", { model: settings.model }));
    const capability = model?.operations[operation];
    if (!capability) {
        if (model) issues.push(i18n.t("integration.unavailable"));
        return issues;
    }
    const invalid: string[] = [];
    if (!capability.sizing.resolutions.includes(settings.resolution || "")) invalid.push(i18n.t("settingsPanels.image.resolution"));
    if (!capability.sizing.aspectRatios.includes(settings.aspectRatio || "")) invalid.push(i18n.t("settingsPanels.image.aspectRatio"));
    if (settings.size) invalid.push(i18n.t("settingsPanels.image.size"));
    if (capability.qualities ? !capability.qualities.includes(settings.quality) : Boolean(settings.quality)) invalid.push(i18n.t("settingsPanels.image.quality"));
    if (settings.background && !capability.backgrounds?.includes(settings.background)) invalid.push(i18n.t("settingsPanels.image.transparent"));
    const count = Number(settings.count);
    if (!Number.isInteger(count) || count < 1 || count > capability.maxOutputs) invalid.push(i18n.t("settingsPanels.image.count"));
    if (invalid.length) issues.push(i18n.t("integration.invalidSettings", { fields: invalid.join("、") }));
    return issues;
}

export function resolveImageSettings(global: ImageSettings, node?: Partial<Omit<ImageSettings, "count">> & { count?: number | string }): ImageSettings {
    const legacySize = Boolean(node?.size && !node.resolution && !node.aspectRatio);
    return {
        model: node?.model ?? global.model,
        resolution: node?.resolution ?? (legacySize ? undefined : global.resolution),
        aspectRatio: node?.aspectRatio ?? (legacySize ? undefined : global.aspectRatio),
        quality: node?.quality ?? global.quality,
        size: node?.size ?? global.size,
        background: node?.background ?? global.background,
        count: String(node?.count ?? global.count),
    };
}

export function switchImageModel(current: ImageSettings, model: string) {
    const capability = getCanvasImageModel(model)?.operations.generation;
    if (!capability) throw new Error(i18n.t("integration.modelUnavailable", { model }));
    const settings = { ...current, model };
    const adjusted: (keyof ImageSettings)[] = [];
    const allowed: Partial<Record<keyof ImageSettings, readonly string[]>> = {
        resolution: capability.sizing.resolutions,
        aspectRatio: capability.sizing.aspectRatios,
        quality: capability.qualities || [""],
        background: capability.backgrounds ? ["", ...capability.backgrounds] : [""],
        size: [""],
    };
    for (const key of Object.keys(allowed) as (keyof typeof allowed)[]) {
        if (!allowed[key]!.includes(current[key] ?? "")) {
            settings[key] = capability.defaults[key] as string;
            adjusted.push(key);
        }
    }
    if (!Number.isInteger(Number(current.count)) || Number(current.count) < 1 || Number(current.count) > capability.maxOutputs) {
        settings.count = capability.defaults.count;
        adjusted.push("count");
    }
    return { settings, adjusted };
}

export function buildCanvasImageRequest(settings: ImageSettings, prompt: string, available: readonly string[]) {
    const issues = imageSettingsIssues(settings, available);
    if (issues.length) throw new Error(issues.join("\n"));
    if (!prompt.trim()) throw new Error(i18n.t("integration.promptRequired"));
    return {
        model: settings.model,
        prompt: prompt.trim(),
        n: Number(settings.count),
        size: `${settings.aspectRatio} ${settings.resolution}`,
        ...(settings.quality ? { quality: settings.quality } : {}),
        ...(settings.background ? { background: settings.background } : {}),
        response_format: "b64_json",
        output_format: "png",
    };
}
