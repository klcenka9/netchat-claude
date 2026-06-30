import { create } from 'zustand';

export type ChannelPanel = 'none' | 'search' | 'pins' | 'threads';

interface UiState {
  // Right-hand drawer over the chat view.
  channelPanel: ChannelPanel;
  // Active thread channel id when the thread panel is open.
  activeThreadId: string | null;
  // Home view: friends page vs an open DM.
  homeView: 'friends' | 'dm';
  setChannelPanel: (p: ChannelPanel) => void;
  toggleChannelPanel: (p: ChannelPanel) => void;
  openThread: (id: string) => void;
  closeThread: () => void;
  setHomeView: (v: 'friends' | 'dm') => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  channelPanel: 'none',
  activeThreadId: null,
  homeView: 'friends',

  setChannelPanel(p) {
    set({ channelPanel: p });
  },
  toggleChannelPanel(p) {
    set({ channelPanel: get().channelPanel === p ? 'none' : p });
  },
  openThread(id) {
    set({ activeThreadId: id, channelPanel: 'threads' });
  },
  closeThread() {
    set({ activeThreadId: null });
  },
  setHomeView(v) {
    set({ homeView: v });
  },
}));
