import Database from 'better-sqlite3';
import { env } from '../config/env';
import { runMigrations } from './runMigrations';

export const db = new Database(env.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Ensure schema exists before any model prepares a statement. Idempotent
// (CREATE TABLE IF NOT EXISTS), so it's safe to run on every boot.
runMigrations(db);

export default db;
