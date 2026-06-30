import { useEffect } from 'react';
import { connectSocket } from '../api/socket';
import { useChatStore } from '../store/chatStore';
import { useDmStore } from '../store/dmStore';
import { usePresenceStore } from '../store/presenceStore';
import { useVoiceStore } from '../store/voiceStore';
import { useServerStore } from '../store/serverStore';
import { useReadStateStore } from '../store/readStateStore';
import { useAuthStore } from '../store/authStore';
import { useFriendsStore } from '../store/friendsStore';
import { mentionsMe, fireNotification } from '../utils/notify';
import type { Message } from '../store/chatStore';
import type { DmMessage } from '../store/dmStore';

// Resolve which server a channel belongs to (for notification level + mention checks).
function serverIdForChannel(channelId: string): string | null {
  const channels = useServerStore.getState().channels;
  for (const [serverId, list] of Object.entries(channels)) {
    if (list.some((c) => c.id === channelId)) return serverId;
  }
  return null;
}

// Single place wiring server->client socket events into the stores (spec §9, §11).
export function useSocketEvents(onIncomingCall: (dmChannelId: string, fromUserId: string) => void) {
  useEffect(() => {
    const socket = connectSocket();

    const onNew = (m: Message) => {
      useChatStore.getState().addMessage(m);
      // Unread tracking + browser notification (spec §11).
      const read = useReadStateStore.getState();
      read.noteLatestChannel(m.channelId, m.id);
      const meId = useAuthStore.getState().me?.id;
      if (m.author?.id === meId) {
        // Our own message: implicitly read.
        read.markChannelRead(m.channelId, m.id);
        return;
      }
      const serverId = serverIdForChannel(m.channelId);
      const level = read.levelFor(serverId, m.channelId);
      const mentioned = mentionsMe(m, serverId);
      if (level === 'all' || (level === 'mentions' && mentioned)) {
        const channel = (useServerStore.getState().channels[serverId ?? ''] ?? []).find(
          (c) => c.id === m.channelId,
        );
        fireNotification(
          `${m.author?.display_name ?? 'New message'}${channel ? ` · #${channel.name}` : ''}`,
          m.content ?? 'sent a message',
        );
      }
    };
    const onUpdated = (m: Message) => useChatStore.getState().updateMessage(m);
    const onDeleted = (p: { channelId: string; messageId: string }) =>
      useChatStore.getState().removeMessage(p.channelId, p.messageId);
    const onReaction = (p: {
      messageId: string;
      emoji: string;
      userId: string;
      added: boolean;
    }) => {
      // We don't have channelId in the payload; resolve from current messages.
      const state = useChatStore.getState();
      for (const [channelId, list] of Object.entries(state.messages)) {
        if (list.some((x) => x.id === p.messageId)) {
          state.applyReaction(channelId, p.messageId, p.emoji, p.userId, p.added);
          break;
        }
      }
    };
    const onTyping = (p: { channelId: string; userId: string; isTyping: boolean }) =>
      useChatStore.getState().setTyping(p.channelId, p.userId, p.isTyping);
    const onPresence = (p: { userId: string; status: string; customStatus: string | null }) =>
      usePresenceStore.getState().set(p.userId, p.status, p.customStatus);

    const onDmNew = (m: DmMessage) => {
      useDmStore.getState().addMessage(m);
      const read = useReadStateStore.getState();
      read.noteLatestDm(m.dmChannelId, m.id);
      const meId = useAuthStore.getState().me?.id;
      if (m.author?.id === meId) {
        read.markDmRead(m.dmChannelId, m.id);
        return;
      }
      fireNotification(m.author?.display_name ?? 'Direct Message', m.content ?? 'sent a message');
    };
    const onDmUpdated = (m: DmMessage) => useDmStore.getState().updateMessage(m);
    const onDmDeleted = (p: { dmChannelId: string; messageId: string }) =>
      useDmStore.getState().removeMessage(p.dmChannelId, p.messageId);

    const onChannelCreated = (c: any) => useServerStore.getState().upsertChannel(c);
    const onChannelDeleted = (p: { id: string; serverId: string }) =>
      useServerStore.getState().removeChannel(p.id, p.serverId);
    const onChannelUpdated = (c: any) => useServerStore.getState().upsertChannel(c);
    const onCategoryCreated = (c: any) => useServerStore.getState().upsertCategory(c);
    const onThreadCreated = (c: any) => useServerStore.getState().upsertChannel(c);
    const onRoleCreated = (r: any) => useServerStore.getState().upsertRole(r);
    const onRoleUpdated = (r: any) => useServerStore.getState().upsertRole(r);
    const onRoleDeleted = (p: { id: string; serverId: string }) =>
      useServerStore.getState().removeRole(p.id, p.serverId);
    const onMemberRoles = (p: { serverId: string }) =>
      useServerStore.getState().reloadMembers(p.serverId);
    const reloadFriends = () => {
      useFriendsStore.getState().load();
    };

    // Voice mesh
    const onVoiceJoined = (p: { userId: string }) =>
      useVoiceStore.getState()._handleRosterUser(p.userId, false);
    const onVoiceLeft = (p: { userId: string }) =>
      useVoiceStore.getState()._removeParticipant(p.userId);
    const onVoiceSignal = (p: { fromUserId: string; signal: any }) =>
      useVoiceStore.getState()._handleSignal(p.fromUserId, p.signal);
    const onVoiceState = (p: {
      userId: string;
      muted?: boolean;
      deafened?: boolean;
      speaking?: boolean;
    }) =>
      useVoiceStore.getState()._setRemoteState(p.userId, {
        muted: p.muted,
        deafened: p.deafened,
        speaking: p.speaking,
      } as any);

    // DM calls
    const onCallIncoming = (p: { dmChannelId: string; fromUserId: string }) =>
      onIncomingCall(p.dmChannelId, p.fromUserId);
    const onCallAccepted = (p: { userId: string }) =>
      useVoiceStore.getState()._handleRosterUser(p.userId, false);
    const onCallSignal = (p: { fromUserId: string; signal: any }) =>
      useVoiceStore.getState()._handleSignal(p.fromUserId, p.signal);
    const onCallUserLeft = (p: { userId: string }) =>
      useVoiceStore.getState()._removeParticipant(p.userId);
    const onCallEnded = () => useVoiceStore.getState().leave();

    socket.on('message:new', onNew);
    socket.on('message:updated', onUpdated);
    socket.on('message:deleted', onDeleted);
    socket.on('message:reaction', onReaction);
    socket.on('typing:update', onTyping);
    socket.on('presence:changed', onPresence);
    socket.on('dm:new', onDmNew);
    socket.on('dm:updated', onDmUpdated);
    socket.on('dm:deleted', onDmDeleted);
    socket.on('channel:created', onChannelCreated);
    socket.on('channel:deleted', onChannelDeleted);
    socket.on('channel:updated', onChannelUpdated);
    socket.on('category:created', onCategoryCreated);
    socket.on('thread:created', onThreadCreated);
    socket.on('role:created', onRoleCreated);
    socket.on('role:updated', onRoleUpdated);
    socket.on('role:deleted', onRoleDeleted);
    socket.on('member:roles-updated', onMemberRoles);
    socket.on('friend:request-received', reloadFriends);
    socket.on('friend:request-accepted', reloadFriends);
    socket.on('friend:removed', reloadFriends);
    socket.on('voice:user-joined', onVoiceJoined);
    socket.on('voice:user-left', onVoiceLeft);
    socket.on('voice:signal', onVoiceSignal);
    socket.on('voice:state-update', onVoiceState);
    socket.on('dm:call-incoming', onCallIncoming);
    socket.on('dm:call-accepted', onCallAccepted);
    socket.on('dm:call-signal', onCallSignal);
    socket.on('dm:call-user-left', onCallUserLeft);
    socket.on('dm:call-ended', onCallEnded);

    return () => {
      socket.off('message:new', onNew);
      socket.off('message:updated', onUpdated);
      socket.off('message:deleted', onDeleted);
      socket.off('message:reaction', onReaction);
      socket.off('typing:update', onTyping);
      socket.off('presence:changed', onPresence);
      socket.off('dm:new', onDmNew);
      socket.off('dm:updated', onDmUpdated);
      socket.off('dm:deleted', onDmDeleted);
      socket.off('channel:created', onChannelCreated);
      socket.off('channel:deleted', onChannelDeleted);
      socket.off('channel:updated', onChannelUpdated);
      socket.off('category:created', onCategoryCreated);
      socket.off('thread:created', onThreadCreated);
      socket.off('role:created', onRoleCreated);
      socket.off('role:updated', onRoleUpdated);
      socket.off('role:deleted', onRoleDeleted);
      socket.off('member:roles-updated', onMemberRoles);
      socket.off('friend:request-received', reloadFriends);
      socket.off('friend:request-accepted', reloadFriends);
      socket.off('friend:removed', reloadFriends);
      socket.off('voice:user-joined', onVoiceJoined);
      socket.off('voice:user-left', onVoiceLeft);
      socket.off('voice:signal', onVoiceSignal);
      socket.off('voice:state-update', onVoiceState);
      socket.off('dm:call-incoming', onCallIncoming);
      socket.off('dm:call-accepted', onCallAccepted);
      socket.off('dm:call-signal', onCallSignal);
      socket.off('dm:call-user-left', onCallUserLeft);
      socket.off('dm:call-ended', onCallEnded);
    };
  }, [onIncomingCall]);
}
