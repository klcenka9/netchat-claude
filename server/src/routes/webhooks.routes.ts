import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { requireChannelPermission } from '../middleware/permission.middleware';
import { Permissions } from '../utils/permissions';
import { getMemberContext } from '../utils/permissionResolver';
import { snowflake } from '../utils/snowflake';
import { hashToken } from '../utils/jwt';
import { getChannel } from '../models/channel.model';
import { createMessage, serializeMessage } from '../models/message.model';
import { webhookRateLimit } from '../middleware/rateLimit.middleware';
import { emitToChannel } from '../utils/realtime';
import { logAudit } from '../models/auditLog.model';

const router = Router();

router.get(
  '/channels/:id/webhooks',
  requireAuth,
  requireChannelPermission(Permissions.MANAGE_WEBHOOKS),
  (req, res) => {
    const hooks = db
      .prepare('SELECT id, channel_id, name, avatar_url, created_by, created_at FROM webhooks WHERE channel_id = ?')
      .all(req.params.id);
    res.json(hooks);
  },
);

const createSchema = z.object({ name: z.string().min(1).max(80), avatar_url: z.string().optional() });

router.post(
  '/channels/:id/webhooks',
  requireAuth,
  requireChannelPermission(Permissions.MANAGE_WEBHOOKS),
  validateBody(createSchema),
  (req, res) => {
    const channel = getChannel(req.params.id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const id = snowflake();
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare(
      'INSERT INTO webhooks (id, channel_id, name, avatar_url, token_hash, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, req.params.id, req.body.name, req.body.avatar_url ?? null, hashToken(token), req.userId!);
    logAudit({
      serverId: channel.server_id,
      actorId: req.userId!,
      actionType: 'webhook_create',
      targetType: 'channel',
      targetId: channel.id,
    });
    // Token shown exactly once (spec §12).
    res.status(201).json({ id, name: req.body.name, token, url: `/api/webhooks/${id}/${token}` });
  },
);

router.delete('/webhooks/:id', requireAuth, (req, res) => {
  const hook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(req.params.id) as
    | { channel_id: string }
    | undefined;
  if (!hook) return res.status(404).json({ error: 'Not found' });
  const channel = getChannel(hook.channel_id);
  if (!channel) return res.status(404).json({ error: 'Channel gone' });
  const ctx = getMemberContext(channel.server_id, req.userId!);
  if (!ctx.isOwner && !(ctx.basePermissions & Permissions.MANAGE_WEBHOOKS)) {
    return res.status(403).json({ error: 'Missing MANAGE_WEBHOOKS' });
  }
  db.prepare('DELETE FROM webhooks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Public, token-authed ingress — no JWT (spec §8). Rate-limited per webhook.
const ingressSchema = z.object({
  content: z.string().min(1).max(4000),
  username: z.string().max(80).optional(),
  avatar_url: z.string().optional(),
});

router.post(
  '/webhooks/:id/:token',
  webhookRateLimit,
  validateBody(ingressSchema),
  (req, res) => {
    const hook = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(req.params.id) as
      | { id: string; channel_id: string; name: string; avatar_url: string | null; token_hash: string }
      | undefined;
    if (!hook) return res.status(404).json({ error: 'Webhook not found' });
    if (hashToken(req.params.token) !== hook.token_hash) {
      return res.status(401).json({ error: 'Invalid webhook token' });
    }
    const messageId = createMessage({
      channelId: hook.channel_id,
      webhookId: hook.id,
      content: req.body.content,
    });
    const serialized = serializeMessage(messageId) as Record<string, unknown>;
    // Override display name/avatar if the payload provides them.
    if (serialized.webhook && typeof serialized.webhook === 'object') {
      (serialized.webhook as Record<string, unknown>).name = req.body.username ?? hook.name;
      (serialized.webhook as Record<string, unknown>).avatar_url =
        req.body.avatar_url ?? hook.avatar_url;
    }
    emitToChannel(hook.channel_id, 'message:new', serialized);
    res.status(201).json({ ok: true });
  },
);

export default router;
