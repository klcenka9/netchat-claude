import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  getUserById,
  getUserByUsername,
  updateUserProfile,
  toPublicUser,
  User,
} from '../models/user.model';
import { upload, fileUrl } from './uploads.routes';

const router = Router();

// GET /api/users/me — full self profile (minus secrets).
router.get('/me', requireAuth, (req, res) => {
  const user = getUserById(req.userId!);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(selfView(user));
});

function selfView(u: User) {
  return {
    ...toPublicUser(u),
    email: u.email,
    theme: u.theme,
    status: u.status, // self sees true status incl. invisible
    totp_enabled: !!u.totp_enabled,
  };
}

const patchSchema = z.object({
  display_name: z.string().min(1).max(32).optional(),
  about_me: z.string().max(190).optional(),
  pronouns: z.string().max(40).optional(),
  accent_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  theme: z.enum(['dark', 'light']).optional(),
  custom_status: z.string().max(128).nullable().optional(),
});

router.patch('/me', requireAuth, validateBody(patchSchema), (req, res) => {
  const updated = updateUserProfile(req.userId!, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(selfView(updated));
});

router.post('/me/avatar', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = fileUrl(req.file.filename);
  updateUserProfile(req.userId!, { avatar_url: url });
  res.json({ avatar_url: url });
});

router.post('/me/banner', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = fileUrl(req.file.filename);
  updateUserProfile(req.userId!, { banner_url: url });
  res.json({ banner_url: url });
});

// Resolve a username to a public profile (used to start a DM). Declared before
// '/:id' so "lookup" isn't captured as an id.
router.get('/lookup', requireAuth, (req, res) => {
  const username = typeof req.query.username === 'string' ? req.query.username : '';
  const user = getUserByUsername(username);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(toPublicUser(user));
});

router.get('/:id', requireAuth, (req, res) => {
  const user = getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(toPublicUser(user));
});

export default router;
