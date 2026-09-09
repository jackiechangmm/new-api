import { expect, test, type Page } from "@playwright/test";

const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
const pngBuffer = Buffer.from(pngBase64, "base64");

async function openCanvas(page: Page) {
    await page.route("**/api/user/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        const user = { id: 903, username: "canvas-m3", role: 100, group: "default" };
        if (path === "/api/user/auth/refresh") {
            await route.fulfill({
                json: {
                    success: true,
                    data: {
                        access_token: "canvas-session",
                        token_type: "Bearer",
                        access_expires_at: Math.floor(Date.now() / 1000) + 600,
                        user,
                        session: { sid: "m3", current: true, login_method: "password", ip: "", user_agent: "", created_at: 1, last_active_at: 1, expires_at: 4102444800 },
                    },
                },
            });
        } else {
            await route.fulfill({ json: { success: true, data: path === "/api/user/models" ? ["gpt-image-2"] : user } });
        }
    });
    await page.goto("/playground/canvas");
    const canvas = page.frameLocator('iframe[title="Infinite Canvas"]');
    await canvas.getByRole("button", { name: "新建画布", exact: true }).first().click();
    return canvas;
}

test("M3 本地导入图片上传至云端并获得稳定 UUID storageKey", async ({ page }) => {
    let uploadRequests = 0;
    let authHeader = "";

    await page.route("**/api/images", async (route) => {
        if (route.request().method() === "POST") {
            uploadRequests++;
            authHeader = route.request().headers().authorization || "";
            await route.fulfill({
                json: {
                    success: true,
                    data: {
                        id: "m3-cloud-uuid-8888",
                        url: "https://s3.example.test/images/903/m3-cloud-uuid-8888.png",
                        width: 800,
                        height: 600,
                        bytes: pngBuffer.length,
                        mime_type: "image/png",
                    },
                },
            });
            return;
        }
        await route.continue();
    });

    const canvas = await openCanvas(page);

    // 找到隐藏的图片上传文件输入框
    const fileInput = canvas.locator('input[type="file"][accept*="image"]');
    await fileInput.setInputFiles({
        name: "test-import.png",
        mimeType: "image/png",
        buffer: pngBuffer,
    });

    // 验证发出了服务端代理上传请求，且包含会话授权头
    await expect.poll(() => uploadRequests).toBe(1);
    expect(authHeader).toBe("Bearer canvas-session");

    // 验证画布中渲染了该公开 S3 资源
    await expect(canvas.locator('section img[src="https://s3.example.test/images/903/m3-cloud-uuid-8888.png"]')).toBeVisible();

    // 验证本地工程持久化数据中的节点 metadata 承载了该云端 UUID
    const child = page.frames().find((frame) => frame.parentFrame())!;
    await expect
        .poll(() =>
            child.evaluate(() =>
                new Promise<string | null>((resolve) => {
                    const req = indexedDB.open("infinite-canvas");
                    req.onsuccess = () => {
                        const db = req.result;
                        const read = db.transaction("app_state").objectStore("app_state").get("infinite-canvas:canvas_store:903");
                        read.onsuccess = () => {
                            if (!read.result) return resolve(null);
                            const persisted = JSON.parse(read.result);
                            const nodes = persisted.state.projects[0]?.nodes || [];
                            const imageNode = nodes.find((n: { type: string }) => n.type === "image");
                            resolve(imageNode?.metadata?.storageKey || null);
                            db.close();
                        };
                    };
                }),
            ),
        )
        .toBe("m3-cloud-uuid-8888");
});

test("M3 导入非图片或损坏文件时服务端拦截报错且不生成假身份", async ({ page }) => {
    let uploadRequests = 0;

    await page.route("**/api/images", async (route) => {
        if (route.request().method() === "POST") {
            uploadRequests++;
            await route.fulfill({
                status: 400,
                json: {
                    success: false,
                    message: "无效或损坏的图片文件，仅支持 JPEG/PNG/WebP 格式",
                },
            });
            return;
        }
        await route.continue();
    });

    const canvas = await openCanvas(page);

    const fileInput = canvas.locator('input[type="file"][accept*="image"]');
    await fileInput.setInputFiles({
        name: "corrupt.png",
        mimeType: "image/png",
        buffer: Buffer.from("this is definitely not a png"),
    });

    await expect.poll(() => uploadRequests).toBe(1);
    // 应该弹出错误提示
    await expect(canvas.getByText("无效或损坏的图片文件，仅支持 JPEG/PNG/WebP 格式").first()).toBeVisible();

    // 验证不产生假身份节点
    await expect(canvas.locator('section img[src*="s3.example.test"]')).toHaveCount(0);
});
