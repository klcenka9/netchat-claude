import type { Message } from '../store/chatStore';
import { useServerStore } from '../store/serverStore';
import { useAuthStore } from '../store/authStore';

// Opt-in browser notification permission request.
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const res = await Notification.requestPermission();
  return res === 'granted';
}

export function notificationsEnabled(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

// Does this message mention the current user (directly, via @everyone/@here, or a held role)?
export function mentionsMe(m: Message, serverId: string | null): boolean {
  const meId = useAuthStore.getState().me?.id;
  if (!meId) return false;
  if (m.author?.id === meId) return false;
  let myRoleIds: Set<string> = new Set();
  if (serverId) {
    const member = (useServerStore.getState().members[serverId] ?? []).find(
      (x) => x.user_id === meId,
    );
    myRoleIds = new Set(member?.roleIds ?? []);
  }
  return m.mentions.some((mn) => {
    if (mn.mentioned_type === 'everyone' || mn.mentioned_type === 'here') return true;
    if (mn.mentioned_type === 'user') return mn.mentioned_id === meId;
    if (mn.mentioned_type === 'role') return !!mn.mentioned_id && myRoleIds.has(mn.mentioned_id);
    return false;
  });
}

export function fireNotification(title: string, body: string) {
  if (!notificationsEnabled() || !document.hidden) return;
  try {
    new Notification(title, { body });
  } catch {
    /* ignore */
  }
}
