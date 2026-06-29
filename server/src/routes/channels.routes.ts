import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { requireChannelPermission } from '../middleware/permission.middleware';
import { Permissions } from '../utils/permissions';
import { memberHasChannelPermission, getMemberContext } from '../utils/permissionResolver';
import { getChannel, updateChannel, deleteChannel } from '../models/channel.model';
import { getServer } from '../models/server.model';
import { logAudit } from '../models/auditLog.model';
import { emitToServer, emitToChannel } from '../utils/realtime';
import { serializeMessage } from '../models/message.model';

const router = Router();

const patchChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  topic: z.string().max(1024).nullable().optional(),
  nsfw: z.boolean().optional(),
  slowmode_seconds: z.number().int().min(0).max(21600).optional(),
  position: z.number().int().optional(),
  category_id: z.string().nullable().optional(),
});

router.patch(
  '/channels/:id',
  requireAuth,
  requireChannelPermission(Permissions.MANAGE_CHANNELS),
  validateBody(patchChannelSchema),
  (req, res) => {
    const channel = getChannel(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Not found' });
    const updated = updateChannel(req.params.id, {
      ...req.body,
      nsfw: req.body.nsfw === undefined ? undefined : req.body.nsfw ? 1 : 0,
    });
    logAudit({
      serverId: channel.server_id,
      actorId: req.userId!,
      actionType: 'channel_update',
      targetType: 'channel',
      targetId: channel.id,
    });
    emitToServer(channel.server_id, 'channel:updated', updated);
    res.json(updated);
  },
);

router.delete(
  '/channels/:id',
  requireAuth,
  requireChannelPermission(Permissions.MANAGE_CHANNELS),
  (req, res) => {
    const channel = getChannel(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Not found' });
    deleteChannel(req.params.id);
    logAudit({
      serverId: channel.server_id,
      actorId: req.userId!,
      actionType: 'channel_delete',
      targetType: 'channel',
      targetId: channel.id,
    });
    emitToServer(channel.server_id, 'channel:deleted', { id: channel.id, serverId: channel.server_id });
    res.json({ ok: true });
  },
);

// --- Permission overwrites (Phase 4) ---
router.get(
  '/channels/:id/overwrites',
  requireAuth,
  requireChannelPermission(Permissions.MANAGE_ROLES),
  (req, res) => {
    const rows = db
      .prepare('SELECT * FROM channel_permission_overwrites WHERE channel_id = ?')
      .all(req.params.id);
    res.json(rows);
  },
);

const overwriteSchema = z.object({
  target_type: z.enum(['role', 'member']),
  target_id: z.string(),
  allow: z.number().int().nonnegative(),
  deny: z.number().int().nonnegative(),
});

router.put(
  '/channels/:id/overwrites',
  requireAuth,
  requireChannelPermission(Permissions.MANAGE_ROLES),
  validateBody(overwriteSchema),
  (req, res) => {
    const channel = getChannel(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Not found' });

    // Privilege-escalation guard: you can't grant/deny bits you don't yourself hold (§7).
    const ctx = getMemberContext(channel.server_id, req.userId!);
    const grantedBits = req.body.allow | req.body.deny;
    if (!ctx.isOwner && (ctx.basePermissions & grantedBits) !== grantedBits) {
      return res.status(403).json({ error: 'Cannot manage permissions you do not have' });
    }

    db.prepare(
      `INSERT INTO channel_permission_overwrites (channel_id, target_type, target_id, allow, deny)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(channel_id, target_type, target_id)
       DO UPDATE SET allow = excluded.allow, deny = excluded.deny`,
    ).run(req.params.id, req.body.target_type, req.body.target_id, req.body.allow, req.body.deny);

    logAudit({
      serverId: channel.server_id,
      actorId: req.userId!,
      actionType: 'channel_overwrite_update',
      targetType: 'channel',
      targetId: channel.id,
      metadata: { target_type: req.body.target_type, target_id: req.body.target_id },
    });
    emitToServer(channel.server_id, 'channel:overwrites-updated', { channelId: channel.id });
    res.json({ ok: true });
  },
);

router.delete(
  '/channels/:id/overwrites/:targetType/:targetId',
  requireAuth,
  requireChannelPermission(Permissions.MANAGE_ROLES),
  (req, res) => {
    const channel = getChannel(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Not found' });
    db.prepare(
      'DELETE FROM channel_permission_overwrites WHERE channel_id = ? AND target_type = ? AND target_id = ?',
    ).run(req.params.id, req.params.targetType, req.params.targetId);
    emitToServer(channel.server_id, 'channel:overwrites-updated', { channelId: channel.id });
    res.json({ ok: true });
  },
);

// --- Message history (Phase 5) ---
router.get('/channels/:id/messages', requireAuth, (req, res) => {
  const channel = getChannel(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Not found' });
  if (
    !memberHasChannelPermission(req.params.id, req.userId!, Permissions.VIEW_CHANNELS) ||
    !memberHasChannelPermission(req.params.id, req.userId!, Permissions.READ_MESSAGE_HISTORY)
  ) {
    return res.status(403).json({ error: 'Cannot read this channel' });
  }
  const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 100);
  const before = typeof req.query.before === 'string' ? req.query.before : null;
  const rows = before
    ? (db
        .prepare(
          'SELECT id FROM messages WHERE channel_id = ? AND deleted = 0 AND id < ? ORDER BY id DESC LIMIT ?',
        )
        .all(req.params.id, before, limit) as { id: string }[])
    : (db
        .prepare(
          'SELECT id FROM messages WHERE channel_id = ? AND deleted = 0 ORDER BY id DESC LIMIT ?',
        )
        .all(req.params.id, limit) as { id: string }[]);
  const messages = rows.map((r) => serializeMessage(r.id)).reverse();
  res.json(messages);
});

// --- Pins (Phase 6) ---
router.get('/channels/:id/pins', requireAuth, (req, res) => {
  if (!memberHasChannelPermission(req.params.id, req.userId!, Permissions.VIEW_CHANNELS)) {
    return res.status(403).json({ error: 'Cannot view channel' });
  }
  const rows = db
    .prepare('SELECT id FROM messages WHERE channel_id = ? AND pinned = 1 AND deleted = 0 ORDER BY id DESC')
    .all(req.params.id) as { id: string }[];
  res.json(rows.map((r) => serializeMessage(r.id)));
});

router.patch('/messages/:id/pin', requireAuth, validateBody(z.object({ pinned: z.boolean() })), (req, res) => {
  const msg = db.prepare('SELECT channel_id FROM messages WHERE id = ?').get(req.params.id) as
    | { channel_id: string }
    | undefined;
  if (!msg) return res.status(404).json({ error: 'Not found' });
  if (!memberHasChannelPermission(msg.channel_id, req.userId!, Permissions.MANAGE_MESSAGES)) {
    return res.status(403).json({ error: 'Missing MANAGE_MESSAGES' });
  }
  db.prepare('UPDATE messages SET pinned = ? WHERE id = ?').run(req.body.pinned ? 1 : 0, req.params.id);
  emitToChannel(msg.channel_id, 'message:pin-updated', {
    messageId: req.params.id,
    pinned: req.body.pinned,
  });
  res.json({ ok: true });
});

export default router;
