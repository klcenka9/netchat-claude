import { useEffect, useRef, useState } from 'react';
import { api, getAccessToken } from '../api/http';
import { useServerStore } from '../store/serverStore';

// --- Webhooks (spec §11 server-settings tab, phase 13) ---
export function WebhooksPanel({ serverId }: { serverId: string }) {
  const channels = (useServerStore((s) => s.channels)[serverId] ?? []).filter(
    (c) => c.type === 'text',
  );
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');
  const [hooks, setHooks] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState('');

  async function load(id: string) {
    if (!id) return;
    try {
      setHooks(await api(`/channels/${id}/webhooks`));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    load(channelId);
  }, [channelId]);

  async function create() {
    setErr('');
    setToken(null);
    try {
      const res = await api<{ id: string; name: string; token: string; url: string }>(
        `/channels/${channelId}/webhooks`,
        { method: 'POST', json: { name } },
      );
      // Token shown exactly once (spec §12).
      setToken(`${location.origin}/api/webhooks/${res.id}/${res.token}`);
      setName('');
      await load(channelId);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function del(id: string) {
    await api(`/webhooks/${id}`, { method: 'DELETE' });
    await load(channelId);
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-bold mb-4">Webhooks</h2>
      {err && <div className="text-red-300 text-sm mb-2">{err}</div>}
      <label className="block text-xs font-bold text-muted uppercase mb-1">Channel</label>
      <select
        value={channelId}
        onChange={(e) => setChannelId(e.target.value)}
        className="w-full bg-bg-soft border border-border rounded px-3 py-2 mb-4"
      >
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
          </option>
        ))}
      </select>

      <div className="flex gap-2 mb-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Webhook name"
          className="flex-1 bg-bg-soft border border-border rounded px-3 py-2"
        />
        <button onClick={create} disabled={!name || !channelId} className="bg-accent text-white px-4 rounded disabled:opacity-50">
          Create
        </button>
      </div>

      {token && (
        <div className="bg-bg-alt rounded p-3 mb-3 text-sm">
          <div className="text-yellow-400 mb-1">Copy this URL now — it is shown only once:</div>
          <code className="break-all">{token}</code>
        </div>
      )}

      <div className="space-y-1">
        {hooks.map((h) => (
          <div key={h.id} className="flex items-center justify-between bg-bg-alt rounded px-3 py-2">
            <span>{h.name}</span>
            <button onClick={() => del(h.id)} className="text-red-400 text-sm hover:underline">
              Delete
            </button>
          </div>
        ))}
        {hooks.length === 0 && <div className="text-muted text-sm">No webhooks in this channel.</div>}
      </div>
    </div>
  );
}

// --- Custom emoji (spec §11 Emoji tab, phase 6) ---
export function EmojiPanel({ serverId }: { serverId: string }) {
  const [emojis, setEmojis] = useState<{ id: string; name: string; image_url: string }[]>([]);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setEmojis(await api(`/servers/${serverId}/emojis`));
  }
  useEffect(() => {
    load();
  }, [serverId]);

  async function upload(file: File) {
    setErr('');
    if (!name) return setErr('Enter an emoji name first');
    const form = new FormData();
    form.append('name', name); // text field before file so multer populates req.body
    form.append('file', file);
    const res = await fetch(`/api/servers/${serverId}/emojis`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      body: form,
      credentials: 'include',
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error ?? 'Upload failed');
      return;
    }
    setName('');
    await load();
  }
  async function del(id: string) {
    await api(`/emojis/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-bold mb-4">Emoji</h2>
      {err && <div className="text-red-300 text-sm mb-2">{err}</div>}
      <div className="flex gap-2 mb-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          placeholder="emoji_name"
          className="flex-1 bg-bg-soft border border-border rounded px-3 py-2"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <button onClick={() => fileRef.current?.click()} className="bg-accent text-white px-4 rounded">
          Upload
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {emojis.map((e) => (
          <div key={e.id} className="flex items-center gap-2 bg-bg-alt rounded px-3 py-2">
            <img src={e.image_url} alt={e.name} className="w-7 h-7 object-contain" />
            <span className="flex-1 truncate text-sm">:{e.name}:</span>
            <button onClick={() => del(e.id)} className="text-red-400 text-sm">
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Invites (spec §11 Invites tab) ---
export function InvitesPanel({ serverId }: { serverId: string }) {
  const [invites, setInvites] = useState<{ code: string; uses: number; max_uses: number | null }[]>([]);
  const [err, setErr] = useState('');

  async function load() {
    try {
      setInvites(await api(`/servers/${serverId}/invites`));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, [serverId]);

  async function create() {
    await api(`/servers/${serverId}/invites`, { method: 'POST', json: {} });
    await load();
  }
  async function revoke(code: string) {
    await api(`/invites/${code}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-bold mb-4">Invites</h2>
      {err && <div className="text-red-300 text-sm mb-2">{err}</div>}
      <button onClick={create} className="bg-accent text-white px-4 py-2 rounded mb-4">
        Create invite
      </button>
      <div className="space-y-1">
        {invites.map((i) => (
          <div key={i.code} className="flex items-center justify-between bg-bg-alt rounded px-3 py-2">
            <code>{i.code}</code>
            <span className="text-muted text-sm">
              {i.uses}
              {i.max_uses ? `/${i.max_uses}` : ''} uses
            </span>
            <button onClick={() => revoke(i.code)} className="text-red-400 text-sm hover:underline">
              Revoke
            </button>
          </div>
        ))}
        {invites.length === 0 && <div className="text-muted text-sm">No active invites.</div>}
      </div>
    </div>
  );
}

// --- Bans (spec §11 Bans tab, phase 12) ---
export function BansPanel({ serverId }: { serverId: string }) {
  const [bans, setBans] = useState<{ user_id: string; reason: string | null }[]>([]);
  const [err, setErr] = useState('');

  async function load() {
    try {
      setBans(await api(`/servers/${serverId}/bans`));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, [serverId]);

  async function unban(userId: string) {
    await api(`/servers/${serverId}/bans/${userId}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-bold mb-4">Bans</h2>
      {err && <div className="text-red-300 text-sm mb-2">{err}</div>}
      <div className="space-y-1">
        {bans.map((b) => (
          <div key={b.user_id} className="flex items-center justify-between bg-bg-alt rounded px-3 py-2">
            <span className="truncate">
              {b.user_id}
              {b.reason ? <span className="text-muted text-sm"> — {b.reason}</span> : null}
            </span>
            <button onClick={() => unban(b.user_id)} className="text-accent text-sm hover:underline">
              Unban
            </button>
          </div>
        ))}
        {bans.length === 0 && <div className="text-muted text-sm">No bans.</div>}
      </div>
    </div>
  );
}
