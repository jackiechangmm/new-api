import { useUserStore } from "@/stores/use-user-store";

type CanvasHost = { getAuthHeaders?: () => Promise<Record<string, string>> | Record<string, string> };

declare global { interface Window { newApiCanvasHost?: CanvasHost } }

export async function getCanvasAuthHeaders() {
    return (await window.newApiCanvasHost?.getAuthHeaders?.()) || {};
}

export function setCanvasUser(user: { id: string; username?: string; displayName?: string; avatarUrl?: string } | null) {
    if (!user) return useUserStore.getState().clearSession();
    useUserStore.setState({ user: { id: user.id, username: user.username || "", displayName: user.displayName || "", avatarUrl: user.avatarUrl || "" } });
}
