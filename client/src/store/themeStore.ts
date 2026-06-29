import { create } from 'zustand';
import { api } from '../api/http';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme, persist?: boolean) => void;
  toggle: () => void;
}

function apply(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

const stored = (localStorage.getItem('netchat_theme') as Theme) || 'dark';
apply(stored);

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: stored,
  setTheme(theme, persist = true) {
    apply(theme);
    localStorage.setItem('netchat_theme', theme);
    set({ theme });
    if (persist) api('/users/me', { method: 'PATCH', json: { theme } }).catch(() => undefined);
  },
  toggle() {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark');
  },
}));
