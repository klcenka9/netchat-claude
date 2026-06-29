import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { requireServerMember, requireServerPermission } from '../middleware/permission.middleware';
import { Permissions } from '../utils/permissions';
import { getMemberContext } from '../utils/permissionResolver';
import { snowflake } from '../utils/snowflake';
import { upload, fileUrl } from './uploads.routes';
import { logAudit } from '../models/auditLog.model';
import { emitToServer } from '../utils/realtime';

const router = Router();

router.get('/servers/:id/emojis', requireAuth, requireServerMember(), (req, res) => {
  res.json(db.prepare('SELECT * FROM custom_emojis WHERE server_id = ?').all(req.params.id));
});

const nameSchema = z.object({ name: z.string().min(2).max(32).regex(/^[a-zA-Z0-9_]+$/) });

router.post(
  '/servers/:id/emojis',
  requireAuth,
  requireServerPermission(Permissions.MANAGE_EMOJIS),
  upload.single('file'),
  (req, res) => {
    const parsed = nameSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid emoji name' });
    if (!req.file) return res.status(400).json({ error: 'No image' });
    const exists = db
      .prepare('SELECT 1 FROM custom_emojis WHERE server_id = ? AND name = ?')
      .get(req.params.id, parsed.data.name);
    if (exists) return res.status(409).json({ error: 'Emoji name taken' });
    const id = snowflake();
    db.prepare(
      'INSERT INTO custom_emojis (id, server_id, name, image_url, uploaded_by) VALUES (?, ?, ?, ?, ?)',
    ).run(id, req.params.id, parsed.data.name, fileUrl(req.file.filename), req.userId!);
    const emoji = db.prepare('SELECT * FROM custom_emojis WHERE id = ?').get(id);
    logAudit({
      serverId: req.params.id,
      actorId: req.userId!,
      actionType: 'emoji_create',
      targetType: 'emoji',
      targetId: id,
    });
    emitToServer(req.params.id, 'emoji:created', emoji);
    res.status(201).json(emoji);
  },
);

router.delete('/emojis/:id', requireAuth, (req, res) => {
  const emoji = db.prepare('SELECT * FROM custom_emojis WHERE id = ?').get(req.params.id) as
    | { server_id: string }
    | undefined;
  if (!emoji) return res.status(404).json({ error: 'Not found' });
  const ctx = getMemberContext(emoji.server_id, req.userId!);
  if (!ctx.isOwner && !(ctx.basePermissions & Permissions.MANAGE_EMOJIS)) {
    return res.status(403).json({ error: 'Missing MANAGE_EMOJIS' });
  }
  db.prepare('DELETE FROM custom_emojis WHERE id = ?').run(req.params.id);
  emitToServer(emoji.server_id, 'emoji:deleted', { id: req.params.id, serverId: emoji.server_id });
  res.json({ ok: true });
});

export default router;
