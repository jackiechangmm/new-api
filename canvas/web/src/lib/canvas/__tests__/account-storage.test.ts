import { test } from "node:test";
import assert from "node:assert/strict";
import { localForageStorage } from "@/lib/localforage-storage";
import { useUserStore } from "@/stores/use-user-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAssetStore } from "@/stores/use-asset-store";

test("身份确定前不恢复数据，延迟保存仍写入原账号而不是切换后的账号", async () => {
    assert.equal(useCanvasStore.getState().hydrated, false);
    assert.equal(useAssetStore.getState().hydrated, false);
    const original = { ...localForageStorage };
    const reads: string[] = [];
    const writes: Array<{ key: string; value: string }> = [];
    let saved!: () => void;
    const confirmation = new Promise<void>((resolve) => {
        saved = resolve;
    });
    localForageStorage.getItem = async (key) => {
        reads.push(key);
        return null;
    };
    localForageStorage.setItem = async (key, value) => {
        writes.push({ key, value });
        if (value.includes("A 的工程")) saved();
    };
    try {
        useUserStore.setState({ user: { id: "a", username: "a", displayName: "", avatarUrl: "" } });
        await Promise.all([useCanvasStore.persist.rehydrate(), useAssetStore.persist.rehydrate()]);
        assert.deepEqual(reads.sort(), ["infinite-canvas:asset_store:a", "infinite-canvas:canvas_store:a"]);
        useAssetStore.getState().addAsset({ kind: "text", title: "A 的资产", coverUrl: "", tags: [], data: { content: "private-a" } });
        useCanvasStore.getState().createProject("A 的工程");
        useUserStore.setState({ user: { id: "b", username: "b", displayName: "", avatarUrl: "" } });
        await confirmation;
        assert.ok(writes.some((write) => write.key === "infinite-canvas:canvas_store:a" && write.value.includes("A 的工程")));
        assert.ok(writes.some((write) => write.key === "infinite-canvas:asset_store:a" && write.value.includes("private-a")));
        assert.ok(writes.every((write) => write.key.endsWith(":a")));
    } finally {
        Object.assign(localForageStorage, original);
        useUserStore.getState().clearSession();
    }
});
