import { useState } from 'react';
import { Hash, Volume2, Settings, ChevronDown, Plus, Link, LogOut, Trash2 } from 'lucide-react';
import { useServerStore, type Channel } from '../store/serverStore';
import { useAuthStore } from '../store/authStore';
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
  const { leaveServer, deleteServer } = useServerStore();
  const meId = useAuthStore((s) => s.me?.id);
  const joinVoice = useVoiceStore((s) => s.join);
  const [showCreate, setShowCreate] = useState<null | 'channel' | 'category'>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editChannel, setEditChannel] = useState<Channel | null>(null);
  const server = servers.find((s) => s.id === activeServerId);
  if (!server) return <div className="w-60 bg-bg-alt" />;

  const perms = myPermissions(server.id);
  const canManageChannels = hasPermission(perms, Permissions.MANAGE_CHANNELS);
  const canInvite = hasPermission(perms, Permissions.CREATE_INVITE);
  const isOwner = server.owner_id === meId;

  const serverChannels = channels[server.id] ?? [];
  const serverCategories = categories[server.id] ?? [];
  const uncategorized = serverChannels.filter((c) => !c.category_id && c.type !== 'thread');
  const upsertChannel = useServerStore((s) => s.upsertChannel);

  // Drag-and-drop reorder (spec §2/§11): rebuild the channel list in its new
  // visual order, then PATCH every channel whose position/category changed.
  async function reorderChannel(draggedId: string, targetId: string) {
    if (!canManageChannels || draggedId === targetId) return;
    const all = serverChannels.filter((c) => c.type !== 'thread');
    const target = all.find((c) => c.id === targetId);
    const dragged = all.find((c) => c.id === draggedId);
    if (!target || !dragged) return;

    // Visual order: uncategorized first, then each category's channels.
    const order: typeof all = [];
    order.push(...all.filter((c) => !c.category_id).sort((a, b) => a.position - b.position));
    for (const cat of serverCategories) {
      order.push(...all.filter((c) => c.category_id === cat.id).sort((a, b) => a.position - b.position));
    }
    const without = order.filter((c) => c.id !== draggedId);
    const idx = without.findIndex((c) => c.id === targetId);
    const movedCategory = target.category_id ?? null;
    without.splice(idx, 0, { ...dragged, category_id: movedCategory });

    // Renumber and persist only what changed.
    const updates: { id: string; position: number; category_id: string | null }[] = [];
    without.forEach((c, i) => {
      const orig = all.find((o) => o.id === c.id)!;
      if (orig.position !== i || (orig.category_id ?? null) !== (c.category_id ?? null)) {
        updates.push({ id: c.id, position: i, category_id: c.category_id ?? null });
      }
    });
    for (const u of updates) {
      const updated = await api<Channel>(`/channels/${u.id}`, {
        method: 'PATCH',
        json: { position: u.position, category_id: u.category_id },
      });
      upsertChannel(updated);
    }
  }

  return (
    <div className="w-60 bg-bg-alt flex flex-col">
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-full h-12 px-4 flex items-center justify-between border-b border-border shadow-sm hover:bg-bg-soft"
        >
          <span className="font-semibold truncate">{server.name}</span>
          <ChevronDown size={18} className="text-muted" />
        </button>
        {menuOpen && (
          <div
            className="absolute left-2 right-2 top-12 bg-bg-soft border border-border rounded-lg shadow-lg p-1 z-40"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button
              onClick={() => {
                setMenuOpen(false);
                onOpenSettings();
              }}
              className="w-full flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-bg-alt text-left"
            >
              <Settings size={16} /> Server Settings
            </button>
            {canInvite && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setShowInvite(true);
                }}
                className="w-full flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-bg-alt text-left"
              >
                <Link size={16} /> Invite People
              </button>
            )}
            <div className="border-t border-border my-1" />
            {isOwner ? (
              <button
                onClick={() => {
                  if (confirm(`Delete "${server.name}"? This cannot be undone.`)) deleteServer(server.id);
                }}
                className="w-full flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-bg-alt text-left text-red-400"
              >
                <Trash2 size={16} /> Delete Server
              </button>
            ) : (
              <button
                onClick={() => {
                  if (confirm(`Leave "${server.name}"?`)) leaveServer(server.id);
                }}
                className="w-full flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-bg-alt text-left text-red-400"
              >
                <LogOut size={16} /> Leave Server
              </button>
            )}
          </div>
        )}
      </div>

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
          canManage={canManageChannels}
          onSelect={selectChannel}
          onVoice={(id) => joinVoice({ type: 'channel', channelId: id })}
          onEdit={setEditChannel}
          onReorder={reorderChannel}
        />
        {serverCategories.map((cat) => {
          const inCat = serverChannels.filter((c) => c.category_id === cat.id && c.type !== 'thread');
          return (
            <div key={cat.id} className="mt-3">
              <div className="text-xs font-bold text-muted uppercase px-2 mb-1">{cat.name}</div>
              <ChannelGroup
                channels={inCat}
                activeId={activeChannelId}
                canManage={canManageChannels}
                onSelect={selectChannel}
                onVoice={(id) => joinVoice({ type: 'channel', channelId: id })}
                onEdit={setEditChannel}
                onReorder={reorderChannel}
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
      {editChannel && (
        <ChannelSettingsModal channel={editChannel} onClose={() => setEditChannel(null)} />
      )}
    </div>
  );
}

function ChannelGroup({
  channels,
  activeId,
  canManage,
  onSelect,
  onVoice,
  onEdit,
  onReorder,
}: {
  channels: Channel[];
  activeId: string | null;
  canManage: boolean;
  onSelect: (id: string) => void;
  onVoice: (id: string) => void;
  onEdit: (c: Channel) => void;
  onReorder: (draggedId: string, targetId: string) => void;
}) {
  const isChannelUnread = useReadStateStore((s) => s.isChannelUnread);
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Subscribe to latest map so unread dots re-render on new messages.
  useReadStateStore((s) => s.channelLatest);
  useReadStateStore((s) => s.channelRead);
  return (
    <>
      {channels.map((c) => {
        const unread = c.type !== 'voice' && isChannelUnread(c.id) && activeId !== c.id;
        return (
          <div
            key={c.id}
            className={`group/ch relative flex items-center ${
              dragOver === c.id ? 'border-t-2 border-accent' : ''
            }`}
            draggable={canManage}
            onDragStart={(e) => e.dataTransfer.setData('text/channel', c.id)}
            onDragOver={(e) => {
              if (canManage) {
                e.preventDefault();
                setDragOver(c.id);
              }
            }}
            onDragLeave={() => setDragOver((v) => (v === c.id ? null : v))}
            onDrop={(e) => {
              setDragOver(null);
              const dragged = e.dataTransfer.getData('text/channel');
              if (dragged) onReorder(dragged, c.id);
            }}
          >
            <button
              onClick={() => (c.type === 'voice' ? onVoice(c.id) : onSelect(c.id))}
              className={`flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-bg-soft hover:text-text ${
                activeId === c.id ? 'bg-bg-soft text-text' : unread ? 'text-text' : 'text-muted'
              }`}
            >
              {unread && <span className="w-1.5 h-1.5 rounded-full bg-text -ml-1" />}
              {c.type === 'voice' ? <Volume2 size={18} /> : <Hash size={18} />}
              <span className={`truncate text-sm ${unread ? 'font-semibold' : ''}`}>{c.name}</span>
            </button>
            {canManage && (
              <button
                onClick={() => onEdit(c)}
                title="Edit channel"
                className="absolute right-1 opacity-0 group-hover/ch:opacity-100 text-muted hover:text-text p-1"
              >
                <Settings size={14} />
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

function ChannelSettingsModal({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const upsertChannel = useServerStore((s) => s.upsertChannel);
  const removeChannel = useServerStore((s) => s.removeChannel);
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? '');
  const [nsfw, setNsfw] = useState(!!channel.nsfw);
  const [slowmode, setSlowmode] = useState(channel.slowmode_seconds);
  const [err, setErr] = useState('');

  async function save() {
    setErr('');
    try {
      const updated = await api<Channel>(`/channels/${channel.id}`, {
        method: 'PATCH',
        json: { name, topic: topic || null, nsfw, slowmode_seconds: slowmode },
      });
      upsertChannel(updated);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function del() {
    if (!confirm(`Delete #${channel.name}?`)) return;
    await api(`/channels/${channel.id}`, { method: 'DELETE' });
    removeChannel(channel.id, channel.server_id);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50" onClick={onClose}>
      <div className="bg-bg-alt p-6 rounded-lg w-[440px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Edit #{channel.name}</h2>
        {err && <div className="text-red-300 text-sm mb-2">{err}</div>}
        <label className="block text-xs font-bold text-muted uppercase mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-bg-soft border border-border rounded px-3 py-2 mb-3 outline-none"
        />
        {channel.type === 'text' && (
          <>
            <label className="block text-xs font-bold text-muted uppercase mb-1">Topic</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full bg-bg-soft border border-border rounded px-3 py-2 mb-3 outline-none"
            />
            <label className="flex items-center gap-2 mb-3 text-sm">
              <input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} />
              NSFW channel
            </label>
            <label className="block text-xs font-bold text-muted uppercase mb-1">
              Slowmode: {slowmode}s
            </label>
            <input
              type="range"
              min={0}
              max={120}
              value={slowmode}
              onChange={(e) => setSlowmode(parseInt(e.target.value, 10))}
              className="w-full mb-4"
            />
          </>
        )}
        <div className="flex justify-between">
          <button onClick={del} className="text-red-400 hover:underline text-sm">
            Delete channel
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded hover:bg-bg-soft text-muted">
              Cancel
            </button>
            <button onClick={save} className="bg-accent text-white px-4 py-2 rounded">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
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
