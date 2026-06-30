import { create } from 'zustand';
import { api } from '../api/http';
import { useAuthStore } from './authStore';
import { Permissions } from '../utils/permissions';

export interface Server {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  owner_id: string;
}
export interface Channel {
  id: string;
  server_id: string;
  category_id: string | null;
  parent_channel_id: string | null;
  name: string;
  type: 'text' | 'voice' | 'thread';
  topic: string | null;
  nsfw: number;
  slowmode_seconds: number;
  position: number;
}
export interface Category {
  id: string;
  server_id: string;
  name: string;
  position: number;
}
export interface Role {
  id: string;
  server_id: string;
  name: string;
  color: string;
  permissions: number;
  position: number;
  hoist: number;
  is_default: number;
}
export interface Member {
  user_id: string;
  nickname: string | null;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
  custom_status: string | null;
  roleIds: string[];
}

interface ServerState {
  servers: Server[];
  activeServerId: string | null;
  channels: Record<string, Channel[]>;
  categories: Record<string, Category[]>;
  roles: Record<string, Role[]>;
  members: Record<string, Member[]>;
  activeChannelId: string | null;
  loadServers: () => Promise<void>;
  selectServer: (id: string) => Promise<void>;
  selectChannel: (id: string) => void;
  createServer: (name: string) => Promise<void>;
  joinInvite: (code: string) => Promise<void>;
  upsertChannel: (c: Channel) => void;
  removeChannel: (id: string, serverId: string) => void;
  upsertCategory: (c: Category) => void;
  upsertRole: (r: Role) => void;
  removeRole: (id: string, serverId: string) => void;
  reloadRoles: (serverId: string) => Promise<void>;
  reloadMembers: (serverId: string) => Promise<void>;
  myPermissions: (serverId: string) => number;
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  activeServerId: null,
  channels: {},
  categories: {},
  roles: {},
  members: {},
  activeChannelId: null,

  async loadServers() {
    const servers = await api<Server[]>('/servers');
    set({ servers });
  },

  async selectServer(id) {
    const data = await api<Server & { channels: Channel[]; categories: Category[]; roles: Role[] }>(
      `/servers/${id}`,
    );
    const members = await api<Member[]>(`/servers/${id}/members`);
    const firstText = data.channels.find((c) => c.type === 'text');
    set((s) => ({
      activeServerId: id,
      channels: { ...s.channels, [id]: data.channels },
      categories: { ...s.categories, [id]: data.categories },
      roles: { ...s.roles, [id]: data.roles },
      members: { ...s.members, [id]: members },
      activeChannelId: firstText?.id ?? null,
    }));
  },

  selectChannel(id) {
    set({ activeChannelId: id });
  },

  async createServer(name) {
    await api('/servers', { method: 'POST', json: { name } });
    await get().loadServers();
  },

  async joinInvite(code) {
    await api(`/invites/${code}/join`, { method: 'POST' });
    await get().loadServers();
  },

  upsertChannel(c) {
    set((s) => {
      const list = s.channels[c.server_id] ?? [];
      const next = list.some((x) => x.id === c.id)
        ? list.map((x) => (x.id === c.id ? c : x))
        : [...list, c];
      return { channels: { ...s.channels, [c.server_id]: next } };
    });
  },

  removeChannel(id, serverId) {
    set((s) => ({
      channels: {
        ...s.channels,
        [serverId]: (s.channels[serverId] ?? []).filter((c) => c.id !== id),
      },
    }));
  },

  upsertCategory(c) {
    set((s) => {
      const list = s.categories[c.server_id] ?? [];
      const next = list.some((x) => x.id === c.id)
        ? list.map((x) => (x.id === c.id ? c : x))
        : [...list, c];
      return { categories: { ...s.categories, [c.server_id]: next } };
    });
  },

  upsertRole(r) {
    set((s) => {
      const list = s.roles[r.server_id] ?? [];
      const next = list.some((x) => x.id === r.id)
        ? list.map((x) => (x.id === r.id ? r : x))
        : [...list, r];
      return { roles: { ...s.roles, [r.server_id]: next } };
    });
  },

  removeRole(id, serverId) {
    set((s) => ({
      roles: { ...s.roles, [serverId]: (s.roles[serverId] ?? []).filter((r) => r.id !== id) },
    }));
  },

  async reloadRoles(serverId) {
    const roles = await api<Role[]>(`/servers/${serverId}/roles`);
    set((s) => ({ roles: { ...s.roles, [serverId]: roles } }));
  },

  async reloadMembers(serverId) {
    const members = await api<Member[]>(`/servers/${serverId}/members`);
    set((s) => ({ members: { ...s.members, [serverId]: members } }));
  },

  // Compute the current user's base (server-level) permission bitfield: owner gets
  // everything, otherwise OR of all assigned role permission bitfields.
  myPermissions(serverId) {
    const meId = useAuthStore.getState().me?.id;
    const state = get();
    const server = state.servers.find((s) => s.id === serverId);
    if (meId && server?.owner_id === meId) return Permissions.ADMINISTRATOR;
    const roles = state.roles[serverId] ?? [];
    const member = (state.members[serverId] ?? []).find((m) => m.user_id === meId);
    const myRoleIds = new Set(member?.roleIds ?? []);
    let bits = 0;
    for (const r of roles) {
      if (r.is_default || myRoleIds.has(r.id)) bits |= r.permissions;
    }
    return bits;
  },
}));
