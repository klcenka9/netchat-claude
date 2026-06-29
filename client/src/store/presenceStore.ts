import { create } from 'zustand';

interface PresenceState {
  statuses: Record<string, { status: string; customStatus: string | null }>;
  set: (userId: string, status: string, customStatus: string | null) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  statuses: {},
  set(userId, status, customStatus) {
    set((s) => ({ statuses: { ...s.statuses, [userId]: { status, customStatus } } }));
  },
}));
