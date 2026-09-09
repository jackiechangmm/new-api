import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { App } from "antd";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { buildNodeGenerationContext } from "@/components/canvas/canvas-node-generation";
import { buildGenerationConfig } from "@/lib/canvas/canvas-generation-helpers";
import { runCanvasImageGeneration } from "@/lib/canvas/image-generation";
import type { AiConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasConnection, type CanvasGenerationMode, type CanvasNodeData } from "@/types/canvas";

type Props = {
    projectId: string;
    config: AiConfig;
    nodes: CanvasNodeData[];
    nodesRef: RefObject<CanvasNodeData[]>;
    connectionsRef: RefObject<CanvasConnection[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
};
type Run = { controller: AbortController; targetId?: string };

export function useImageGeneration({ projectId, config, nodes, nodesRef, connectionsRef, setNodes, setConnections }: Props) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const runs = useRef(new Map<string, Run>());
    const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
    const stop = useCallback(
        (id: string) => {
            const entry = [...runs.current.entries()].find(([sourceId, run]) => sourceId === id || run.targetId === id);
            if (!entry) return;
            const [sourceId, run] = entry;
            run.controller.abort();
            runs.current.delete(sourceId);
            setRunningIds((current) => new Set([...current].filter((value) => value !== sourceId && value !== run.targetId)));
            setNodes((current) =>
                current.map((node) => {
                    if (node.id !== sourceId && node.id !== run.targetId) return node;
                    if (node.metadata?.status !== "loading") return node;
                    const errorDetails = t("common.requestCanceled");
                    return {
                        ...node,
                        metadata: {
                            ...node.metadata,
                            generationId: undefined,
                            status: node.metadata.content ? "success" : "error",
                            errorDetails,
                            images: node.metadata.images?.map((image) => (image.status === "loading" ? { ...image, status: "error", errorDetails } : image)),
                        },
                    };
                }),
            );
        },
        [setNodes, t],
    );

    useEffect(() => {
        const activeRuns = runs.current;
        return () => {
            activeRuns.forEach((run) => run.controller.abort());
            activeRuns.clear();
        };
    }, [projectId]);
    useEffect(() => {
        for (const [id, run] of runs.current) {
            if (!nodes.some((node) => node.id === id) || (run.targetId && !nodes.some((node) => node.id === run.targetId))) stop(id);
        }
    }, [nodes, stop]);

    const execute = useCallback(
        async (sourceId: string, prompt: string, retry?: { imageId?: string }) => {
            stop(sourceId);
            const source = nodesRef.current.find((node) => node.id === sourceId);
            if (!source) return;
            const controller = new AbortController();
            const run: Run = { controller };
            runs.current.set(sourceId, run);
            setRunningIds((current) => new Set(current).add(sourceId));
            try {
                const settings = buildGenerationConfig(config, source, "image");
                const context = buildNodeGenerationContext(sourceId, nodesRef.current, connectionsRef.current, prompt);
                if (retry ? source.metadata?.generationType === "edit" || Boolean(source.metadata?.references?.length) : Boolean(context.referenceImages.length || (source.type === CanvasNodeType.Image && source.metadata?.content)))
                    throw new Error(t("integration.referencesUnavailable"));
                if (retry?.imageId) settings.count = "1";
                const result = await runCanvasImageGeneration({
                    sourceId,
                    prompt: retry ? prompt : context.prompt,
                    config: settings,
                    signal: controller.signal,
                    retry,
                    getNodes: () => nodesRef.current,
                    setNodes,
                    addConnection: (fromNodeId, toNodeId) => setConnections((current) => [...current, { id: nanoid(), fromNodeId, toNodeId }]),
                    onTarget: (targetId) => {
                        run.targetId = targetId;
                        setRunningIds((current) => new Set(current).add(targetId));
                    },
                });
                if (result.received < result.requested) message.warning(t("integration.fewerImages", { actual: result.received, requested: result.requested }));
            } catch (error) {
                if (!controller.signal.aborted && !(error instanceof Error && error.name === "AbortError")) message.error(error instanceof Error ? error.message : t("canvas.projectPage.generationFailed"));
            } finally {
                if (runs.current.get(sourceId) === run) {
                    runs.current.delete(sourceId);
                    setRunningIds((current) => new Set([...current].filter((id) => id !== sourceId && id !== run.targetId)));
                }
            }
        },
        [config, connectionsRef, message, nodesRef, setConnections, setNodes, stop, t],
    );

    const generate = useCallback(
        async (nodeId: string, mode: CanvasGenerationMode, prompt: string) => {
            if (mode !== "image") {
                message.error(t("integration.unavailable"));
                return;
            }
            await execute(nodeId, prompt);
        },
        [execute, message, t],
    );
    const retry = useCallback(
        async (node: CanvasNodeData, imageId?: string) => {
            if (node.type !== CanvasNodeType.Image) {
                message.error(t("integration.unavailable"));
                return;
            }
            await execute(node.id, node.metadata?.prompt || "", { imageId });
        },
        [execute, message, t],
    );
    return { generate, retry, stop, runningIds };
}
