import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { hashToken, generateRefreshToken } from './jwt';

describe('hashToken', () => {
  it('is deterministic (same input -> same SHA-256 hex)', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).toBe(crypto.createHash('sha256').update('abc').digest('hex'));
  });
  it('differs for different inputs', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});

describe('webhook ingress hashing path', () => {
  it('the right token hashes to the stored hash, a wrong one does not', () => {
    // mirrors webhooks.routes.ts: store hashToken(token), verify hashToken(presented).
    const token = crypto.randomBytes(24).toString('hex');
    const stored = hashToken(token);
    expect(hashToken(token)).toBe(stored); // accept
    expect(hashToken(token + 'x')).not.toBe(stored); // reject
  });
});

describe('generateRefreshToken', () => {
  it('returns a token whose hash matches hashToken and a future expiry', () => {
    const { token, hash, expiresAt } = generateRefreshToken();
    expect(hashToken(token)).toBe(hash);
    expect(expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});
