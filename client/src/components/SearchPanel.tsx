import { useState } from 'react';
import { X, Search } from 'lucide-react';
import { api } from '../api/http';
import { useServerStore } from '../store/serverStore';
import { useUiStore } from '../store/uiStore';
import type { Message } from '../store/chatStore';
import Avatar from './Avatar';

export default function SearchPanel() {
  const { activeServerId, channels, members, selectChannel } = useServerStore();
  const setChannelPanel = useUiStore((s) => s.setChannelPanel);
  const [q, setQ] = useState('');
  const [channelId, setChannelId] = useState('');
  const [authorId, setAuthorId] = useState('');
  const [hasAttachment, setHasAttachment] = useState(false);
  const [results, setResults] = useState<Message[] | null>(null);
  const [loading, setLoading] = useState(false);

  const serverChannels = (channels[activeServerId ?? ''] ?? []).filter((c) => c.type === 'text');
  const serverMembers = members[activeServerId ?? ''] ?? [];

  async function run() {
    if (!activeServerId) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (channelId) params.set('channelId', channelId);
    if (authorId) params.set('authorId', authorId);
    if (hasAttachment) params.set('hasAttachment', 'true');
    try {
      const res = await api<Message[]>(`/servers/${activeServerId}/search?${params.toString()}`);
      setResults(res);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function jump(m: Message) {
    // Best-effort: switch to the channel the result lives in.
    selectChannel(m.channelId);
  }

  return (
    <div className="w-80 bg-bg-alt border-l border-border flex flex-col shrink-0">
      <div className="h-12 px-4 flex items-center justify-between border-b border-border shadow-sm">
        <div className="flex items-center gap-2 font-semibold">
          <Search size={18} /> Search
        </div>
        <button onClick={() => setChannelPanel('none')} className="text-muted hover:text-text">
          <X size={20} />
        </button>
      </div>

      <div className="p-3 space-y-2 border-b border-border">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="Search messages…"
          className="w-full bg-bg-soft border border-border rounded px-3 py-2 outline-none text-sm"
        />
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className="w-full bg-bg-soft border border-border rounded px-2 py-2 outline-none text-sm"
        >
          <option value="">Any channel</option>
          {serverChannels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </select>
        <select
          value={authorId}
          onChange={(e) => setAuthorId(e.target.value)}
          className="w-full bg-bg-soft border border-border rounded px-2 py-2 outline-none text-sm"
        >
          <option value="">Any author</option>
          {serverMembers.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.nickname ?? m.display_name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={hasAttachment}
            onChange={(e) => setHasAttachment(e.target.checked)}
          />
          has: attachment
        </label>
        <button onClick={run} className="w-full bg-accent text-white rounded py-1.5 text-sm">
          Search
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && <div className="text-muted text-sm p-2">Searching…</div>}
        {results && !loading && results.length === 0 && (
          <div className="text-muted text-sm p-2">No results.</div>
        )}
        {results?.map((m) => (
          <button
            key={m.id}
            onClick={() => jump(m)}
            className="w-full text-left flex gap-2 p-2 rounded hover:bg-bg-soft"
          >
            <Avatar user={m.author ?? { display_name: '?', avatar_url: null }} size={28} />
            <div className="min-w-0">
              <div className="text-xs text-muted">
                {m.author?.display_name ?? 'Unknown'} ·{' '}
                {new Date(m.createdAt * 1000).toLocaleDateString()}
              </div>
              <div
                className="text-sm break-words line-clamp-3"
                dangerouslySetInnerHTML={{ __html: m.contentHtml }}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
