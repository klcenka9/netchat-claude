import { create } from 'zustand';

// Client-only device + push-to-talk preferences (spec §11 settingsStore, §10 PTT).
// Persisted to localStorage; PTT is purely client-side (gates the local audio track).
interface SettingsState {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  pushToTalk: boolean;
  pttKey: string; // KeyboardEvent.code, e.g. 'Space'
  setInputDevice: (id: string | null) => void;
  setOutputDevice: (id: string | null) => void;
  setPushToTalk: (on: boolean) => void;
  setPttKey: (code: string) => void;
}

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const useSettingsStore = create<SettingsState>((set) => ({
  inputDeviceId: load<string | null>('nc_inputDevice', null),
  outputDeviceId: load<string | null>('nc_outputDevice', null),
  pushToTalk: load<boolean>('nc_pushToTalk', false),
  pttKey: load<string>('nc_pttKey', 'Space'),
  setInputDevice(id) {
    save('nc_inputDevice', id);
    set({ inputDeviceId: id });
  },
  setOutputDevice(id) {
    save('nc_outputDevice', id);
    set({ outputDeviceId: id });
  },
  setPushToTalk(on) {
    save('nc_pushToTalk', on);
    set({ pushToTalk: on });
  },
  setPttKey(code) {
    save('nc_pttKey', code);
    set({ pttKey: code });
  },
}));
