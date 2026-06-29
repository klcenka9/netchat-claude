import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { memberHasChannelPermission } from '../utils/permissionResolver';
import { Permissions } from '../utils/permissions';
import { getMessageRow, serializeMessage } from '../models/message.model';

// Most message mutation happens over Socket.io (§9). This router serves the few
// REST reads not already covered by channels.routes (single-message fetch for
// reply jump-to-source / permalinks).
const router = Router();

router.get('/messages/:id', requireAuth, (req, res) => {
  const row = getMessageRow(req.params.id);
  if (!row || row.deleted) return res.status(404).json({ error: 'Not found' });
  if (!memberHasChannelPermission(row.channel_id, req.userId!, Permissions.VIEW_CHANNELS)) {
    return res.status(403).json({ error: 'Cannot view' });
  }
  res.json(serializeMessage(req.params.id));
});

export default router;
