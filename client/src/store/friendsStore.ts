import { create } from 'zustand';
import { api } from '../api/http';

export interface PublicUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
  custom_status: string | null;
}

export interface Friendship {
  otherUserId: string;
  status: 'pending' | 'accepted';
  requestedBy: string;
  incoming: boolean;
  user: PublicUser;
}

interface FriendsState {
  friends: Friendship[];
  blocks: PublicUser[];
  load: () => Promise<void>;
  loadBlocks: () => Promise<void>;
  sendRequest: (username: string) => Promise<void>;
  accept: (userId: string) => Promise<void>;
  remove: (userId: string) => Promise<void>;
  blockUser: (userId: string) => Promise<void>;
  unblock: (userId: string) => Promise<void>;
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  friends: [],
  blocks: [],

  async load() {
    set({ friends: await api<Friendship[]>('/friends') });
  },

  async loadBlocks() {
    set({ blocks: await api<PublicUser[]>('/friends/blocks') });
  },

  async sendRequest(username) {
    await api('/friends/request', { method: 'POST', json: { username } });
    await get().load();
  },

  async accept(userId) {
    await api(`/friends/${userId}/accept`, { method: 'POST' });
    await get().load();
  },

  async remove(userId) {
    await api(`/friends/${userId}`, { method: 'DELETE' });
    await get().load();
  },

  async blockUser(userId) {
    await api('/blocks', { method: 'POST', json: { userId } });
    await Promise.all([get().load(), get().loadBlocks()]);
  },

  async unblock(userId) {
    await api(`/blocks/${userId}`, { method: 'DELETE' });
    await get().loadBlocks();
  },
}));
