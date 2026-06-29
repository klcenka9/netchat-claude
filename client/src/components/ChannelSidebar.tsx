import { Hash, Volume2, Settings, ChevronDown } from 'lucide-react';
import { useServerStore } from '../store/serverStore';
import { useVoiceStore } from '../store/voiceStore';
import UserFooter from './UserFooter';

export default function ChannelSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { servers, activeServerId, channels, categories, activeChannelId, selectChannel } =
    useServerStore();
  const joinVoice = useVoiceStore((s) => s.join);
  const server = servers.find((s) => s.id === activeServerId);
  if (!server) return <div className="w-60 bg-bg-alt" />;

  const serverChannels = channels[server.id] ?? [];
  const serverCategories = categories[server.id] ?? [];
  const uncategorized = serverChannels.filter((c) => !c.category_id && c.type !== 'thread');

  return (
    <div className="w-60 bg-bg-alt flex flex-col">
      <button
        onClick={onOpenSettings}
        className="h-12 px-4 flex items-center justify-between border-b border-border shadow-sm hover:bg-bg-soft"
      >
        <span className="font-semibold truncate">{server.name}</span>
        <ChevronDown size={18} className="text-muted" />
      </button>

      <div className="flex-1 overflow-y-auto py-2 px-2">
        <ChannelGroup channels={uncategorized} activeId={activeChannelId} onSelect={selectChannel} onVoice={(id) => joinVoice({ type: 'channel', channelId: id })} />
        {serverCategories.map((cat) => {
          const inCat = serverChannels.filter((c) => c.category_id === cat.id && c.type !== 'thread');
          return (
            <div key={cat.id} className="mt-3">
              <div className="text-xs font-bold text-muted uppercase px-2 mb-1">{cat.name}</div>
              <ChannelGroup
                channels={inCat}
                activeId={activeChannelId}
                onSelect={selectChannel}
                onVoice={(id) => joinVoice({ type: 'channel', channelId: id })}
              />
            </div>
          );
        })}
      </div>

      <UserFooter onOpenSettings={onOpenSettings} />
    </div>
  );
}

function ChannelGroup({
  channels,
  activeId,
  onSelect,
  onVoice,
}: {
  channels: { id: string; name: string; type: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onVoice: (id: string) => void;
}) {
  return (
    <>
      {channels.map((c) => (
        <button
          key={c.id}
          onClick={() => (c.type === 'voice' ? onVoice(c.id) : onSelect(c.id))}
          className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-muted hover:bg-bg-soft hover:text-text ${
            activeId === c.id ? 'bg-bg-soft text-text' : ''
          }`}
        >
          {c.type === 'voice' ? <Volume2 size={18} /> : <Hash size={18} />}
          <span className="truncate text-sm">{c.name}</span>
          {c.type === 'voice' && <Settings size={14} className="ml-auto opacity-0" />}
        </button>
      ))}
    </>
  );
}
