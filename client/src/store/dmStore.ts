import { create } from 'zustand';
import { api } from '../api/http';

export interface DmChannel {
  id: string;
  is_group: number;
  name: string | null;
  participants: { id: string; username: string; display_name: string; avatar_url: string | null }[];
}
export interface DmMessage {
  id: string;
  dmChannelId: string;
  author: { id: string; display_name: string; avatar_url: string | null } | null;
  content: string | null;
  contentHtml: string;
  createdAt: number;
  editedAt: number | null;
}

interface DmState {
  dms: DmChannel[];
  activeDmId: string | null;
  messages: Record<string, DmMessage[]>;
  loadDms: () => Promise<void>;
  openDm: (userId: string) => Promise<string>;
  selectDm: (id: string) => Promise<void>;
  addMessage: (m: DmMessage) => void;
  updateMessage: (m: DmMessage) => void;
  removeMessage: (dmChannelId: string, id: string) => void;
}

export const useDmStore = create<DmState>((set, get) => ({
  dms: [],
  activeDmId: null,
  messages: {},

  async loadDms() {
    set({ dms: await api<DmChannel[]>('/dms') });
  },

  async openDm(userId) {
    const dm = await api<DmChannel>('/dms', { method: 'POST', json: { userId } });
    await get().loadDms();
    set({ activeDmId: dm.id });
    return dm.id;
  },

  async selectDm(id) {
    const msgs = await api<DmMessage[]>(`/dms/${id}/messages?limit=50`);
    set((s) => ({ activeDmId: id, messages: { ...s.messages, [id]: msgs } }));
  },

  addMessage(m) {
    set((s) => {
      const list = s.messages[m.dmChannelId] ?? [];
      if (list.some((x) => x.id === m.id)) return s;
      return { messages: { ...s.messages, [m.dmChannelId]: [...list, m] } };
    });
  },

  updateMessage(m) {
    set((s) => ({
      messages: {
        ...s.messages,
        [m.dmChannelId]: (s.messages[m.dmChannelId] ?? []).map((x) => (x.id === m.id ? m : x)),
      },
    }));
  },

  removeMessage(dmChannelId, id) {
    set((s) => ({
      messages: {
        ...s.messages,
        [dmChannelId]: (s.messages[dmChannelId] ?? []).filter((x) => x.id !== id),
      },
    }));
  },
}));
