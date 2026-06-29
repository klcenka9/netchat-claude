import { Router } from 'express';
import { z } from 'zod';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import { env } from '../config/env';
import { db } from '../db/client';
import { snowflake } from '../utils/snowflake';
import { validateBody } from '../middleware/validate.middleware';
import { authRateLimit } from '../middleware/rateLimit.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { hashPassword, verifyPassword } from '../utils/password';
import {
  signAccessToken,
  signTempToken,
  verifyTempToken,
  generateRefreshToken,
  hashToken,
} from '../utils/jwt';
import { encrypt, decrypt } from '../utils/crypto';
import {
  createUser,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  recordFailedLogin,
  clearFailedLogins,
  setTotp,
  setPasswordHash,
  toPublicUser,
} from '../models/user.model';

const router = Router();

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

function issueTokens(userId: string, res: import('express').Response) {
  const access = signAccessToken(userId);
  const refresh = generateRefreshToken();
  db.prepare(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
  ).run(snowflake(), userId, refresh.hash, refresh.expiresAt);
  res.cookie('refresh_token', refresh.token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });
  return access;
}

const registerSchema = z.object({
  username: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-zA-Z0-9_.]+$/, 'Letters, numbers, underscore and dot only'),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  registrationCode: z.string(),
});

router.post('/register', authRateLimit, validateBody(registerSchema), async (req, res) => {
  const { username, email, password, registrationCode } = req.body;
  if (registrationCode !== env.REGISTRATION_CODE) {
    return res.status(403).json({ error: 'Invalid registration code' });
  }
  if (getUserByEmail(email)) return res.status(409).json({ error: 'Email already in use' });
  if (getUserByUsername(username)) return res.status(409).json({ error: 'Username taken' });

  const passwordHash = await hashPassword(password);
  const user = createUser({ username, email, passwordHash });
  const access = issueTokens(user.id, res);
  res.status(201).json({ accessToken: access, user: toPublicUser(user) });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/login', authRateLimit, validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = getUserByEmail(email);
  // Constant-ish response to avoid user enumeration.
  if (!user) {
    await hashPassword('dummy'); // burn time
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const now = Math.floor(Date.now() / 1000);
  if (user.locked_until && user.locked_until > now) {
    return res
      .status(423)
      .json({ error: 'Account locked due to failed attempts. Try again later.' });
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    recordFailedLogin(user.id, MAX_ATTEMPTS, LOCK_MS);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  clearFailedLogins(user.id);

  if (user.totp_enabled) {
    return res.json({ requiresTwoFactor: true, tempToken: signTempToken(user.id) });
  }
  const access = issueTokens(user.id, res);
  res.json({ accessToken: access, user: toPublicUser(user) });
});

const twoFaVerifySchema = z.object({ tempToken: z.string(), code: z.string() });

router.post('/2fa/verify', validateBody(twoFaVerifySchema), (req, res) => {
  const { tempToken, code } = req.body;
  let userId: string;
  try {
    userId = verifyTempToken(tempToken).sub;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired 2FA session' });
  }
  const user = getUserById(userId);
  if (!user || !user.totp_enabled || !user.totp_secret) {
    return res.status(400).json({ error: '2FA not enabled' });
  }
  const secret = decrypt(user.totp_secret);
  if (!authenticator.check(code, secret)) {
    return res.status(401).json({ error: 'Invalid 2FA code' });
  }
  const access = issueTokens(user.id, res);
  res.json({ accessToken: access, user: toPublicUser(user) });
});

router.post('/2fa/enable', requireAuth, (req, res) => {
  const user = getUserById(req.userId!)!;
  const secret = authenticator.generateSecret();
  // Stash encrypted but not yet enabled until confirmed.
  setTotp(user.id, encrypt(secret), false);
  const otpauth = authenticator.keyuri(user.username, 'NetChat', secret);
  qrcode.toDataURL(otpauth, (err, dataUrl) => {
    if (err) return res.status(500).json({ error: 'Failed to generate QR' });
    res.json({ secret, otpauth, qr: dataUrl });
  });
});

const twoFaConfirmSchema = z.object({ code: z.string() });

router.post('/2fa/confirm', requireAuth, validateBody(twoFaConfirmSchema), (req, res) => {
  const user = getUserById(req.userId!)!;
  if (!user.totp_secret) return res.status(400).json({ error: 'Start 2FA setup first' });
  const secret = decrypt(user.totp_secret);
  if (!authenticator.check(req.body.code, secret)) {
    return res.status(401).json({ error: 'Invalid code' });
  }
  setTotp(user.id, user.totp_secret, true);
  res.json({ enabled: true });
});

const twoFaDisableSchema = z.object({ password: z.string() });

router.post('/2fa/disable', requireAuth, validateBody(twoFaDisableSchema), async (req, res) => {
  const user = getUserById(req.userId!)!;
  if (!(await verifyPassword(req.body.password, user.password_hash))) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  setTotp(user.id, null, false);
  res.json({ enabled: false });
});

const resetSchema = z.object({ token: z.string(), password: z.string().min(8).max(200) });

// Consumes the one-time link produced by the admin:reset-password CLI.
router.post('/reset-password', authRateLimit, validateBody(resetSchema), async (req, res) => {
  const { token, password } = req.body;
  const row = db
    .prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ?')
    .get(hashToken(token)) as
    | { id: string; user_id: string; expires_at: number; used: number }
    | undefined;
  if (!row || row.used || row.expires_at < Math.floor(Date.now() / 1000)) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }
  setPasswordHash(row.user_id, await hashPassword(password));
  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(row.id);
  // Invalidate all existing sessions for safety.
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(row.user_id);
  clearFailedLogins(row.user_id);
  res.json({ ok: true });
});

router.post('/refresh', (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ error: 'No refresh token' });
  const hash = hashToken(token);
  const row = db
    .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?')
    .get(hash) as { id: string; user_id: string; expires_at: number } | undefined;
  if (!row || row.expires_at < Math.floor(Date.now() / 1000)) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
  // Rotate: delete the old token, issue a fresh pair.
  db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(row.id);
  const access = issueTokens(row.user_id, res);
  res.json({ accessToken: access });
});

router.post('/logout', requireAuth, (req, res) => {
  const token = req.cookies?.refresh_token;
  if (token) {
    db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(hashToken(token));
  }
  res.clearCookie('refresh_token', { path: '/api/auth' });
  res.json({ ok: true });
});

export default router;
