import { test } from "node:test";
import assert from "node:assert/strict";
import { localForageStorage } from "@/lib/localforage-storage";
import { useUserStore } from "@/stores/use-user-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAssetStore } from "@/stores/use-asset-store";

test("身份确定前不恢复数据，数字资产写入原账号，画布工程不再写入 localForage", async () => {
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
        if (value.includes("private-a")) saved();
    };
    try {
        useUserStore.setState({ user: { id: "a", username: "a", displayName: "", avatarUrl: "" } });
        await useAssetStore.persist.rehydrate();
        assert.deepEqual(reads.sort(), ["infinite-canvas:asset_store:a"]);
        useAssetStore.getState().addAsset({ kind: "text", title: "A 的资产", coverUrl: "", tags: [], data: { content: "private-a" } });
        useUserStore.setState({ user: { id: "b", username: "b", displayName: "", avatarUrl: "" } });
        await confirmation;
        assert.ok(writes.some((write) => write.key === "infinite-canvas:asset_store:a" && write.value.includes("private-a")));
        assert.ok(!writes.some((write) => write.key.includes("canvas_store")));
        assert.ok(writes.every((write) => write.key.endsWith(":a")));
    } finally {
        Object.assign(localForageStorage, original);
        useUserStore.getState().clearSession();
    }
});
