import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 30;

export interface AccessPayload {
  sub: string; // user id
  type: 'access';
}

export interface TempPayload {
  sub: string;
  type: '2fa';
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'access' } as AccessPayload, env.JWT_SECRET, {
    expiresIn: ACCESS_TTL,
  });
}

export function signTempToken(userId: string): string {
  // Short-lived token used between password step and 2FA step.
  return jwt.sign({ sub: userId, type: '2fa' } as TempPayload, env.JWT_SECRET, {
    expiresIn: '5m',
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as AccessPayload;
  if (decoded.type !== 'access') throw new Error('Wrong token type');
  return decoded;
}

export function verifyTempToken(token: string): TempPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as TempPayload;
  if (decoded.type !== '2fa') throw new Error('Wrong token type');
  return decoded;
}

// Refresh tokens are opaque random strings; only their hash is stored in DB.
export function generateRefreshToken(): { token: string; hash: string; expiresAt: number } {
  const token = crypto.randomBytes(48).toString('hex');
  const hash = hashToken(token);
  const expiresAt = Math.floor(Date.now() / 1000) + REFRESH_TTL_DAYS * 24 * 60 * 60;
  return { token, hash, expiresAt };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
