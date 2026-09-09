import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import localforage from "localforage";
import { cleanupUnusedImages } from "../image-storage";
import { useUserStore } from "@/stores/use-user-store";

test("清理当前账号未引用图片时保留其他账号和历史匿名图片", async () => {
    const store = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
    const keys = ["image:referenced:b", "image:unused:b", "image:private:a", "image:legacy:anonymous"];
    try {
        for (const key of keys) await store.setItem(key, new Blob(["image"]));
        useUserStore.setState({ user: { id: "b", username: "b", displayName: "", avatarUrl: "" } });
        await cleanupUnusedImages({ storageKey: "image:referenced:b" });
        assert.deepEqual((await store.keys()).sort(), ["image:legacy:anonymous", "image:private:a", "image:referenced:b"]);
    } finally {
        for (const key of keys) await store.removeItem(key);
        useUserStore.getState().clearSession();
    }
});
