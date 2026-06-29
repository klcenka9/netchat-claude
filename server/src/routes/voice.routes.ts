import { Router } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Shared STUN/TURN config for server voice + DM calls (spec §8/§10).
// coturn `use-auth-secret`: username = "<unixExpiry>:<userId>", credential =
// base64(HMAC-SHA1(secret, username)). Credentials are time-limited and signed
// per request — never hardcoded.
router.get('/ice-config', requireAuth, (req, res) => {
  const ttl = 24 * 60 * 60; // 24h
  const expiry = Math.floor(Date.now() / 1000) + ttl;
  const username = `${expiry}:${req.userId!}`;
  const credential = crypto
    .createHmac('sha1', env.TURN_SECRET)
    .update(username)
    .digest('base64');

  res.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      {
        urls: `turn:${env.TURN_DOMAIN}:3478`,
        username,
        credential,
      },
    ],
  });
});

export default router;
