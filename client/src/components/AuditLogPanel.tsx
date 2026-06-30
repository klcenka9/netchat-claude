import { useEffect, useState } from 'react';
import { api } from '../api/http';
import { useServerStore } from '../store/serverStore';

interface AuditEntry {
  id: string;
  actor_id: string;
  action_type: string;
  target_type: string | null;
  target_id: string | null;
  reason: string | null;
  metadata_json: string | null;
  created_at: number;
}

export default function AuditLogPanel({ serverId }: { serverId: string }) {
  const members = useServerStore((s) => s.members[serverId] ?? []);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<AuditEntry[]>(`/servers/${serverId}/audit-log`)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [serverId]);

  function name(userId: string) {
    const m = members.find((x) => x.user_id === userId);
    return m ? m.nickname ?? m.display_name : userId;
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold mb-4">Audit Log</h2>
      {loading && <div className="text-muted text-sm">Loading…</div>}
      {!loading && entries.length === 0 && <div className="text-muted text-sm">No entries.</div>}
      <div className="space-y-1">
        {entries.map((e) => (
          <div key={e.id} className="bg-bg-alt rounded px-3 py-2 text-sm flex justify-between gap-3">
            <div className="min-w-0">
              <span className="font-medium">{name(e.actor_id)}</span>{' '}
              <span className="text-muted">{e.action_type.replace(/_/g, ' ')}</span>
              {e.target_type && (
                <span className="text-muted">
                  {' '}
                  ({e.target_type}
                  {e.target_id ? ` ${e.target_id}` : ''})
                </span>
              )}
              {e.reason && <div className="text-muted text-xs">Reason: {e.reason}</div>}
            </div>
            <div className="text-xs text-muted shrink-0">
              {new Date(e.created_at * 1000).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
