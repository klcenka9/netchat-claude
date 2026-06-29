import { db } from '../db/client';
import { snowflake } from '../utils/snowflake';

export function logAudit(params: {
  serverId: string;
  actorId: string;
  actionType: string;
  targetType?: string | null;
  targetId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}): void {
  db.prepare(
    `INSERT INTO audit_log (id, server_id, actor_id, action_type, target_type, target_id, reason, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    snowflake(),
    params.serverId,
    params.actorId,
    params.actionType,
    params.targetType ?? null,
    params.targetId ?? null,
    params.reason ?? null,
    params.metadata ? JSON.stringify(params.metadata) : null,
  );
}

export function getAuditLog(serverId: string, limit: number, before?: string) {
  if (before) {
    return db
      .prepare(
        'SELECT * FROM audit_log WHERE server_id = ? AND id < ? ORDER BY id DESC LIMIT ?',
      )
      .all(serverId, before, limit);
  }
  return db
    .prepare('SELECT * FROM audit_log WHERE server_id = ? ORDER BY id DESC LIMIT ?')
    .all(serverId, limit);
}
