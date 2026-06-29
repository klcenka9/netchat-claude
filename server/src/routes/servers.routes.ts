import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  requireServerMember,
  requireServerPermission,
} from '../middleware/permission.middleware';
import { Permissions } from '../utils/permissions';
import { getMemberContext } from '../utils/permissionResolver';
import {
  createServer,
  getServer,
  listServersForUser,
  updateServer,
  deleteServer,
  isMember,
  addMember,
  removeMember,
  listMembers,
  setNickname,
} from '../models/server.model';
import { listRoles, getMemberRoleIds } from '../models/role.model';
import { listChannels, listCategories, createChannel, createCategory } from '../models/channel.model';
import { getUserById, toPublicUser } from '../models/user.model';
import { logAudit } from '../models/auditLog.model';
import { emitToServer, emitToUser } from '../utils/realtime';
import { snowflake } from '../utils/snowflake';

const router = Router();

// --- Servers ---
router.get('/servers', requireAuth, (req, res) => {
  res.json(listServersForUser(req.userId!));
});

const createServerSchema = z.object({ name: z.string().min(1).max(100) });
router.post('/servers', requireAuth, validateBody(createServerSchema), (req, res) => {
  const server = createServer(req.userId!, req.body.name);
  res.status(201).json(server);
});

router.get('/servers/:id', requireAuth, requireServerMember(), (req, res) => {
  const server = getServer(req.params.id)!;
  res.json({
    ...server,
    roles: listRoles(req.params.id),
    categories: listCategories(req.params.id),
    channels: listChannels(req.params.id),
  });
});

const patchServerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
  icon_url: z.string().nullable().optional(),
  banner_url: z.string().nullable().optional(),
});
router.patch(
  '/servers/:id',
  requireAuth,
  requireServerPermission(Permissions.MANAGE_SERVER),
  validateBody(patchServerSchema),
  (req, res) => {
    const server = updateServer(req.params.id, req.body);
    logAudit({
      serverId: req.params.id,
      actorId: req.userId!,
      actionType: 'server_update',
      targetType: 'server',
      targetId: req.params.id,
    });
    emitToServer(req.params.id, 'server:updated', server);
    res.json(server);
  },
);

router.delete('/servers/:id', requireAuth, (req, res) => {
  const server = getServer(req.params.id);
  if (!server) return res.status(404).json({ error: 'Not found' });
  if (server.owner_id !== req.userId!) return res.status(403).json({ error: 'Owner only' });
  emitToServer(req.params.id, 'server:deleted', { serverId: req.params.id });
  deleteServer(req.params.id);
  res.json({ ok: true });
});

// --- Members ---
router.get('/servers/:id/members', requireAuth, requireServerMember(), (req, res) => {
  const members = listMembers(req.params.id) as Array<{ user_id: string }>;
  const enriched = members.map((m) => ({
    ...m,
    roleIds: getMemberRoleIds(req.params.id, m.user_id),
  }));
  res.json(enriched);
});

const nickSchema = z.object({ nickname: z.string().max(32).nullable() });
router.patch(
  '/servers/:id/members/:userId',
  requireAuth,
  validateBody(nickSchema),
  (req, res) => {
    const self = req.params.userId === req.userId!;
    const ctx = getMemberContext(req.params.id, req.userId!);
    if (!ctx.isMember) return res.status(403).json({ error: 'Not a member' });
    if (self) {
      if (!(ctx.basePermissions & Permissions.CHANGE_NICKNAME) && !ctx.isOwner) {
        return res.status(403).json({ error: 'Cannot change nickname' });
      }
    } else if (!(ctx.basePermissions & Permissions.MANAGE_NICKNAMES) && !ctx.isOwner) {
      return res.status(403).json({ error: 'Missing MANAGE_NICKNAMES' });
    }
    setNickname(req.params.id, req.params.userId, req.body.nickname);
    emitToServer(req.params.id, 'member:updated', {
      serverId: req.params.id,
      userId: req.params.userId,
      nickname: req.body.nickname,
    });
    res.json({ ok: true });
  },
);

// Kick
router.delete(
  '/servers/:id/members/:userId',
  requireAuth,
  requireServerPermission(Permissions.KICK_MEMBERS),
  (req, res) => {
    const server = getServer(req.params.id)!;
    if (req.params.userId === server.owner_id) {
      return res.status(403).json({ error: 'Cannot kick the owner' });
    }
    // Role-hierarchy guard: cannot act on a member at/above your highest role.
    const actor = getMemberContext(req.params.id, req.userId!);
    const target = getMemberContext(req.params.id, req.params.userId);
    if (!actor.isOwner && target.highestPosition >= actor.highestPosition) {
      return res.status(403).json({ error: 'Cannot kick a member with an equal or higher role' });
    }
    removeMember(req.params.id, req.params.userId);
    logAudit({
      serverId: req.params.id,
      actorId: req.userId!,
      actionType: 'member_kick',
      targetType: 'user',
      targetId: req.params.userId,
    });
    emitToServer(req.params.id, 'member:kicked', {
      serverId: req.params.id,
      userId: req.params.userId,
    });
    emitToUser(req.params.userId, 'member:kicked', {
      serverId: req.params.id,
      userId: req.params.userId,
    });
    res.json({ ok: true });
  },
);

