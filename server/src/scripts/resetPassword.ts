/**
 * Host-run CLI password reset (spec §8). No mail server required.
 *   npm run admin:reset-password -- --username <name>
 * Produces a one-time reset link (1h expiry) the host sends to the friend out-of-band.
 */
import crypto from 'crypto';
import { migrate } from '../db/migrate';
import { db } from '../db/client';
import { snowflake } from '../utils/snowflake';
import { hashToken } from '../utils/jwt';
import { getUserByUsername } from '../models/user.model';
import { env } from '../config/env';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function main() {
  migrate();
  const username = arg('username');
  if (!username) {
    console.error('Usage: npm run admin:reset-password -- --username <name>');
    process.exit(1);
  }
  const user = getUserByUsername(username);
  if (!user) {
    console.error(`No user named "${username}"`);
    process.exit(1);
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour
  db.prepare(
    'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
  ).run(snowflake(), user.id, hashToken(token), expiresAt);

  const link = `${env.CLIENT_ORIGIN}/reset-password?token=${token}`;
  console.log('\nOne-time password reset link (valid 1 hour):');
  console.log(link);
  console.log('\nSend this to the user directly. It can be used once.\n');
}

main();
