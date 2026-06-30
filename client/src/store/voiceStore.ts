import { create } from 'zustand';
import { api } from '../api/http';
import { getSocket } from '../api/socket';
import { useSettingsStore } from './settingsStore';

// One active call at a time. Context is either a server voice channel or a DM call;
// both use the same mesh engine, differing only in the socket event names (§10).
export type VoiceContext =
  | { type: 'channel'; channelId: string }
  | { type: 'dm'; dmChannelId: string };

interface RemoteParticipant {
  userId: string;
  stream: MediaStream | null;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
}

interface VoiceState {
  context: VoiceContext | null;
  localStream: MediaStream | null;
  participants: Record<string, RemoteParticipant>;
  muted: boolean;
  deafened: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  join: (ctx: VoiceContext) => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  setPttHeld: (held: boolean) => void;
  _handleRosterUser: (userId: string, initiate: boolean) => Promise<void>;
  _handleSignal: (fromUserId: string, signal: any) => Promise<void>;
  _removeParticipant: (userId: string) => void;
  _setRemoteState: (userId: string, patch: Partial<RemoteParticipant>) => void;
}

// Peer connections live outside zustand (non-serializable).
const peers = new Map<string, RTCPeerConnection>();
let iceConfig: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function sigEventNames(ctx: VoiceContext) {
  return ctx.type === 'channel'
    ? { signal: 'voice:signal', signalIn: 'voice:signal' }
    : { signal: 'dm:call-signal', signalIn: 'dm:call-signal' };
}

function sendSignal(ctx: VoiceContext, targetUserId: string, signal: unknown) {
  const socket = getSocket();
  if (!socket) return;
  if (ctx.type === 'channel') {
    socket.emit('voice:signal', { targetUserId, signal, channelId: ctx.channelId });
  } else {
    socket.emit('dm:call-signal', { dmChannelId: ctx.dmChannelId, targetUserId, signal });
  }
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  context: null,
  localStream: null,
  participants: {},
  muted: false,
  deafened: false,
  cameraOn: false,
  screenOn: false,

  async join(ctx) {
    if (get().context) get().leave();
    try {
      iceConfig = await api<RTCConfiguration>('/voice/ice-config');
    } catch {
      /* fall back to STUN-only */
    }
    const { inputDeviceId, pushToTalk } = useSettingsStore.getState();
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true,
      video: false,
    });
    // Push-to-talk: start muted at the track level until the key is held (spec §10).
    if (pushToTalk) localStream.getAudioTracks().forEach((t) => (t.enabled = false));
    set({ context: ctx, localStream, participants: {}, muted: false, deafened: false });

    const socket = getSocket();
    if (!socket) return;

    if (ctx.type === 'channel') {
      socket.emit('voice:join', { channelId: ctx.channelId }, (res: any) => {
        if (res?.roster) for (const p of res.roster) get()._handleRosterUser(p.userId, true);
      });
    } else {
      socket.emit('dm:call-accept', { dmChannelId: ctx.dmChannelId }, (res: any) => {
        if (res?.roster) for (const uid of res.roster) get()._handleRosterUser(uid, true);
      });
    }
  },

  leave() {
    const ctx = get().context;
    const socket = getSocket();
    if (ctx && socket) {
      if (ctx.type === 'channel') socket.emit('voice:leave', { channelId: ctx.channelId });
      else socket.emit('dm:call-leave', { dmChannelId: ctx.dmChannelId });
    }
    peers.forEach((pc) => pc.close());
    peers.clear();
    get().localStream?.getTracks().forEach((t) => t.stop());
    set({ context: null, localStream: null, participants: {}, cameraOn: false, screenOn: false });
  },

  toggleMute() {
    const { localStream, muted, deafened, context } = get();
    const next = !muted;
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !next));
    set({ muted: next });
    const socket = getSocket();
    if (context && socket) {
      if (context.type === 'channel')
        socket.emit('voice:mute-update', { channelId: context.channelId, muted: next, deafened });
      else
        socket.emit('dm:call-mute-update', {
          dmChannelId: context.dmChannelId,
          muted: next,
          deafened,
        });
    }
  },

  // Push-to-talk: enable the local audio track only while the key is held.
  // No-op when the user has toggled an explicit mute.
  setPttHeld(held) {
    const { localStream, muted, context } = get();
    if (!context || muted) return;
    localStream?.getAudioTracks().forEach((t) => (t.enabled = held));
  },

  toggleDeafen() {
    const next = !get().deafened;
    set({ deafened: next });
    // Deafen mutes all remote audio locally.
    Object.values(get().participants).forEach((p) => {
      p.stream?.getAudioTracks().forEach((t) => (t.enabled = !next));
    });
  },

  async toggleCamera() {
    const on = !get().cameraOn;
    if (on) {
      const cam = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = cam.getVideoTracks()[0];
      get().localStream?.addTrack(track);
      peers.forEach((pc) => pc.addTrack(track, get().localStream!));
      await renegotiateAll(get().context!);
    } else {
      get()
        .localStream?.getVideoTracks()
        .forEach((t) => {
          t.stop();
          get().localStream?.removeTrack(t);
        });
    }
    set({ cameraOn: on });
  },

  async toggleScreen() {
    const on = !get().screenOn;
    if (on) {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const track = display.getVideoTracks()[0];
      get().localStream?.addTrack(track);
      peers.forEach((pc) => pc.addTrack(track, get().localStream!));
      track.onended = () => set({ screenOn: false });
      await renegotiateAll(get().context!);
    }
    set({ screenOn: on });
  },

  async _handleRosterUser(userId, initiate) {
    const ctx = get().context;
    if (!ctx || peers.has(userId)) return;
    const pc = new RTCPeerConnection(iceConfig);
    peers.set(userId, pc);
    get().localStream?.getTracks().forEach((t) => pc.addTrack(t, get().localStream!));

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(ctx, userId, { type: 'ice', candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      get()._setRemoteState(userId, { stream: e.streams[0] });
    };
    set((s) => ({
      participants: {
        ...s.participants,
        [userId]: s.participants[userId] ?? {
          userId,
          stream: null,
          muted: false,
          deafened: false,
          speaking: false,
        },
      },
    }));

    if (initiate) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(ctx, userId, { type: 'offer', sdp: offer });
    }
  },

  async _handleSignal(fromUserId, signal) {
    const ctx = get().context;
    if (!ctx) return;
    let pc = peers.get(fromUserId);
    if (!pc) {
      await get()._handleRosterUser(fromUserId, false);
      pc = peers.get(fromUserId)!;
    }
    if (signal.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(ctx, fromUserId, { type: 'answer', sdp: answer });
    } else if (signal.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    } else if (signal.type === 'ice') {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch {
        /* ignore */
      }
    }
  },

  _removeParticipant(userId) {
    peers.get(userId)?.close();
    peers.delete(userId);
    set((s) => {
      const next = { ...s.participants };
      delete next[userId];
      return { participants: next };
    });
  },

  _setRemoteState(userId, patch) {
    set((s) => ({
      participants: {
        ...s.participants,
        [userId]: {
          ...(s.participants[userId] ?? {
            userId,
            stream: null,
            muted: false,
            deafened: false,
            speaking: false,
          }),
          ...patch,
        },
      },
    }));
  },
}));

async function renegotiateAll(ctx: VoiceContext) {
  for (const [userId, pc] of peers) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(ctx, userId, { type: 'offer', sdp: offer });
  }
}

void sigEventNames;