// --- Bans (Phase 12) ---
const banSchema = z.object({ userId: z.string(), reason: z.string().max(512).optional() });
router.post(
  '/servers/:id/bans',
  requireAuth,
  requireServerPermission(Permissions.BAN_MEMBERS),
  validateBody(banSchema),
  (req, res) => {
    const server = getServer(req.params.id)!;
    if (req.body.userId === server.owner_id) {
      return res.status(403).json({ error: 'Cannot ban the owner' });
    }
    const actor = getMemberContext(req.params.id, req.userId!);
    const target = getMemberContext(req.params.id, req.body.userId);
    if (!actor.isOwner && target.isMember && target.highestPosition >= actor.highestPosition) {
      return res.status(403).json({ error: 'Cannot ban a member with an equal or higher role' });
    }
    db.prepare(
      'INSERT OR REPLACE INTO bans (server_id, user_id, reason, banned_by) VALUES (?, ?, ?, ?)',
    ).run(req.params.id, req.body.userId, req.body.reason ?? null, req.userId!);
    removeMember(req.params.id, req.body.userId);
    logAudit({
      serverId: req.params.id,
      actorId: req.userId!,
      actionType: 'member_ban',
      targetType: 'user',
      targetId: req.body.userId,
      reason: req.body.reason ?? null,
    });
    emitToServer(req.params.id, 'member:banned', {
      serverId: req.params.id,
      userId: req.body.userId,
    });
    emitToUser(req.body.userId, 'member:banned', {
      serverId: req.params.id,
      userId: req.body.userId,
    });
    res.status(201).json({ ok: true });
  },
);

router.get(
  '/servers/:id/bans',
  requireAuth,
  requireServerPermission(Permissions.BAN_MEMBERS),
  (req, res) => {
    const bans = db.prepare('SELECT * FROM bans WHERE server_id = ?').all(req.params.id);
    res.json(bans);
  },
);

router.delete(
  '/servers/:id/bans/:userId',
  requireAuth,
  requireServerPermission(Permissions.BAN_MEMBERS),
  (req, res) => {
    db.prepare('DELETE FROM bans WHERE server_id = ? AND user_id = ?').run(
      req.params.id,
      req.params.userId,
    );
    logAudit({
      serverId: req.params.id,
      actorId: req.userId!,
      actionType: 'member_unban',
      targetType: 'user',
      targetId: req.params.userId,
    });
    res.json({ ok: true });
  },
);

// --- Timeouts (Phase 12) ---
const timeoutSchema = z.object({
  userId: z.string(),
  expiresInMinutes: z.number().int().positive().max(40320),
  reason: z.string().max(512).optional(),
});
router.post(
  '/servers/:id/timeouts',
  requireAuth,
  requireServerPermission(Permissions.MODERATE_MEMBERS),
  validateBody(timeoutSchema),
  (req, res) => {
    const server = getServer(req.params.id)!;
    if (req.body.userId === server.owner_id) {
      return res.status(403).json({ error: 'Cannot timeout the owner' });
    }
    const actor = getMemberContext(req.params.id, req.userId!);
    const target = getMemberContext(req.params.id, req.body.userId);
    if (!actor.isOwner && target.highestPosition >= actor.highestPosition) {
      return res.status(403).json({ error: 'Cannot timeout a member with an equal or higher role' });
    }
    const expiresAt = Math.floor(Date.now() / 1000) + req.body.expiresInMinutes * 60;
    db.prepare(
      'INSERT OR REPLACE INTO timeouts (server_id, user_id, expires_at, reason, issued_by) VALUES (?, ?, ?, ?, ?)',
    ).run(req.params.id, req.body.userId, expiresAt, req.body.reason ?? null, req.userId!);
    logAudit({
      serverId: req.params.id,
      actorId: req.userId!,
      actionType: 'member_timeout',
      targetType: 'user',
      targetId: req.body.userId,
      reason: req.body.reason ?? null,
      metadata: { expiresAt },
    });
    emitToServer(req.params.id, 'member:timed-out', {
      serverId: req.params.id,
      userId: req.body.userId,
      expiresAt,
    });
    res.status(201).json({ expiresAt });
  },
);

