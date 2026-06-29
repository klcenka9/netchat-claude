import { Router } from 'express';
import { db } from '../db/client';
import { requireAuth } from '../middleware/auth.middleware';
import { requireServerMember } from '../middleware/permission.middleware';
import { memberHasChannelPermission } from '../utils/permissionResolver';
import { Permissions } from '../utils/permissions';
import { serializeMessage } from '../models/message.model';

const router = Router();

// FTS5-backed search across a server, optionally scoped/filtered (spec §8).
router.get('/servers/:id/search', requireAuth, requireServerMember(), (req, res) => {
  const serverId = req.params.id;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const channelId = typeof req.query.channelId === 'string' ? req.query.channelId : null;
  const authorId = typeof req.query.authorId === 'string' ? req.query.authorId : null;
  const hasAttachment = req.query.hasAttachment === 'true';

  const ftsJoin = q ? 'JOIN messages_fts fts ON fts.rowid = m.rowid' : '';
  const conditions: string[] = ['m.deleted = 0', 'c.server_id = ?'];
  const params: unknown[] = [serverId];

  if (q) {
    conditions.push('messages_fts MATCH ?');
    params.push(q);
  }
  if (channelId) {
    conditions.push('m.channel_id = ?');
    params.push(channelId);
  }
  if (authorId) {
    conditions.push('m.author_id = ?');
    params.push(authorId);
  }
  if (hasAttachment) {
    conditions.push('EXISTS (SELECT 1 FROM message_attachments a WHERE a.message_id = m.id)');
  }

  const sql = `SELECT m.id, m.channel_id FROM messages m
     JOIN channels c ON c.id = m.channel_id ${ftsJoin}
     WHERE ${conditions.join(' AND ')} ORDER BY m.id DESC LIMIT 50`;

  let rows: { id: string; channel_id: string }[];
  try {
    rows = db.prepare(sql).all(...params) as { id: string; channel_id: string }[];
  } catch {
    // Malformed FTS query string — return no results rather than 500.
    return res.json([]);
  }

  // Hide channels the user can't view via overwrites.
  const visible = rows.filter((r) =>
    memberHasChannelPermission(r.channel_id, req.userId!, Permissions.VIEW_CHANNELS),
  );
  res.json(visible.map((r) => serializeMessage(r.id)));
});

export default router;
