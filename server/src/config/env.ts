import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const env = {
  PORT: parseInt(process.env.PORT ?? '3000', 10),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  JWT_SECRET: required('JWT_SECRET', 'dev_jwt_secret_change_me_change_me_32'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_me_change_32'),
  DB_PATH: path.resolve(process.env.DB_PATH ?? './netchat.db'),
  UPLOADS_DIR: path.resolve(process.env.UPLOADS_DIR ?? './uploads'),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  TURN_SECRET: process.env.TURN_SECRET ?? 'dev_turn_secret',
  TURN_DOMAIN: process.env.TURN_DOMAIN ?? 'turn.example.com',
  REGISTRATION_CODE: required('REGISTRATION_CODE', 'dev-code'),
  // Optional: a managed/external TURN with static credentials (e.g. metered.ca,
  // Cloudflare, Twilio). If set, /api/voice/ice-config returns these instead of
  // signing coturn-style time-limited creds — lets a host skip running coturn
  // entirely (handy on Windows where coturn has no native build).
  TURN_URL: process.env.TURN_URL ?? '',
  TURN_STATIC_USERNAME: process.env.TURN_STATIC_USERNAME ?? '',
  TURN_STATIC_CREDENTIAL: process.env.TURN_STATIC_CREDENTIAL ?? '',
};

export const isProd = env.NODE_ENV === 'production';

// Fail fast if production is started with the dev-fallback secrets (§15: no
// hardcoded secrets in a live instance). setup.sh always writes real values.
if (isProd) {
  const insecure: string[] = [];
  if (env.JWT_SECRET.startsWith('dev_')) insecure.push('JWT_SECRET');
  if (env.JWT_REFRESH_SECRET.startsWith('dev_')) insecure.push('JWT_REFRESH_SECRET');
  if (env.TURN_SECRET === 'dev_turn_secret') insecure.push('TURN_SECRET');
  if (env.REGISTRATION_CODE === 'dev-code') insecure.push('REGISTRATION_CODE');
  if (insecure.length) {
    throw new Error(
      `Refusing to start in production with default secrets: ${insecure.join(', ')}. ` +
        'Set real values in server/.env (run ./setup.sh).',
    );
  }
}
