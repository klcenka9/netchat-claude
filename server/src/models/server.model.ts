import { db } from '../db/client';
import { snowflake } from '../utils/snowflake';
import { createEveryoneRole } from './role.model';
import { createChannel, createCategory } from './channel.model';

export interface Server {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  banner_url: string | null;
  owner_id: string;
  created_at: number;
}

// Creates a server with the default @everyone role, a default category,
// a #general text channel and a #General voice channel (spec §2).
export function createServer(ownerId: string, name: string): Server {
  const id = snowflake();
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO servers (id, name, owner_id) VALUES (?, ?, ?)').run(id, name, ownerId);
    db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (?, ?)').run(id, ownerId);
    createEveryoneRole(id);
    const category = createCategory(id, 'Text Channels') as { id: string };
    createChannel({ serverId: id, name: 'general', type: 'text', categoryId: category.id });
    createChannel({ serverId: id, name: 'General', type: 'voice', categoryId: category.id });
  });
  tx();
  return getServer(id)!;
}

export function getServer(id: string): Server | undefined {
  return db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as Server | undefined;
}

export function listServersForUser(userId: string): Server[] {
  return db
    .prepare(
      `SELECT s.* FROM servers s
       JOIN server_members m ON m.server_id = s.id
       WHERE m.user_id = ? ORDER BY s.created_at ASC`,
    )
    .all(userId) as Server[];
}

export function updateServer(
  id: string,
  fields: Partial<Pick<Server, 'name' | 'description' | 'icon_url' | 'banner_url'>>,
): Server | undefined {
  const keys = (['name', 'description', 'icon_url', 'banner_url'] as const).filter(
    (k) => fields[k] !== undefined,
  );
  if (keys.length === 0) return getServer(id);
  const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE servers SET ${setClause} WHERE id = @id`).run({ id, ...fields });
  return getServer(id);
}

export function deleteServer(id: string): void {
  db.prepare('DELETE FROM servers WHERE id = ?').run(id);
}

export function addMember(serverId: string, userId: string): void {
  db.prepare('INSERT OR IGNORE INTO server_members (server_id, user_id) VALUES (?, ?)').run(
    serverId,
    userId,
  );
}

export function removeMember(serverId: string, userId: string): void {
  db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(serverId, userId);
}

export function isMember(serverId: string, userId: string): boolean {
  return !!db
    .prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?')
    .get(serverId, userId);
}

export function listMembers(serverId: string) {
  return db
    .prepare(
      `SELECT sm.user_id, sm.nickname, sm.joined_at, u.username, u.display_name,
              u.avatar_url, u.status, u.custom_status
       FROM server_members sm JOIN users u ON u.id = sm.user_id
       WHERE sm.server_id = ?`,
    )
    .all(serverId);
}

export function setNickname(serverId: string, userId: string, nickname: string | null): void {
  db.prepare('UPDATE server_members SET nickname = ? WHERE server_id = ? AND user_id = ?').run(
    nickname,
    serverId,
    userId,
  );
}
