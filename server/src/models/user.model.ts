import { db } from '../db/client';
import { snowflake } from '../utils/snowflake';

export interface User {
  id: string;
  username: string;
  display_name: string;
  email: string;
  password_hash: string;
  avatar_url: string | null;
  banner_url: string | null;
  about_me: string | null;
  pronouns: string | null;
  accent_color: string | null;
  status: string;
  custom_status: string | null;
  theme: string;
  totp_secret: string | null;
  totp_enabled: number;
  failed_login_attempts: number;
  locked_until: number | null;
  created_at: number;
}

// Public-safe shape (no secrets) returned to clients.
export interface PublicUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  about_me: string | null;
  pronouns: string | null;
  accent_color: string | null;
  status: string;
  custom_status: string | null;
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    banner_url: u.banner_url,
    about_me: u.about_me,
    pronouns: u.pronouns,
    accent_color: u.accent_color,
    status: u.status === 'invisible' ? 'offline' : u.status,
    custom_status: u.custom_status,
  };
}

const insertStmt = db.prepare(`
  INSERT INTO users (id, username, display_name, email, password_hash)
  VALUES (@id, @username, @display_name, @email, @password_hash)
`);

export function createUser(params: {
  username: string;
  email: string;
  passwordHash: string;
}): User {
  const id = snowflake();
  insertStmt.run({
    id,
    username: params.username,
    display_name: params.username,
    email: params.email,
    password_hash: params.passwordHash,
  });
  return getUserById(id)!;
}

export function getUserById(id: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function getUserByEmail(email: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
}

export function getUserByUsername(username: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
}

export function updateUserProfile(
  id: string,
  fields: Partial<
    Pick<
      User,
      | 'display_name'
      | 'about_me'
      | 'pronouns'
      | 'accent_color'
      | 'theme'
      | 'avatar_url'
      | 'banner_url'
      | 'custom_status'
      | 'status'
    >
  >,
): User | undefined {
  const allowed = [
    'display_name',
    'about_me',
    'pronouns',
    'accent_color',
    'theme',
    'avatar_url',
    'banner_url',
    'custom_status',
    'status',
  ] as const;
  const keys = allowed.filter((k) => fields[k] !== undefined);
  if (keys.length === 0) return getUserById(id);
  const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE users SET ${setClause} WHERE id = @id`).run({ id, ...fields });
  return getUserById(id);
}

export function recordFailedLogin(id: string, maxAttempts: number, lockMs: number): void {
  const user = getUserById(id);
  if (!user) return;
  const attempts = user.failed_login_attempts + 1;
  if (attempts >= maxAttempts) {
    db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(
      attempts,
      Math.floor((Date.now() + lockMs) / 1000),
      id,
    );
  } else {
    db.prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?').run(attempts, id);
  }
}

export function clearFailedLogins(id: string): void {
  db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(id);
}

export function setUserStatus(id: string, status: string, customStatus?: string | null): void {
  if (customStatus !== undefined) {
    db.prepare('UPDATE users SET status = ?, custom_status = ? WHERE id = ?').run(
      status,
      customStatus,
      id,
    );
  } else {
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
  }
}

export function setTotp(id: string, secret: string | null, enabled: boolean): void {
  db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = ? WHERE id = ?').run(
    secret,
    enabled ? 1 : 0,
    id,
  );
}

export function setPasswordHash(id: string, hash: string): void {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
}
