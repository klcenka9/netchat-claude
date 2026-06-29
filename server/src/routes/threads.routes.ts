import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { memberHasChannelPermission, getMemberContext } from '../utils/permissionResolver';
import { Permissions } from '../utils/permissions';
import { getChannel, createChannel, listThreads, updateChannel } from '../models/channel.model';
import { emitToServer } from '../utils/realtime';
import { logAudit } from '../models/auditLog.model';

const router = Router();

const createThreadSchema = z.object({
  name: z.string().min(1).max(100),
  sourceMessageId: z.string(),
});

router.post(
  '/channels/:id/threads',
  requireAuth,
  validateBody(createThreadSchema),
  (req, res) => {
    const parent = getChannel(req.params.id);
    if (!parent || parent.type !== 'text') {
      return res.status(400).json({ error: 'Threads must root at a text channel' });
    }
    if (!memberHasChannelPermission(req.params.id, req.userId!, Permissions.CREATE_THREADS)) {
      return res.status(403).json({ error: 'Missing CREATE_THREADS' });
    }
    const thread = createChannel({
      serverId: parent.server_id,
      name: req.body.name,
      type: 'thread',
      categoryId: parent.category_id,
      parentChannelId: parent.id,
    });
    logAudit({
      serverId: parent.server_id,
      actorId: req.userId!,
      actionType: 'thread_create',
      targetType: 'channel',
      targetId: thread.id,
      metadata: { sourceMessageId: req.body.sourceMessageId, parentChannelId: parent.id },
    });
    emitToServer(parent.server_id, 'thread:created', thread);
    res.status(201).json(thread);
  },
);

router.get('/channels/:id/threads', requireAuth, (req, res) => {
  if (!memberHasChannelPermission(req.params.id, req.userId!, Permissions.VIEW_CHANNELS)) {
    return res.status(403).json({ error: 'Cannot view channel' });
  }
  res.json(listThreads(req.params.id));
});

router.patch('/threads/:id/archive', requireAuth, validateBody(z.object({ archived: z.boolean() })), (req, res) => {
  const thread = getChannel(req.params.id);
  if (!thread || thread.type !== 'thread') return res.status(404).json({ error: 'Not found' });
  const ctx = getMemberContext(thread.server_id, req.userId!);
  const canManage = ctx.isOwner || !!(ctx.basePermissions & Permissions.MANAGE_CHANNELS);
  // Thread creator may also archive — approximated via MANAGE_CHANNELS or audit metadata.
  if (!canManage) {
    return res.status(403).json({ error: 'Missing permission' });
  }
  const updated = updateChannel(req.params.id, { archived: req.body.archived ? 1 : 0 });
  emitToServer(thread.server_id, 'channel:updated', updated);
  res.json(updated);
});

export default router;
