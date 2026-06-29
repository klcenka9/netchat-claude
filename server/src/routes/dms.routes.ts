import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { getUserById } from '../models/user.model';
import { eitherBlocked } from '../models/friendship.model';
import {
  openDirectDm,
  createGroupDm,
  getDmChannel,
  listDmsForUser,
  listParticipants,
  isParticipant,
  serializeDmMessage,
} from '../models/dm.model';
import { emitToUser } from '../utils/realtime';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  res.json(listDmsForUser(req.userId!));
});

const openSchema = z.object({
  userId: z.string().optional(),
  userIds: z.array(z.string()).optional(),
  name: z.string().max(100).optional(),
});

router.post('/', requireAuth, validateBody(openSchema), (req, res) => {
  // 1:1 DM
  if (req.body.userId) {
    if (req.body.userId === req.userId!) return res.status(400).json({ error: 'Cannot DM self' });
    if (!getUserById(req.body.userId)) return res.status(404).json({ error: 'User not found' });
    if (eitherBlocked(req.userId!, req.body.userId)) {
      return res.status(403).json({ error: 'Blocked' });
    }
    const id = openDirectDm(req.userId!, req.body.userId);
    return res.json(getDmChannel(id));
  }
  // Group DM
  if (req.body.userIds && req.body.userIds.length > 0) {
    for (const uid of req.body.userIds) {
      if (!getUserById(uid)) return res.status(404).json({ error: `Unknown user ${uid}` });
    }
    const id = createGroupDm(req.userId!, req.body.userIds, req.body.name);
    const dm = getDmChannel(id);
    for (const uid of listParticipants(id)) {
      emitToUser(uid, 'dm:created', dm);
    }
    return res.status(201).json(dm);
  }
  res.status(400).json({ error: 'Provide userId or userIds' });
});

router.get('/:id/messages', requireAuth, (req, res) => {
  if (!isParticipant(req.params.id, req.userId!)) {
    return res.status(403).json({ error: 'Not a participant' });
  }
  const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 100);
  const before = typeof req.query.before === 'string' ? req.query.before : null;
  const rows = before
    ? (db
        .prepare(
          'SELECT id FROM dm_messages WHERE dm_channel_id = ? AND deleted = 0 AND id < ? ORDER BY id DESC LIMIT ?',
        )
        .all(req.params.id, before, limit) as { id: string }[])
    : (db
        .prepare(
          'SELECT id FROM dm_messages WHERE dm_channel_id = ? AND deleted = 0 ORDER BY id DESC LIMIT ?',
        )
        .all(req.params.id, limit) as { id: string }[]);
  res.json(rows.map((r) => serializeDmMessage(r.id)).reverse());
});

const renameSchema = z.object({ name: z.string().max(100).nullable() });
router.patch('/:id', requireAuth, validateBody(renameSchema), (req, res) => {
  const dm = getDmChannel(req.params.id);
  if (!dm || !dm.is_group) return res.status(400).json({ error: 'Group DM only' });
  if (!isParticipant(req.params.id, req.userId!)) {
    return res.status(403).json({ error: 'Not a participant' });
  }
  db.prepare('UPDATE dm_channels SET name = ? WHERE id = ?').run(req.body.name, req.params.id);
  for (const uid of listParticipants(req.params.id)) {
    emitToUser(uid, 'dm:updated', getDmChannel(req.params.id));
  }
  res.json(getDmChannel(req.params.id));
});

const participantSchema = z.object({ userId: z.string() });
router.post('/:id/participants', requireAuth, validateBody(participantSchema), (req, res) => {
  const dm = getDmChannel(req.params.id);
  if (!dm || !dm.is_group) return res.status(400).json({ error: 'Group DM only' });
  if (!isParticipant(req.params.id, req.userId!)) {
    return res.status(403).json({ error: 'Not a participant' });
  }
  if (!getUserById(req.body.userId)) return res.status(404).json({ error: 'User not found' });
  db.prepare('INSERT OR IGNORE INTO dm_participants (dm_channel_id, user_id) VALUES (?, ?)').run(
    req.params.id,
    req.body.userId,
  );
  for (const uid of listParticipants(req.params.id)) {
    emitToUser(uid, 'dm:participants-updated', { dmChannelId: req.params.id });
  }
  emitToUser(req.body.userId, 'dm:created', getDmChannel(req.params.id));
  res.json({ ok: true });
});

// Remove a participant, or leave (userId omitted = self).
router.delete('/:id/participants/:userId?', requireAuth, (req, res) => {
  const dm = getDmChannel(req.params.id);
  if (!dm || !dm.is_group) return res.status(400).json({ error: 'Group DM only' });
  if (!isParticipant(req.params.id, req.userId!)) {
    return res.status(403).json({ error: 'Not a participant' });
  }
  const target = req.params.userId ?? req.userId!;
  db.prepare('DELETE FROM dm_participants WHERE dm_channel_id = ? AND user_id = ?').run(
    req.params.id,
    target,
  );
  for (const uid of listParticipants(req.params.id)) {
    emitToUser(uid, 'dm:participants-updated', { dmChannelId: req.params.id });
  }
  emitToUser(target, 'dm:removed', { dmChannelId: req.params.id });
  res.json({ ok: true });
});

export default router;
