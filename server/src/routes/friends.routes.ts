import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { getUserById, getUserByUsername, toPublicUser } from '../models/user.model';
import {
  listFriendships,
  getFriendship,
  createRequest,
  acceptRequest,
  removeFriendship,
  block,
  unblock,
  listBlocks,
  eitherBlocked,
} from '../models/friendship.model';
import { emitToUser } from '../utils/realtime';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const friendships = listFriendships(req.userId!, status).map((f) => ({
    ...f,
    user: toPublicUser(getUserById(f.otherUserId)!),
  }));
  res.json(friendships);
});

router.get('/blocks', requireAuth, (req, res) => {
  const ids = listBlocks(req.userId!);
  res.json(ids.map((id) => toPublicUser(getUserById(id)!)));
});

const requestSchema = z.object({ username: z.string() });

router.post('/request', requireAuth, validateBody(requestSchema), (req, res) => {
  const target = getUserByUsername(req.body.username);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.userId!) return res.status(400).json({ error: 'Cannot friend yourself' });
  if (eitherBlocked(req.userId!, target.id)) {
    return res.status(403).json({ error: 'Cannot send request' });
  }
  const existing = getFriendship(req.userId!, target.id);
  if (existing) {
    if (existing.status === 'accepted') return res.status(409).json({ error: 'Already friends' });
    // If the other person already requested us, accept it instead.
    if (existing.requested_by === target.id) {
      acceptRequest(req.userId!, target.id);
      emitToUser(target.id, 'friend:request-accepted', { userId: req.userId! });
      return res.json({ status: 'accepted' });
    }
    return res.status(409).json({ error: 'Request already pending' });
  }
  createRequest(req.userId!, target.id);
  emitToUser(target.id, 'friend:request-received', { userId: req.userId! });
  res.status(201).json({ status: 'pending' });
});

router.post('/:userId/accept', requireAuth, (req, res) => {
  const existing = getFriendship(req.userId!, req.params.userId);
  if (!existing || existing.status !== 'pending' || existing.requested_by === req.userId!) {
    return res.status(404).json({ error: 'No incoming request from this user' });
  }
  acceptRequest(req.userId!, req.params.userId);
  emitToUser(req.params.userId, 'friend:request-accepted', { userId: req.userId! });
  res.json({ status: 'accepted' });
});

// Removes a friend OR declines a pending request.
router.delete('/:userId', requireAuth, (req, res) => {
  const existing = getFriendship(req.userId!, req.params.userId);
  if (!existing) return res.status(404).json({ error: 'No relationship' });
  removeFriendship(req.userId!, req.params.userId);
  emitToUser(req.params.userId, 'friend:removed', { userId: req.userId! });
  res.json({ ok: true });
});

// Mounted separately at /api/blocks.
export const blocksRouter = Router();

const blockSchema = z.object({ userId: z.string() });

blocksRouter.post('/', requireAuth, validateBody(blockSchema), (req, res) => {
  if (req.body.userId === req.userId!) return res.status(400).json({ error: 'Cannot block self' });
  if (!getUserById(req.body.userId)) return res.status(404).json({ error: 'User not found' });
  block(req.userId!, req.body.userId);
  res.status(201).json({ ok: true });
});

blocksRouter.delete('/:userId', requireAuth, (req, res) => {
  unblock(req.userId!, req.params.userId);
  res.json({ ok: true });
});

export default router;
