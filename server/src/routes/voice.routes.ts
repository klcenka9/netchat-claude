import { Router } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Shared STUN/TURN config for server voice + DM calls (spec §8/§10).
router.get('/ice-config', requireAuth, (req, res) => {
  const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [
    { urls: 'stun:stun.l.google.com:19302' },
  ];

  if (env.TURN_URL && env.TURN_STATIC_USERNAME && env.TURN_STATIC_CREDENTIAL) {
    // Managed/external TURN with static credentials (no local coturn).
    iceServers.push({
      urls: env.TURN_URL,
      username: env.TURN_STATIC_USERNAME,
      credential: env.TURN_STATIC_CREDENTIAL,
    });
  } else {
    // Self-hosted coturn `use-auth-secret`: username = "<unixExpiry>:<userId>",
    // credential = base64(HMAC-SHA1(secret, username)). Time-limited, signed
    // per request — never hardcoded.
    const expiry = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const username = `${expiry}:${req.userId!}`;
    const credential = crypto.createHmac('sha1', env.TURN_SECRET).update(username).digest('base64');
    iceServers.push({ urls: `turn:${env.TURN_DOMAIN}:3478`, username, credential });
  }

  res.json({ iceServers });
});

export default router;
