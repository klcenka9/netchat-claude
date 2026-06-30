import { create } from 'zustand';
import { api } from '../api/http';

export interface ReadState {
  channel_id: string | null;
  dm_channel_id: string | null;
  last_read_message: string;
}

export type NotificationLevel = 'all' | 'mentions' | 'none';
export interface NotificationSetting {
  scope_type: 'server' | 'channel';
  scope_id: string;
  level: NotificationLevel;
}

interface ReadStateStore {
  // Last message id we've read, keyed by channelId / dmChannelId.
  channelRead: Record<string, string>;
  dmRead: Record<string, string>;
  // Latest message id seen in each channel/dm (drives the unread comparison).
  channelLatest: Record<string, string>;
  dmLatest: Record<string, string>;
  notificationSettings: NotificationSetting[];
  load: () => Promise<void>;
  loadNotificationSettings: () => Promise<void>;
  setNotificationLevel: (
    scopeType: 'server' | 'channel',
    scopeId: string,
    level: NotificationLevel,
  ) => Promise<void>;
  noteLatestChannel: (channelId: string, messageId: string) => void;
  noteLatestDm: (dmChannelId: string, messageId: string) => void;
  markChannelRead: (channelId: string, messageId: string) => Promise<void>;
  markDmRead: (dmChannelId: string, messageId: string) => Promise<void>;
  isChannelUnread: (channelId: string) => boolean;
  isDmUnread: (dmChannelId: string) => boolean;
  levelFor: (serverId: string | null, channelId: string) => NotificationLevel;
}

export const useReadStateStore = create<ReadStateStore>((set, get) => ({
  channelRead: {},
  dmRead: {},
  channelLatest: {},
  dmLatest: {},
  notificationSettings: [],

  async load() {
    const rows = await api<ReadState[]>('/read-state');
    const channelRead: Record<string, string> = {};
    const dmRead: Record<string, string> = {};
    for (const r of rows) {
      if (r.channel_id) channelRead[r.channel_id] = r.last_read_message;
      if (r.dm_channel_id) dmRead[r.dm_channel_id] = r.last_read_message;
    }
    set({ channelRead, dmRead });
  },

  async loadNotificationSettings() {
    set({ notificationSettings: await api<NotificationSetting[]>('/notification-settings') });
  },

  async setNotificationLevel(scopeType, scopeId, level) {
    await api('/notification-settings', {
      method: 'PUT',
      json: { scope_type: scopeType, scope_id: scopeId, level },
    });
    set((s) => {
      const others = s.notificationSettings.filter(
        (n) => !(n.scope_type === scopeType && n.scope_id === scopeId),
      );
      return { notificationSettings: [...others, { scope_type: scopeType, scope_id: scopeId, level }] };
    });
  },

  noteLatestChannel(channelId, messageId) {
    set((s) => {
      const cur = s.channelLatest[channelId];
      if (cur && cur >= messageId) return s;
      return { channelLatest: { ...s.channelLatest, [channelId]: messageId } };
    });
  },

  noteLatestDm(dmChannelId, messageId) {
    set((s) => {
      const cur = s.dmLatest[dmChannelId];
      if (cur && cur >= messageId) return s;
      return { dmLatest: { ...s.dmLatest, [dmChannelId]: messageId } };
    });
  },

  async markChannelRead(channelId, messageId) {
    set((s) => ({ channelRead: { ...s.channelRead, [channelId]: messageId } }));
    try {
      await api('/read-state', { method: 'PUT', json: { channelId, lastReadMessage: messageId } });
    } catch {
      /* ignore */
    }
  },

  async markDmRead(dmChannelId, messageId) {
    set((s) => ({ dmRead: { ...s.dmRead, [dmChannelId]: messageId } }));
    try {
      await api('/read-state', { method: 'PUT', json: { dmChannelId, lastReadMessage: messageId } });
    } catch {
      /* ignore */
    }
  },

  isChannelUnread(channelId) {
    const s = get();
    const latest = s.channelLatest[channelId];
    if (!latest) return false;
    const read = s.channelRead[channelId];
    return !read || latest > read;
  },

  isDmUnread(dmChannelId) {
    const s = get();
    const latest = s.dmLatest[dmChannelId];
    if (!latest) return false;
    const read = s.dmRead[dmChannelId];
    return !read || latest > read;
  },

  // Channel-level override wins over server-level; default to 'all'.
  levelFor(serverId, channelId) {
    const settings = get().notificationSettings;
    const ch = settings.find((n) => n.scope_type === 'channel' && n.scope_id === channelId);
    if (ch) return ch.level;
    if (serverId) {
      const srv = settings.find((n) => n.scope_type === 'server' && n.scope_id === serverId);
      if (srv) return srv.level;
    }
    return 'all';
  },
}));
