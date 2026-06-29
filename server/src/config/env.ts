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
};

export const isProd = env.NODE_ENV === 'production';
