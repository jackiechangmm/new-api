import { useUserStore } from "@/stores/use-user-store";

type CanvasHost = { getAuthHeaders?: () => Promise<Record<string, string>> | Record<string, string> };

declare global { interface Window { newApiCanvasHost?: CanvasHost } }

export async function getCanvasAuthHeaders() {
    const parentWindow = window.parent as Window & { newApiCanvasHost?: CanvasHost };
    const host = window.newApiCanvasHost || (window.parent !== window ? parentWindow.newApiCanvasHost : undefined);
    return (await host?.getAuthHeaders?.()) || {};
}

export function setCanvasUser(user: { id: string; username?: string; displayName?: string; avatarUrl?: string } | null) {
    if (!user) return useUserStore.getState().clearSession();
    useUserStore.setState({ user: { id: user.id, username: user.username || "", displayName: user.displayName || "", avatarUrl: user.avatarUrl || "" } });
}
