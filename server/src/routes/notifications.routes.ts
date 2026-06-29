import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';

const router = Router();

router.get('/notification-settings', requireAuth, (req, res) => {
  res.json(
    db.prepare('SELECT scope_type, scope_id, level FROM notification_settings WHERE user_id = ?').all(
      req.userId!,
    ),
  );
});

const putSchema = z.object({
  scope_type: z.enum(['server', 'channel']),
  scope_id: z.string(),
  level: z.enum(['all', 'mentions', 'none']),
});

router.put('/notification-settings', requireAuth, validateBody(putSchema), (req, res) => {
  db.prepare(
    `INSERT INTO notification_settings (user_id, scope_type, scope_id, level)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, scope_type, scope_id) DO UPDATE SET level = excluded.level`,
  ).run(req.userId!, req.body.scope_type, req.body.scope_id, req.body.level);
  res.json({ ok: true });
});

// Mark a channel/DM as read up to a message (unread badge support).
const readSchema = z.object({
  channelId: z.string().optional(),
  dmChannelId: z.string().optional(),
  lastReadMessage: z.string(),
});
router.put('/read-state', requireAuth, validateBody(readSchema), (req, res) => {
  db.prepare(
    `INSERT INTO read_states (user_id, channel_id, dm_channel_id, last_read_message)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, channel_id, dm_channel_id) DO UPDATE SET last_read_message = excluded.last_read_message`,
  ).run(req.userId!, req.body.channelId ?? null, req.body.dmChannelId ?? null, req.body.lastReadMessage);
  res.json({ ok: true });
});

router.get('/read-state', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM read_states WHERE user_id = ?').all(req.userId!));
});

export default router;
