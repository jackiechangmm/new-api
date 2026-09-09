import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button, ConfigProvider, Switch, Tooltip } from "antd";
import i18n from "@/i18n";
import type { CanvasTheme } from "@/lib/canvas-theme";
import { getCanvasImageModel, imageSettingsIssues, type ImageSettings } from "@/lib/canvas/image-models";
import type { AiConfig } from "@/stores/use-config-store";

export const imageQualityOptions = ["low", "medium"].map((value) => ({
    value,
    get label() {
        return imageQualityLabel(value);
    },
}));
export const imageAspectOptions = getCanvasImageModel("gpt-image-2")!.operations.generation!.sizing.aspectRatios.map((value) => ({ value, label: value }));
export const imageScaleOptions = getCanvasImageModel("gpt-image-2")!.operations.generation!.sizing.resolutions.map((value) => ({ value, label: value }));

type ImageSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: keyof ImageSettings, value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
    maxCount?: number;
    quickCount?: number;
};

export function ImageSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "space-y-4" }: ImageSettingsPanelProps) {
    const { t } = useTranslation();
    const operation = getCanvasImageModel(config.model)?.operations.generation;
    const issues = imageSettingsIssues(config, config.models);
    return (
        <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
                {showTitle ? <h3 className="text-sm font-semibold">{t("settingsPanels.image.title")}</h3> : <span />}
                {operation ? (
                    <Tooltip title={t("integration.resetSettings")}>
                        <Button
                            type="text"
                            size="small"
                            aria-label={t("integration.resetSettings")}
                            icon={<RotateCcw className="size-4" />}
                            onClick={() => {
                                for (const [key, value] of Object.entries(operation.defaults)) {
                                    if (key !== "model") onConfigChange(key as keyof ImageSettings, value || "");
                                }
                            }}
                        />
                    </Tooltip>
                ) : null}
            </div>
            {issues.length ? (
                <div role="alert" className="text-xs leading-5 text-red-600 dark:text-red-400">
                    {issues.join("\n")}
                    {config.size ? (
                        <div>
                            {t("settingsPanels.image.size")}: {config.size}
                        </div>
                    ) : null}
                </div>
            ) : null}
            {operation ? (
                <>
                    {operation.qualities ? (
                        <fieldset className="min-w-0 space-y-2">
                            <legend className="mb-2 text-xs" style={{ color: theme.node.muted }}>
                                {t("settingsPanels.image.quality")}
                            </legend>
                            <div className="grid grid-cols-2 gap-2">
                                {operation.qualities.map((value) => (
                                    <SettingOption key={value} selected={config.quality === value} theme={theme} onClick={() => onConfigChange("quality", value)} label={imageQualityLabel(value)} />
                                ))}
                            </div>
                        </fieldset>
                    ) : null}
                    <fieldset className="min-w-0 space-y-2">
                        <legend className="mb-2 text-xs" style={{ color: theme.node.muted }}>
                            {t("settingsPanels.image.resolution")}
                        </legend>
                        <div className="grid grid-cols-3 gap-2">
                            {operation.sizing.resolutions.map((value) => (
                                <SettingOption key={value} selected={config.resolution === value} theme={theme} onClick={() => onConfigChange("resolution", value)} label={value.toUpperCase()} />
                            ))}
                        </div>
                    </fieldset>
                    <fieldset className="min-w-0 space-y-2">
                        <legend className="mb-2 text-xs" style={{ color: theme.node.muted }}>
                            {t("settingsPanels.image.aspectRatio")}
                        </legend>
                        <div className="grid grid-cols-4 gap-2">
                            {operation.sizing.aspectRatios.map((value) => (
                                <SettingOption key={value} selected={config.aspectRatio === value} theme={theme} onClick={() => onConfigChange("aspectRatio", value)} label={value === "auto" ? t("settingsPanels.common.auto") : value} />
                            ))}
                        </div>
                    </fieldset>
                    {operation.backgrounds?.includes("transparent") ? (
                        <label className="flex items-center justify-between gap-3 text-xs">
                            {t("settingsPanels.image.transparent")}
                            <Switch size="small" checked={config.background === "transparent"} onChange={(checked) => onConfigChange("background", checked ? "transparent" : "")} />
                        </label>
                    ) : null}
                    <fieldset className="min-w-0 space-y-2">
                        <legend className="mb-2 text-xs" style={{ color: theme.node.muted }}>
                            {t("settingsPanels.image.count")}
                        </legend>
                        <input
                            aria-label={t("settingsPanels.image.count")}
                            type="number"
                            min={1}
                            max={operation.maxOutputs}
                            step={1}
                            value={config.count}
                            onChange={(event) => onConfigChange("count", event.target.value)}
                            className="h-9 w-full rounded-md border bg-transparent px-3"
                            style={{ borderColor: theme.node.stroke }}
                        />
                    </fieldset>
                </>
            ) : null}
        </div>
    );
}

export function ImageSettingsTheme({ theme, children }: { theme: CanvasTheme; children: ReactNode }) {
    return (
        <ConfigProvider
            theme={{
                token: { colorBgContainer: theme.toolbar.panel, colorBgElevated: theme.toolbar.panel, colorBorder: theme.node.stroke, colorPrimary: theme.node.activeStroke, colorText: theme.node.text, colorTextLightSolid: theme.node.panel },
                components: {
                    Button: { defaultBg: theme.toolbar.panel, defaultBorderColor: theme.node.stroke, defaultColor: theme.node.text },
                    Slider: { railBg: theme.node.stroke, railHoverBg: theme.node.stroke, trackBg: theme.node.activeStroke, handleColor: theme.node.text, handleActiveColor: theme.node.text },
                },
            }}
        >
            {children}
        </ConfigProvider>
    );
}

function SettingOption({ selected, theme, onClick, label }: { selected: boolean; theme: CanvasTheme; onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            className="h-9 min-w-0 cursor-pointer rounded-md border px-1 text-xs"
            style={{ borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text, background: selected ? theme.node.fill : "transparent" }}
            onClick={onClick}
        >
            {label}
        </button>
    );
}

export function imageQualityLabel(value: string) {
    return ["auto", "high", "medium", "low"].includes(value) ? i18n.t(`settingsPanels.common.${value}`) : value;
}

export function imageSizeLabel(size: string) {
    return size === "auto" ? i18n.t("settingsPanels.common.auto") : size;
}
