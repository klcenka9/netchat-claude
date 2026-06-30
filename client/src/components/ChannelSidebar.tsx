import { useState } from 'react';
import { Hash, Volume2, Settings, ChevronDown, Plus, Link } from 'lucide-react';
import { useServerStore } from '../store/serverStore';
import { useVoiceStore } from '../store/voiceStore';
import { useReadStateStore } from '../store/readStateStore';
import { api } from '../api/http';
import { Permissions, hasPermission } from '../utils/permissions';
import UserFooter from './UserFooter';

export default function ChannelSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const {
    servers,
    activeServerId,
    channels,
    categories,
    activeChannelId,
    selectChannel,
    myPermissions,
  } = useServerStore();
  const joinVoice = useVoiceStore((s) => s.join);
  const [showCreate, setShowCreate] = useState<null | 'channel' | 'category'>(null);
  const [showInvite, setShowInvite] = useState(false);
  const server = servers.find((s) => s.id === activeServerId);
  if (!server) return <div className="w-60 bg-bg-alt" />;

  const perms = myPermissions(server.id);
  const canManageChannels = hasPermission(perms, Permissions.MANAGE_CHANNELS);
  const canInvite = hasPermission(perms, Permissions.CREATE_INVITE);

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
        {(canManageChannels || canInvite) && (
          <div className="flex gap-1 px-1 mb-2">
            {canManageChannels && (
              <button
                onClick={() => setShowCreate('channel')}
                className="flex-1 flex items-center justify-center gap-1 text-xs bg-bg-soft hover:bg-bg-alt rounded py-1 text-muted"
              >
                <Plus size={14} /> Channel
              </button>
            )}
            {canManageChannels && (
              <button
                onClick={() => setShowCreate('category')}
                className="flex-1 flex items-center justify-center gap-1 text-xs bg-bg-soft hover:bg-bg-alt rounded py-1 text-muted"
              >
                <Plus size={14} /> Category
              </button>
            )}
            {canInvite && (
              <button
                onClick={() => setShowInvite(true)}
                title="Create invite"
                className="flex items-center justify-center gap-1 text-xs bg-bg-soft hover:bg-bg-alt rounded py-1 px-2 text-muted"
              >
                <Link size={14} />
              </button>
            )}
          </div>
        )}

        <ChannelGroup
          channels={uncategorized}
          activeId={activeChannelId}
          onSelect={selectChannel}
          onVoice={(id) => joinVoice({ type: 'channel', channelId: id })}
        />
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

      {showCreate && (
        <CreateModal
          kind={showCreate}
          serverId={server.id}
          categories={serverCategories}
          onClose={() => setShowCreate(null)}
        />
      )}
      {showInvite && <InviteModal serverId={server.id} onClose={() => setShowInvite(false)} />}
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
  const isChannelUnread = useReadStateStore((s) => s.isChannelUnread);
  // Subscribe to latest map so unread dots re-render on new messages.
  useReadStateStore((s) => s.channelLatest);
  useReadStateStore((s) => s.channelRead);
  return (
    <>
      {channels.map((c) => {
        const unread = c.type !== 'voice' && isChannelUnread(c.id) && activeId !== c.id;
        return (
          <button
            key={c.id}
            onClick={() => (c.type === 'voice' ? onVoice(c.id) : onSelect(c.id))}
            className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-bg-soft hover:text-text ${
              activeId === c.id ? 'bg-bg-soft text-text' : unread ? 'text-text' : 'text-muted'
            }`}
          >
            {unread && <span className="w-1.5 h-1.5 rounded-full bg-text -ml-1" />}
            {c.type === 'voice' ? <Volume2 size={18} /> : <Hash size={18} />}
            <span className={`truncate text-sm ${unread ? 'font-semibold' : ''}`}>{c.name}</span>
            {c.type === 'voice' && <Settings size={14} className="ml-auto opacity-0" />}
          </button>
        );
      })}
    </>
  );
}

function CreateModal({
  kind,
  serverId,
  categories,
  onClose,
}: {
  kind: 'channel' | 'category';
  serverId: string;
  categories: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'text' | 'voice'>('text');
  const [categoryId, setCategoryId] = useState('');
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    try {
      if (kind === 'channel') {
        await api(`/servers/${serverId}/channels`, {
          method: 'POST',
          json: { name, type, category_id: categoryId || null },
        });
      } else {
        await api(`/servers/${serverId}/categories`, { method: 'POST', json: { name } });
      }
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50" onClick={onClose}>
      <div className="bg-bg-alt p-6 rounded-lg w-[420px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4 capitalize">Create {kind}</h2>
        {err && <div className="text-red-300 text-sm mb-2">{err}</div>}
        {kind === 'channel' && (
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setType('text')}
              className={`flex-1 py-2 rounded text-sm ${type === 'text' ? 'bg-accent text-white' : 'bg-bg-soft'}`}
            >
              Text
            </button>
            <button
              onClick={() => setType('voice')}
              className={`flex-1 py-2 rounded text-sm ${type === 'voice' ? 'bg-accent text-white' : 'bg-bg-soft'}`}
            >
              Voice
            </button>
          </div>
        )}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && submit()}
          placeholder={`${kind} name`}
          className="w-full bg-bg-soft border border-border rounded px-3 py-2 outline-none mb-3"
        />
        {kind === 'channel' && categories.length > 0 && (
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full bg-bg-soft border border-border rounded px-2 py-2 outline-none mb-3 text-sm"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded hover:bg-bg-soft text-muted">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="bg-accent text-white px-4 py-2 rounded disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function InviteModal({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  async function create() {
    setErr('');
    try {
      const res = await api<{ code: string }>(`/servers/${serverId}/invites`, {
        method: 'POST',
        json: {},
      });
      setCode(res.code);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50" onClick={onClose}>
      <div className="bg-bg-alt p-6 rounded-lg w-[420px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Invite People</h2>
        {err && <div className="text-red-300 text-sm mb-2">{err}</div>}
        {code ? (
          <div>
            <div className="text-xs font-bold text-muted uppercase mb-1">Invite code</div>
            <div className="flex gap-2">
              <input
                readOnly
                value={code}
                className="flex-1 bg-bg-soft border border-border rounded px-3 py-2 outline-none font-mono"
              />
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(code);
                  setCopied(true);
                }}
                className="bg-accent text-white px-4 rounded"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={create} className="bg-accent text-white px-4 py-2 rounded">
            Generate Invite
          </button>
        )}
      </div>
    </div>
  );
}
