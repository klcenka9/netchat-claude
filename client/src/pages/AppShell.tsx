import { useCallback, useEffect, useState } from 'react';
import { useServerStore } from '../store/serverStore';
import { useDmStore } from '../store/dmStore';
import { useSocketEvents } from '../hooks/useSocketEvents';
import ServerRail from '../components/ServerRail';
import ChannelSidebar from '../components/ChannelSidebar';
import ChatView from '../components/ChatView';
import MemberList from '../components/MemberList';
import DMView from '../components/DMView';
import DMSidebar from '../components/DMSidebar';
import SettingsModal from '../components/SettingsModal';
import IncomingCallModal from '../components/IncomingCallModal';
import VoicePanel from '../components/VoicePanel';
import { useVoiceStore } from '../store/voiceStore';

export type Mode = { kind: 'server' } | { kind: 'home' };

export default function AppShell() {
  const [mode, setMode] = useState<Mode>({ kind: 'home' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [incomingCall, setIncomingCall] = useState<{ dmChannelId: string; fromUserId: string } | null>(
    null,
  );
  const loadServers = useServerStore((s) => s.loadServers);
  const loadDms = useDmStore((s) => s.loadDms);
  const voiceContext = useVoiceStore((s) => s.context);

  const onIncomingCall = useCallback((dmChannelId: string, fromUserId: string) => {
    setIncomingCall({ dmChannelId, fromUserId });
  }, []);
  useSocketEvents(onIncomingCall);

  useEffect(() => {
    loadServers();
    loadDms();
  }, [loadServers, loadDms]);

  return (
    <div className="h-full flex">
      <ServerRail mode={mode} setMode={setMode} />

      {mode.kind === 'server' ? (
        <ChannelSidebar onOpenSettings={() => setSettingsOpen(true)} />
      ) : (
        <DMSidebar onOpenSettings={() => setSettingsOpen(true)} />
      )}

      <div className="flex-1 flex min-w-0">
        {mode.kind === 'server' ? <ChatView /> : <DMView />}
        {mode.kind === 'server' && <MemberList />}
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
