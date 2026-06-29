import { create } from 'zustand';
import { api, setAccessToken, tryRestoreSession } from '../api/http';

export interface Me {
  id: string;
  username: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  banner_url: string | null;
  about_me: string | null;
  pronouns: string | null;
  accent_color: string | null;
  status: string;
  custom_status: string | null;
  theme: string;
  totp_enabled: boolean;
}

interface AuthState {
  me: Me | null;
  loading: boolean;
  twoFactor: { tempToken: string } | null;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  verify2fa: (code: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
    registrationCode: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setMe: (patch: Partial<Me>) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  me: null,
  loading: true,
  twoFactor: null,

  async init() {
    try {
      if (await tryRestoreSession()) {
        const me = await api<Me>('/users/me');
        set({ me });
      }
    } catch {
      /* not logged in */
    } finally {
      set({ loading: false });
    }
  },

  async login(email, password) {
    const res = await api<
      | { accessToken: string; user: Me }
      | { requiresTwoFactor: true; tempToken: string }
    >('/auth/login', { method: 'POST', json: { email, password } });
    if ('requiresTwoFactor' in res) {
      set({ twoFactor: { tempToken: res.tempToken } });
      return;
    }
    setAccessToken(res.accessToken);
    const me = await api<Me>('/users/me');
    set({ me, twoFactor: null });
  },

  async verify2fa(code) {
    const tempToken = get().twoFactor?.tempToken;
    if (!tempToken) throw new Error('No 2FA session');
    const res = await api<{ accessToken: string }>('/auth/2fa/verify', {
      method: 'POST',
      json: { tempToken, code },
    });
    setAccessToken(res.accessToken);
    const me = await api<Me>('/users/me');
    set({ me, twoFactor: null });
  },

  async register(username, email, password, registrationCode) {
    const res = await api<{ accessToken: string; user: Me }>('/auth/register', {
      method: 'POST',
      json: { username, email, password, registrationCode },
    });
    setAccessToken(res.accessToken);
    const me = await api<Me>('/users/me');
    set({ me });
  },

  async logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    localStorage.removeItem('netchat_has_session');
    set({ me: null });
    location.reload();
  },

  async refreshMe() {
    const me = await api<Me>('/users/me');
    set({ me });
  },

  setMe(patch) {
    const me = get().me;
    if (me) set({ me: { ...me, ...patch } });
  },
}));
