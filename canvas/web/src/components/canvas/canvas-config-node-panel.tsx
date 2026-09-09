import { Play, Settings2, Square } from "lucide-react";
import { Button, Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import { ModelPicker } from "@/components/model-picker";
import { buildGenerationConfig } from "@/lib/canvas/canvas-generation-helpers";
import { imageSettingsIssues } from "@/lib/canvas/image-models";
import { canvasCapabilities } from "@/lib/canvas/canvas-capabilities";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

type CanvasConfigNodePanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    inputSummary: { textCount: number; imageCount: number; videoCount: number; audioCount: number };
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (nodeId: string) => void;
    onStop: (nodeId: string) => void;
    onComposerToggle: () => void;
};

export function CanvasConfigNodePanel({ node, isRunning, inputSummary, onConfigChange, onGenerate, onStop, onComposerToggle }: CanvasConfigNodePanelProps) {
    const { t } = useTranslation();
    const config = buildGenerationConfig(useEffectiveConfig(), node, "image");
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const issues = imageSettingsIssues(config, config.models);
    const hasPrompt = Boolean((node.metadata?.composerContent ?? node.metadata?.prompt ?? "").trim()) || inputSummary.textCount > 0;
    if (!canvasCapabilities.generation) return null;
    return (
        <div className="flex h-full min-w-0 flex-col gap-2 px-3 pb-3 pt-7 text-sm" style={{ color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{t("canvas.configNode.title")}</span>
                <Tooltip title={t("canvas.configNode.compose")}>
                    <Button type="text" size="small" icon={<Settings2 className="size-4" />} aria-label={t("canvas.configNode.compose")} onMouseDown={(event) => event.stopPropagation()} onClick={onComposerToggle} />
                </Tooltip>
            </div>
            <div className="text-xs" style={{ color: theme.node.muted }}>
                {t("canvas.configNode.prompt")}: {t("canvas.configNode.items", { count: inputSummary.textCount })}
            </div>
            {issues.length ? (
                <div role="alert" className="max-h-16 overflow-auto text-xs text-red-600">
                    {issues.join("\n")}
                </div>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-center gap-2" onMouseDown={(event) => event.stopPropagation()}>
                <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="image" className="h-9 max-w-full" />
                <CanvasImageSettingsPopover config={config} placement="topRight" onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) } : { [key]: value })} />
            </div>
            <Button
                type="primary"
                className="mt-auto !h-9 !w-full !rounded-md"
                danger={isRunning}
                disabled={!isRunning && (!hasPrompt || issues.length > 0)}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => (isRunning ? onStop(node.id) : onGenerate(node.id))}
                icon={isRunning ? <Square className="size-4" /> : <Play className="size-4" />}
            >
                {t(isRunning ? "canvas.configNode.stop" : "canvas.configNode.generate")}
            </Button>
        </div>
    );
}
