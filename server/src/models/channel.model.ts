import { db } from '../db/client';
import { snowflake } from '../utils/snowflake';

export interface Channel {
  id: string;
  server_id: string;
  category_id: string | null;
  parent_channel_id: string | null;
  name: string;
  type: 'text' | 'voice' | 'thread';
  topic: string | null;
  nsfw: number;
  slowmode_seconds: number;
  archived: number;
  position: number;
}

export function createChannel(params: {
  serverId: string;
  name: string;
  type: 'text' | 'voice' | 'thread';
  categoryId?: string | null;
  parentChannelId?: string | null;
}): Channel {
  const id = snowflake();
  const maxPos = (db
    .prepare('SELECT MAX(position) AS m FROM channels WHERE server_id = ?')
    .get(params.serverId) as { m: number | null }).m;
  db.prepare(
    `INSERT INTO channels (id, server_id, category_id, parent_channel_id, name, type, position)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.serverId,
    params.categoryId ?? null,
    params.parentChannelId ?? null,
    params.name,
    params.type,
    (maxPos ?? 0) + 1,
  );
  return getChannel(id)!;
}

export function getChannel(id: string): Channel | undefined {
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Channel | undefined;
}

export function listChannels(serverId: string): Channel[] {
  return db
    .prepare(
      "SELECT * FROM channels WHERE server_id = ? AND type != 'thread' ORDER BY position ASC",
    )
    .all(serverId) as Channel[];
}

export function listThreads(parentChannelId: string): Channel[] {
  return db
    .prepare("SELECT * FROM channels WHERE parent_channel_id = ? AND type = 'thread' ORDER BY id DESC")
    .all(parentChannelId) as Channel[];
}

export function updateChannel(
  id: string,
  fields: Partial<
    Pick<Channel, 'name' | 'topic' | 'nsfw' | 'slowmode_seconds' | 'position' | 'category_id' | 'archived'>
  >,
): Channel | undefined {
  const keys = (
    ['name', 'topic', 'nsfw', 'slowmode_seconds', 'position', 'category_id', 'archived'] as const
  ).filter((k) => fields[k] !== undefined);
  if (keys.length === 0) return getChannel(id);
  const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE channels SET ${setClause} WHERE id = @id`).run({ id, ...fields });
  return getChannel(id);
}

export function deleteChannel(id: string): void {
  db.prepare('DELETE FROM channels WHERE id = ?').run(id);
}

// Categories
export function createCategory(serverId: string, name: string) {
  const id = snowflake();
  const maxPos = (db
    .prepare('SELECT MAX(position) AS m FROM categories WHERE server_id = ?')
    .get(serverId) as { m: number | null }).m;
  db.prepare('INSERT INTO categories (id, server_id, name, position) VALUES (?, ?, ?, ?)').run(
    id,
    serverId,
    name,
    (maxPos ?? 0) + 1,
  );
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

export function listCategories(serverId: string) {
  return db
    .prepare('SELECT * FROM categories WHERE server_id = ? ORDER BY position ASC')
    .all(serverId);
}
