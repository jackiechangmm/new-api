import { useEffect, useState } from "react";
import { ArrowUp, Maximize2, Square } from "lucide-react";
import { Button, Modal, Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import { ModelPicker } from "@/components/model-picker";
import { buildGenerationConfig } from "@/lib/canvas/canvas-generation-helpers";
import { imageSettingsIssues } from "@/lib/canvas/image-models";
import { canvasCapabilities } from "@/lib/canvas/canvas-capabilities";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData } from "@/types/canvas";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { CanvasNodeReferenceBar } from "./canvas-node-reference-bar";

export type CanvasNodeGenerationMode = CanvasGenerationMode;
type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onStop: (nodeId: string) => void;
    mentionReferences?: CanvasResourceReference[];
    nodes: CanvasNodeData[];
    connectedNodes?: CanvasNodeData[];
    onDisconnectReference?: (fromNodeId: string, toNodeId: string) => void;
    onStartReferenceSelection?: (nodeId: string) => void;
    onImageSettingsOpenChange?: (open: boolean) => void;
    modeOverride?: CanvasNodeGenerationMode;
};

export function CanvasNodePromptPanel({
    node,
    nodes,
    isRunning,
    onPromptChange,
    onConfigChange,
    onGenerate,
    onStop,
    mentionReferences = [],
    connectedNodes = [],
    onDisconnectReference,
    onImageSettingsOpenChange,
    modeOverride,
}: CanvasNodePromptPanelProps) {
    const { t } = useTranslation();
    const globalConfig = useEffectiveConfig();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = modeOverride ?? (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Config ? "image" : "text");
    const config = buildGenerationConfig(globalConfig, node, "image");
    const issues = imageSettingsIssues(config, config.models);
    const [prompt, setPrompt] = useState(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
    const [expanded, setExpanded] = useState(false);
    useEffect(() => {
        setPrompt(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
        // 切换节点时恢复输入，生成回写不覆盖仍在编辑的提示词。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node.id]);
    if (!canvasCapabilities.generation || mode !== "image" || (node.type === CanvasNodeType.Image && node.metadata?.content)) return null;
    const updatePrompt = (value: string) => {
        setPrompt(value);
        onPromptChange(node.id, value);
    };
    const submit = () => {
        if (prompt.trim() && !isRunning && !issues.length) onGenerate(node.id, "image", prompt.trim());
    };
    return (
        <div
            data-canvas-no-zoom
            className="rounded-lg border p-3 shadow-xl"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            {issues.length ? (
                <div role="alert" className="mb-2 text-xs text-red-600">
                    {issues.join("\n")}
                </div>
            ) : null}
            <CanvasNodeReferenceBar nodeId={node.id} nodes={nodes} connectedNodes={connectedNodes} onDisconnect={onDisconnectReference} />
            <CanvasPromptChipInput
                value={prompt}
                references={mentionReferences}
                onChange={updatePrompt}
                onSubmit={submit}
                className="thin-scrollbar h-40 w-full resize-none rounded-md px-3 py-2 text-sm outline-none"
                style={{ background: "transparent", color: theme.node.text }}
                placeholder={t("canvas.promptPanel.image")}
            />
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                <Tooltip title={t("canvas.promptPanel.expandEditor")}>
                    <Button type="text" className="!h-8 !w-8 !p-0" icon={<Maximize2 className="size-4" />} onClick={() => setExpanded(true)} aria-label={t("canvas.promptPanel.expandEditor")} />
                </Tooltip>
                <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="image" className="max-w-[190px]" />
                <CanvasImageSettingsPopover config={config} onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) } : { [key]: value })} onOpenChange={onImageSettingsOpenChange} />
                <Button
                    type="primary"
                    className="!ml-auto !h-9 !w-9 !p-0"
                    danger={isRunning}
                    disabled={!isRunning && (!prompt.trim() || issues.length > 0)}
                    onClick={() => (isRunning ? onStop(node.id) : submit())}
                    aria-label={t(isRunning ? "canvas.promptPanel.stopGeneration" : "canvas.promptPanel.generate")}
                    icon={isRunning ? <Square className="size-4" /> : <ArrowUp className="size-4" />}
                />
            </div>
            <Modal title={t("canvas.promptPanel.editorTitle")} open={expanded} centered width={760} footer={null} onCancel={() => setExpanded(false)} destroyOnHidden>
                <CanvasPromptChipInput value={prompt} references={mentionReferences} onChange={updatePrompt} className="thin-scrollbar h-[52dvh] w-full rounded-md border p-4 text-sm outline-none" placeholder={t("canvas.promptPanel.image")} />
            </Modal>
        </div>
    );
}
