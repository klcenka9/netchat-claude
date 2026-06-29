import { db } from '../db/client';

// Canonical ordering: user_id_a < user_id_b (string comparison matches the CHECK constraint).
export function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function getFriendship(a: string, b: string) {
  const [x, y] = pair(a, b);
  return db
    .prepare('SELECT * FROM friendships WHERE user_id_a = ? AND user_id_b = ?')
    .get(x, y) as
    | { user_id_a: string; user_id_b: string; status: string; requested_by: string; created_at: number }
    | undefined;
}

export function createRequest(requester: string, target: string): void {
  const [x, y] = pair(requester, target);
  db.prepare(
    'INSERT INTO friendships (user_id_a, user_id_b, status, requested_by) VALUES (?, ?, ?, ?)',
  ).run(x, y, 'pending', requester);
}

export function acceptRequest(a: string, b: string): void {
  const [x, y] = pair(a, b);
  db.prepare("UPDATE friendships SET status = 'accepted' WHERE user_id_a = ? AND user_id_b = ?").run(
    x,
    y,
  );
}

export function removeFriendship(a: string, b: string): void {
  const [x, y] = pair(a, b);
  db.prepare('DELETE FROM friendships WHERE user_id_a = ? AND user_id_b = ?').run(x, y);
}

// Returns friendships involving the user, with the *other* user's id surfaced.
export function listFriendships(userId: string, status?: string) {
  const rows = db
    .prepare(
      `SELECT * FROM friendships WHERE (user_id_a = ? OR user_id_b = ?) ${
        status ? 'AND status = ?' : ''
      }`,
    )
    .all(...(status ? [userId, userId, status] : [userId, userId])) as {
    user_id_a: string;
    user_id_b: string;
    status: string;
    requested_by: string;
  }[];
  return rows.map((r) => ({
    otherUserId: r.user_id_a === userId ? r.user_id_b : r.user_id_a,
    status: r.status,
    requestedBy: r.requested_by,
    incoming: r.status === 'pending' && r.requested_by !== userId,
  }));
}

export function isBlocked(blocker: string, blocked: string): boolean {
  return !!db
    .prepare('SELECT 1 FROM blocks WHERE user_id = ? AND blocked_user_id = ?')
    .get(blocker, blocked);
}

// Either direction blocked?
export function eitherBlocked(a: string, b: string): boolean {
  return isBlocked(a, b) || isBlocked(b, a);
}

export function block(blocker: string, blocked: string): void {
  db.prepare('INSERT OR IGNORE INTO blocks (user_id, blocked_user_id) VALUES (?, ?)').run(
    blocker,
    blocked,
  );
  // Blocking removes any existing friendship.
  removeFriendship(blocker, blocked);
}

export function unblock(blocker: string, blocked: string): void {
  db.prepare('DELETE FROM blocks WHERE user_id = ? AND blocked_user_id = ?').run(blocker, blocked);
}

export function listBlocks(userId: string): string[] {
  return (
    db.prepare('SELECT blocked_user_id FROM blocks WHERE user_id = ?').all(userId) as {
      blocked_user_id: string;
    }[]
  ).map((r) => r.blocked_user_id);
}
