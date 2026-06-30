import { useCallback, useEffect, useState } from 'react';
import { useServerStore } from '../store/serverStore';
import { useDmStore } from '../store/dmStore';
import { useUiStore } from '../store/uiStore';
import { useReadStateStore } from '../store/readStateStore';
import { useSocketEvents } from '../hooks/useSocketEvents';
import ServerRail from '../components/ServerRail';
import ChannelSidebar from '../components/ChannelSidebar';
import ChatView from '../components/ChatView';
import MemberList from '../components/MemberList';
import DMView from '../components/DMView';
import DMSidebar from '../components/DMSidebar';
import FriendsPage from '../components/FriendsPage';
import SearchPanel from '../components/SearchPanel';
import PinsPanel from '../components/PinsPanel';
import ThreadPanel from '../components/ThreadPanel';
import SettingsModal from '../components/SettingsModal';
import IncomingCallModal from '../components/IncomingCallModal';
import VoicePanel from '../components/VoicePanel';
import { useVoiceStore } from '../store/voiceStore';
import { useSettingsStore } from '../store/settingsStore';

export type Mode = { kind: 'server' } | { kind: 'home' };

export default function AppShell() {
  const [mode, setMode] = useState<Mode>({ kind: 'home' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [incomingCall, setIncomingCall] = useState<{ dmChannelId: string; fromUserId: string } | null>(
    null,
  );
  const loadServers = useServerStore((s) => s.loadServers);
  const activeChannelId = useServerStore((s) => s.activeChannelId);
  const loadDms = useDmStore((s) => s.loadDms);
  const activeDmId = useDmStore((s) => s.activeDmId);
  const voiceContext = useVoiceStore((s) => s.context);
  const channelPanel = useUiStore((s) => s.channelPanel);
  const homeView = useUiStore((s) => s.homeView);
  const loadReadState = useReadStateStore((s) => s.load);
  const loadNotificationSettings = useReadStateStore((s) => s.loadNotificationSettings);

  const onIncomingCall = useCallback((dmChannelId: string, fromUserId: string) => {
    setIncomingCall({ dmChannelId, fromUserId });
  }, []);
  useSocketEvents(onIncomingCall);

  useEffect(() => {
    loadServers();
    loadDms();
    loadReadState();
    loadNotificationSettings();
  }, [loadServers, loadDms, loadReadState, loadNotificationSettings]);

  // Global push-to-talk: hold the configured key to open the mic (spec §10).
  useEffect(() => {
    function down(e: KeyboardEvent) {
      const { pushToTalk, pttKey } = useSettingsStore.getState();
      if (pushToTalk && e.code === pttKey && !e.repeat) useVoiceStore.getState().setPttHeld(true);
    }
    function up(e: KeyboardEvent) {
      const { pushToTalk, pttKey } = useSettingsStore.getState();
      if (pushToTalk && e.code === pttKey) useVoiceStore.getState().setPttHeld(false);
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  return (
    <div className="h-full flex">
      <ServerRail mode={mode} setMode={setMode} />

      {mode.kind === 'server' ? (
        <ChannelSidebar onOpenSettings={() => setSettingsOpen(true)} />
      ) : (
        <DMSidebar onOpenSettings={() => setSettingsOpen(true)} />
      )}

      <div className="flex-1 flex min-w-0">
        {mode.kind === 'server' ? (
          <>
            <ChatView />
            {channelPanel === 'search' && <SearchPanel />}
            {channelPanel === 'pins' && activeChannelId && (
              <PinsPanel channelId={activeChannelId} />
            )}
            {channelPanel === 'threads' && activeChannelId && (
              <ThreadPanel parentChannelId={activeChannelId} />
            )}
            <MemberList />
          </>
        ) : homeView === 'dm' && activeDmId ? (
          <DMView />
        ) : (
          <FriendsPage />
        )}
      </div>

      {voiceContext && <VoicePanel />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {incomingCall && (
        <IncomingCallModal
          dmChannelId={incomingCall.dmChannelId}
          fromUserId={incomingCall.fromUserId}
          onClose={() => setIncomingCall(null)}
        />
      )}
    </div>
  );
}
