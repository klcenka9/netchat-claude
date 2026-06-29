import { create } from 'zustand';
import { api } from '../api/http';

export interface Message {
  id: string;
  channelId: string;
  author: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  webhook: { id: string; name: string; avatar_url: string | null } | null;
  content: string | null;
  contentHtml: string;
  embed: {
    url: string;
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
  } | null;
  attachments: { id: string; url: string; filename: string; mime_type: string; size_bytes: number }[];
  reactions: { emoji: string; count: number; users: string[] }[];
  mentions: { mentioned_type: string; mentioned_id: string | null }[];
  replyTo: { id: string; content: string | null; author: { display_name: string } | null } | null;
  pinned: boolean;
  editedAt: number | null;
  createdAt: number;
}

interface ChatState {
  messages: Record<string, Message[]>; // by channelId
  typing: Record<string, Record<string, number>>; // channelId -> userId -> ts
  loadMessages: (channelId: string) => Promise<void>;
  addMessage: (m: Message) => void;
  updateMessage: (m: Message) => void;
  removeMessage: (channelId: string, messageId: string) => void;
  applyReaction: (channelId: string, messageId: string, emoji: string, userId: string, added: boolean) => void;
  setTyping: (channelId: string, userId: string, isTyping: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: {},
  typing: {},

  async loadMessages(channelId) {
    const msgs = await api<Message[]>(`/channels/${channelId}/messages?limit=50`);
    set((s) => ({ messages: { ...s.messages, [channelId]: msgs } }));
  },

  addMessage(m) {
    set((s) => {
      const list = s.messages[m.channelId] ?? [];
      if (list.some((x) => x.id === m.id)) return s;
      return { messages: { ...s.messages, [m.channelId]: [...list, m] } };
    });
  },

  updateMessage(m) {
    set((s) => ({
      messages: {
        ...s.messages,
        [m.channelId]: (s.messages[m.channelId] ?? []).map((x) => (x.id === m.id ? m : x)),
      },
    }));
  },

  removeMessage(channelId, messageId) {
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] ?? []).filter((x) => x.id !== messageId),
      },
    }));
  },

  applyReaction(channelId, messageId, emoji, userId, added) {
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] ?? []).map((m) => {
          if (m.id !== messageId) return m;
          const reactions = [...m.reactions];
          const idx = reactions.findIndex((r) => r.emoji === emoji);
          if (added) {
            if (idx >= 0) reactions[idx] = { ...reactions[idx], count: reactions[idx].count + 1, users: [...reactions[idx].users, userId] };
            else reactions.push({ emoji, count: 1, users: [userId] });
          } else if (idx >= 0) {
            const users = reactions[idx].users.filter((u) => u !== userId);
            if (users.length === 0) reactions.splice(idx, 1);
            else reactions[idx] = { ...reactions[idx], count: users.length, users };
          }
          return { ...m, reactions };
        }),
      },
    }));
  },

  setTyping(channelId, userId, isTyping) {
    set((s) => {
      const ch = { ...(s.typing[channelId] ?? {}) };
      if (isTyping) ch[userId] = Date.now();
      else delete ch[userId];
      return { typing: { ...s.typing, [channelId]: ch } };
    });
    void get;
  },
}));
