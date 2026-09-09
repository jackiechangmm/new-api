import i18n from "@/i18n";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export const canvasCapabilities = {
    generation: true,
    imageEditing: false,
    auxiliaryText: false,
    video: false,
    audio: false,
    plugins: false,
    agent: false,
    externalPrompts: false,
    projectTransfer: false,
    externalConfig: false,
};

export function requireCanvasCapability(capability: keyof typeof canvasCapabilities) {
    if (!canvasCapabilities[capability]) throw new Error(i18n.t("integration.unavailable"));
}

export function isCanvasNodeAllowed(type: string) {
    return [CanvasNodeType.Image, CanvasNodeType.Text, CanvasNodeType.Config, CanvasNodeType.Group].some((allowed) => allowed === type);
}

export function assertCanvasNodesAllowed(nodes: CanvasNodeData[]) {
    if (nodes.some((node) => !isCanvasNodeAllowed(node.type) || (node.metadata?.generationMode && node.metadata.generationMode !== "image"))) {
        throw new Error(i18n.t("integration.unsupportedProject"));
    }
}
