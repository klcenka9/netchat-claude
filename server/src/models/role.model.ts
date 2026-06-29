import { db } from '../db/client';
import { snowflake } from '../utils/snowflake';
import { EVERYONE_DEFAULT_PERMISSIONS } from '../utils/permissions';

export interface Role {
  id: string;
  server_id: string;
  name: string;
  color: string;
  permissions: number;
  position: number;
  hoist: number;
  is_default: number;
}

export function createEveryoneRole(serverId: string): Role {
  const id = snowflake();
  db.prepare(
    `INSERT INTO roles (id, server_id, name, color, permissions, position, hoist, is_default)
     VALUES (?, ?, '@everyone', '#99AAB5', ?, 0, 0, 1)`,
  ).run(id, serverId, EVERYONE_DEFAULT_PERMISSIONS);
  return getRole(id)!;
}

export function createRole(
  serverId: string,
  params: { name: string; color?: string; permissions?: number; hoist?: boolean },
): Role {
  const id = snowflake();
  const maxPos = (db
    .prepare('SELECT MAX(position) AS m FROM roles WHERE server_id = ?')
    .get(serverId) as { m: number | null }).m;
  db.prepare(
    `INSERT INTO roles (id, server_id, name, color, permissions, position, hoist, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(
    id,
    serverId,
    params.name,
    params.color ?? '#99AAB5',
    params.permissions ?? 0,
    (maxPos ?? 0) + 1,
    params.hoist ? 1 : 0,
  );
  return getRole(id)!;
}

export function getRole(id: string): Role | undefined {
  return db.prepare('SELECT * FROM roles WHERE id = ?').get(id) as Role | undefined;
}

export function listRoles(serverId: string): Role[] {
  return db
    .prepare('SELECT * FROM roles WHERE server_id = ? ORDER BY position DESC')
    .all(serverId) as Role[];
}

export function updateRole(
  id: string,
  fields: Partial<Pick<Role, 'name' | 'color' | 'permissions' | 'position' | 'hoist'>>,
): Role | undefined {
  const keys = (['name', 'color', 'permissions', 'position', 'hoist'] as const).filter(
    (k) => fields[k] !== undefined,
  );
  if (keys.length === 0) return getRole(id);
  const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE roles SET ${setClause} WHERE id = @id`).run({ id, ...fields });
  return getRole(id);
}

export function deleteRole(id: string): void {
  db.prepare('DELETE FROM roles WHERE id = ? AND is_default = 0').run(id);
}

export function assignRole(serverId: string, userId: string, roleId: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)',
  ).run(serverId, userId, roleId);
}

export function unassignRole(serverId: string, userId: string, roleId: string): void {
  db.prepare('DELETE FROM member_roles WHERE server_id = ? AND user_id = ? AND role_id = ?').run(
    serverId,
    userId,
    roleId,
  );
}

export function getMemberRoleIds(serverId: string, userId: string): string[] {
  return (
    db
      .prepare('SELECT role_id FROM member_roles WHERE server_id = ? AND user_id = ?')
      .all(serverId, userId) as { role_id: string }[]
  ).map((r) => r.role_id);
}
