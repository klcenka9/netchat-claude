/**
 * End-to-end smoke test (spec §14 phase 15 deliverable). Exercises the live REST
 * + Socket.io surface against a running server and exits non-zero on any failure.
 *
 *   BASE=http://localhost:3000 CODE=<registrationCode> npm run smoke
 *
 * Covers: auth + code gating, servers/invites, messaging+markdown over sockets,
 * edit/react/pin, threads, attachments, search, custom emoji, webhooks, roles +
 * escalation guard, permission overwrite hiding a channel, moderation
 * (timeout/kick/ban), friends + blocks, DMs, notification/read state, audit log.
 */
import { io, Socket } from 'socket.io-client';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const CODE = process.env.CODE ?? 'letmein';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function req(
  path: string,
  opts: { method?: string; token?: string; json?: unknown; form?: FormData } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: string | FormData | undefined;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form;
  }
  const res = await fetch(`${BASE}${path}`, { method: opts.method ?? 'GET', headers, body });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

const uniq = Date.now().toString(36);
async function register(name: string): Promise<{ id: string; token: string; username: string }> {
  const username = `${name}_${uniq}`;
  const r = await req('/api/auth/register', {
    method: 'POST',
    json: { username, email: `${username}@t.com`, password: 'password123', registrationCode: CODE },
  });
  if (r.status !== 201) throw new Error(`register ${username} failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { id: r.body.user.id, token: r.body.accessToken, username };
}

function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('socket connect timeout')), 5000);
  });
}

function once<T = any>(s: Socket, event: string, ms = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    s.once(event, (p: T) => {
      clearTimeout(to);
      resolve(p);
    });
  });
}

// 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function main() {
  console.log(`NetChat smoke test → ${BASE}`);

  // --- Auth + code gating ---
  console.log('\n[auth]');
  const bad = await req('/api/auth/register', {
    method: 'POST',
    json: { username: `x_${uniq}`, email: `x_${uniq}@t.com`, password: 'password123', registrationCode: 'wrong' },
  });
  check('registration rejects wrong code', bad.status === 403);

  const owner = await register('owner');
  const member = await register('member');
  const friend = await register('friend');
  check('three accounts registered', !!owner.token && !!member.token && !!friend.token);
  const me = await req('/api/users/me', { token: owner.token });
  check('authenticated /users/me', me.status === 200 && me.body.username === owner.username);

  // --- Server + invite + join ---
  console.log('\n[servers]');
  const srv = await req('/api/servers', { method: 'POST', token: owner.token, json: { name: 'Smoke' } });
  check('create server', srv.status === 201);
  const serverId = srv.body.id;
  const full = await req(`/api/servers/${serverId}`, { token: owner.token });
  const textCh = full.body.channels.find((c: any) => c.type === 'text');
  const voiceCh = full.body.channels.find((c: any) => c.type === 'voice');
  const everyone = full.body.roles.find((r: any) => r.is_default);
  check('default text + voice channels + @everyone created', !!textCh && !!voiceCh && !!everyone);

  const inv = await req(`/api/servers/${serverId}/invites`, { method: 'POST', token: owner.token, json: {} });
  check('create invite', inv.status === 201);
  const join = await req(`/api/invites/${inv.body.code}/join`, { method: 'POST', token: member.token });
  check('member joins via invite', join.status === 200);

  // --- Sockets: messaging + markdown ---
  console.log('\n[messaging]');
  const sOwner = await connect(owner.token);
  const sMember = await connect(member.token);
  sMember.emit('channel:join', { channelId: textCh.id });
  sOwner.emit('channel:join', { channelId: textCh.id });
  await new Promise((r) => setTimeout(r, 200));

  const recv = once(sMember, 'message:new');
  sOwner.emit('message:send', { channelId: textCh.id, content: 'hello **world** ||secret||' });
  const msg: any = await recv;
  check('message delivered to other client', msg?.content === 'hello **world** ||secret||');
  check(
    'markdown rendered (bold + spoiler)',
    msg?.contentHtml?.includes('<strong>world</strong>') && msg?.contentHtml?.includes('spoiler'),
  );

  const upd = once(sMember, 'message:updated');
  sOwner.emit('message:edit', { messageId: msg.id, content: 'edited text' });
  const edited: any = await upd;
  check('message edit broadcasts', edited?.content === 'edited text');

  const react = once(sMember, 'message:reaction');
  sOwner.emit('message:react', { messageId: msg.id, emoji: '👍' });
  const reaction: any = await react;
  check('reaction toggles', reaction?.emoji === '👍' && reaction?.added === true);

  sOwner.emit('message:pin', { messageId: msg.id, pinned: true });
  await new Promise((r) => setTimeout(r, 200));
  const pins = await req(`/api/channels/${textCh.id}/pins`, { token: owner.token });
  check('pin appears in pins list', Array.isArray(pins.body) && pins.body.some((m: any) => m.id === msg.id));

  // --- Threads ---
  console.log('\n[threads]');
  const threadCreated = once(sOwner, 'thread:created');
  sOwner.emit('thread:create', { channelId: textCh.id, sourceMessageId: msg.id, name: 'a-thread' });
  const thread: any = await threadCreated;
  check('thread created', thread?.type === 'thread' && thread?.parent_channel_id === textCh.id);

  // --- Attachments ---
  console.log('\n[attachments]');
  const fd = new FormData();
  fd.append('file', new Blob([PNG], { type: 'image/png' }), 'pixel.png');
  const att = await req(`/api/channels/${textCh.id}/attachments`, { method: 'POST', token: owner.token, form: fd });
  check('attachment upload returns url', att.status === 200 && typeof att.body.url === 'string');

  // --- Search (FTS5) ---
  console.log('\n[search]');
  await new Promise((r) => setTimeout(r, 200));
  const search = await req(`/api/servers/${serverId}/search?q=edited`, { token: owner.token });
  check('FTS search finds edited message', Array.isArray(search.body) && search.body.some((m: any) => m.id === msg.id));

  // --- Custom emoji ---
  console.log('\n[emoji]');
  const efd = new FormData();
  efd.append('name', `smoke_${uniq.slice(0, 4)}`);
  efd.append('file', new Blob([PNG], { type: 'image/png' }), 'e.png');
  const emoji = await req(`/api/servers/${serverId}/emojis`, { method: 'POST', token: owner.token, form: efd });
  check('custom emoji upload', emoji.status === 201 && !!emoji.body.id);

  // --- Webhooks ---
  console.log('\n[webhooks]');
  const hook = await req(`/api/channels/${textCh.id}/webhooks`, {
    method: 'POST',
    token: owner.token,
    json: { name: 'CI' },
  });
  check('webhook create returns one-time token', hook.status === 201 && !!hook.body.token);
  const hookMsg = once(sMember, 'message:new');
  const ingress = await req(`/api/webhooks/${hook.body.id}/${hook.body.token}`, {
    method: 'POST',
    json: { content: 'from webhook', username: 'Bot' },
  });
  const whMsg: any = await hookMsg;
  check('public webhook ingress posts a message', ingress.status === 201 && whMsg?.webhook);
  const badIngress = await req(`/api/webhooks/${hook.body.id}/badtoken`, { method: 'POST', json: { content: 'x' } });
  check('webhook rejects wrong token', badIngress.status === 401);

  // --- Roles + escalation guard ---
  console.log('\n[roles / escalation guard]');
  const memberMakesRole = await req(`/api/servers/${serverId}/roles`, {
    method: 'POST',
    token: member.token,
    json: { name: 'hacker', permissions: 1 << 28 },
  });
  check('member without MANAGE_ROLES cannot create role', memberMakesRole.status === 403);

  // --- Permission overwrite hides a channel ---
  console.log('\n[permission overwrite]');
  const secret = await req(`/api/servers/${serverId}/channels`, {
    method: 'POST',
    token: owner.token,
    json: { name: 'secret', type: 'text' },
  });
  const VIEW = 1 << 0;
  await req(`/api/channels/${secret.body.id}/overwrites`, {
    method: 'PUT',
    token: owner.token,
    json: { target_type: 'role', target_id: everyone.id, allow: 0, deny: VIEW },
  });
  const memberView = await req(`/api/channels/${secret.body.id}/messages`, { token: member.token });
  check('overwrite denies VIEW_CHANNELS to member', memberView.status === 403);
  const ownerView = await req(`/api/channels/${secret.body.id}/messages`, { token: owner.token });
  check('owner (ADMINISTRATOR) still sees the channel', ownerView.status === 200);

  // --- Moderation ---
  console.log('\n[moderation]');
  const timeout = await req(`/api/servers/${serverId}/timeouts`, {
    method: 'POST',
    token: owner.token,
    json: { userId: member.id, expiresInMinutes: 5 },
  });
  check('timeout issued', timeout.status === 201);
  const blocked = await new Promise<boolean>((resolve) => {
    sMember.emit('message:send', { channelId: textCh.id, content: 'should be blocked' }, (res: any) =>
      resolve(!!res?.error),
    );
    setTimeout(() => resolve(false), 2000);
  });
  check('timed-out user cannot send', blocked);
  const kick = await req(`/api/servers/${serverId}/members/${member.id}`, { method: 'DELETE', token: owner.token });
  check('kick member', kick.status === 200);
  const ban = await req(`/api/servers/${serverId}/bans`, {
    method: 'POST',
    token: owner.token,
    json: { userId: member.id, reason: 'smoke' },
  });
  check('ban member', ban.status === 201);

  // --- Friends + blocks ---
  console.log('\n[friends]');
  const fr = await req('/api/friends/request', { method: 'POST', token: owner.token, json: { username: friend.username } });
  check('friend request', fr.status === 201);
  const acc = await req(`/api/friends/${owner.id}/accept`, { method: 'POST', token: friend.token });
  check('friend accept', acc.status === 200);
  const friends = await req('/api/friends?status=accepted', { token: owner.token });
  check('friends list shows accepted friend', Array.isArray(friends.body) && friends.body.some((f: any) => f.otherUserId === friend.id));

  // --- DMs ---
  console.log('\n[dms]');
  const dm = await req('/api/dms', { method: 'POST', token: owner.token, json: { userId: friend.id } });
  check('open DM', !!dm.body.id);
  const sFriend = await connect(friend.token);
  const dmRecv = once(sFriend, 'dm:new');
  sOwner.emit('dm:send', { dmChannelId: dm.body.id, content: 'hi friend' });
  const dmMsg: any = await dmRecv;
  check('DM message delivered', dmMsg?.content === 'hi friend');

  // --- Notification + read state ---
  console.log('\n[settings]');
  const notif = await req('/api/notification-settings', {
    method: 'PUT',
    token: owner.token,
    json: { scope_type: 'channel', scope_id: textCh.id, level: 'mentions' },
  });
  check('notification level set', notif.status === 200);
  const read = await req('/api/read-state', {
    method: 'PUT',
    token: owner.token,
    json: { channelId: textCh.id, lastReadMessage: msg.id },
  });
  check('read state set', read.status === 200);

  // --- Audit log ---
  console.log('\n[audit log]');
  const audit = await req(`/api/servers/${serverId}/audit-log`, { token: owner.token });
  check('audit log records actions', Array.isArray(audit.body) && audit.body.length > 0);

  // --- Voice ICE config ---
  console.log('\n[voice]');
  const ice = await req('/api/voice/ice-config', { token: owner.token });
  check('ICE config returns TURN credentials', ice.status === 200 && Array.isArray(ice.body.iceServers));

  sOwner.close();
  sMember.close();
  sFriend.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('SMOKE TEST ERROR:', e);
  process.exit(1);
});
