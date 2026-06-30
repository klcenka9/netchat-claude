import { useEffect, useState } from 'react';
import { X, Pin } from 'lucide-react';
import { api } from '../api/http';
import { getSocket } from '../api/socket';
import { useUiStore } from '../store/uiStore';
import type { Message } from '../store/chatStore';
import Avatar from './Avatar';

export default function PinsPanel({ channelId }: { channelId: string }) {
  const setChannelPanel = useUiStore((s) => s.setChannelPanel);
  const [pins, setPins] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setPins(await api<Message[]>(`/channels/${channelId}/pins`));
    } catch {
      setPins([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  function unpin(m: Message) {
    getSocket()?.emit('message:pin', { messageId: m.id, pinned: false });
    setPins((p) => p.filter((x) => x.id !== m.id));
  }

  return (
    <div className="w-80 bg-bg-alt border-l border-border flex flex-col shrink-0">
      <div className="h-12 px-4 flex items-center justify-between border-b border-border shadow-sm">
        <div className="flex items-center gap-2 font-semibold">
          <Pin size={18} /> Pinned Messages
        </div>
        <button onClick={() => setChannelPanel('none')} className="text-muted hover:text-text">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && <div className="text-muted text-sm p-2">Loading…</div>}
        {!loading && pins.length === 0 && (
          <div className="text-muted text-sm p-2">No pinned messages in this channel.</div>
        )}
        {pins.map((m) => (
          <div key={m.id} className="group flex gap-2 p-2 rounded hover:bg-bg-soft relative">
            <Avatar user={m.author ?? { display_name: '?', avatar_url: null }} size={28} />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted">
                {m.author?.display_name ?? 'Unknown'} ·{' '}
                {new Date(m.createdAt * 1000).toLocaleString()}
              </div>
              <div
                className="text-sm break-words"
                dangerouslySetInnerHTML={{ __html: m.contentHtml }}
              />
            </div>
            <button
              onClick={() => unpin(m)}
              title="Unpin"
              className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