// --- Categories & channels ---
const categorySchema = z.object({ name: z.string().min(1).max(100) });
router.post(
  '/servers/:id/categories',
  requireAuth,
  requireServerPermission(Permissions.MANAGE_CHANNELS),
  validateBody(categorySchema),
  (req, res) => {
    const cat = createCategory(req.params.id, req.body.name);
    logAudit({
      serverId: req.params.id,
      actorId: req.userId!,
      actionType: 'category_create',
      targetType: 'category',
    });
    emitToServer(req.params.id, 'category:created', cat);
    res.status(201).json(cat);
  },
);

const channelSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['text', 'voice']),
  category_id: z.string().nullable().optional(),
});
router.post(
  '/servers/:id/channels',
  requireAuth,
  requireServerPermission(Permissions.MANAGE_CHANNELS),
  validateBody(channelSchema),
  (req, res) => {
    const channel = createChannel({
      serverId: req.params.id,
      name: req.body.name,
      type: req.body.type,
      categoryId: req.body.category_id ?? null,
    });
    logAudit({
      serverId: req.params.id,
      actorId: req.userId!,
      actionType: 'channel_create',
      targetType: 'channel',
      targetId: channel.id,
    });
    emitToServer(req.params.id, 'channel:created', channel);
    res.status(201).json(channel);
  },
);

// --- Invites ---
const inviteSchema = z.object({
  max_uses: z.number().int().positive().optional(),
  expires_in_hours: z.number().int().positive().optional(),
});
router.post(
  '/servers/:id/invites',
  requireAuth,
  requireServerPermission(Permissions.CREATE_INVITE),
  validateBody(inviteSchema),
  (req, res) => {
    const code = crypto.randomBytes(5).toString('hex');
    const expiresAt = req.body.expires_in_hours
      ? Math.floor(Date.now() / 1000) + req.body.expires_in_hours * 3600
      : null;
    db.prepare(
      'INSERT INTO invites (code, server_id, created_by, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)',
    ).run(code, req.params.id, req.userId!, req.body.max_uses ?? null, expiresAt);
    res.status(201).json({ code, expires_at: expiresAt });
  },
);

router.get(
  '/servers/:id/invites',
  requireAuth,
  requireServerPermission(Permissions.MANAGE_SERVER),
  (req, res) => {
    const invites = db
      .prepare('SELECT * FROM invites WHERE server_id = ? AND revoked = 0')
      .all(req.params.id);
    res.json(invites);
  },
);

router.delete('/invites/:code', requireAuth, (req, res) => {
  const invite = db.prepare('SELECT * FROM invites WHERE code = ?').get(req.params.code) as
    | { server_id: string }
    | undefined;
  if (!invite) return res.status(404).json({ error: 'Not found' });
  const ctx = getMemberContext(invite.server_id, req.userId!);
  if (!ctx.isOwner && !(ctx.basePermissions & Permissions.MANAGE_SERVER)) {
    return res.status(403).json({ error: 'Missing permission' });
  }
  db.prepare('UPDATE invites SET revoked = 1 WHERE code = ?').run(req.params.code);
  res.json({ ok: true });
});

router.post('/invites/:code/join', requireAuth, (req, res) => {
  const invite = db.prepare('SELECT * FROM invites WHERE code = ?').get(req.params.code) as
    | {
        code: string;
        server_id: string;
        max_uses: number | null;
        uses: number;
        expires_at: number | null;
        revoked: number;
      }
    | undefined;
  if (!invite || invite.revoked) return res.status(404).json({ error: 'Invalid invite' });
  if (invite.expires_at && invite.expires_at < Math.floor(Date.now() / 1000)) {
    return res.status(410).json({ error: 'Invite expired' });
  }
  if (invite.max_uses && invite.uses >= invite.max_uses) {
    return res.status(410).json({ error: 'Invite exhausted' });
  }
  const banned = db
    .prepare('SELECT 1 FROM bans WHERE server_id = ? AND user_id = ?')
    .get(invite.server_id, req.userId!);
  if (banned) return res.status(403).json({ error: 'You are banned from this server' });
  if (isMember(invite.server_id, req.userId!)) {
    return res.json({ server: getServer(invite.server_id) });
  }
  addMember(invite.server_id, req.userId!);
  db.prepare('UPDATE invites SET uses = uses + 1 WHERE code = ?').run(invite.code);
  const user = getUserById(req.userId!)!;
  emitToServer(invite.server_id, 'member:joined', {
    serverId: invite.server_id,
    user: toPublicUser(user),
  });
  res.json({ server: getServer(invite.server_id) });
});

export default router;
