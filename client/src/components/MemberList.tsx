import { useServerStore } from '../store/serverStore';
import { usePresenceStore } from '../store/presenceStore';
import Avatar from './Avatar';

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-500',
  idle: 'bg-yellow-500',
  dnd: 'bg-red-500',
  offline: 'bg-gray-500',
  invisible: 'bg-gray-500',
};

export default function MemberList() {
  const { activeServerId, members, roles } = useServerStore();
  const presence = usePresenceStore((s) => s.statuses);
  if (!activeServerId) return null;
  const list = members[activeServerId] ?? [];
  const serverRoles = roles[activeServerId] ?? [];

  // Group by highest hoisted role, else Online/Offline (spec §11).
  const hoisted = serverRoles.filter((r) => r.hoist).sort((a, b) => b.position - a.position);
  const groups: { name: string; members: typeof list }[] = [];
  const assigned = new Set<string>();

  for (const role of hoisted) {
    const inRole = list.filter((m) => !assigned.has(m.user_id) && m.roleIds.includes(role.id));
    inRole.forEach((m) => assigned.add(m.user_id));
    if (inRole.length) groups.push({ name: role.name, members: inRole });
  }
  const online = list.filter(
    (m) => !assigned.has(m.user_id) && (presence[m.user_id]?.status ?? m.status) !== 'offline',
  );
  const offline = list.filter(
    (m) => !assigned.has(m.user_id) && (presence[m.user_id]?.status ?? m.status) === 'offline',
  );
  if (online.length) groups.push({ name: 'Online', members: online });
  if (offline.length) groups.push({ name: 'Offline', members: offline });

  return (
    <div className="w-60 bg-bg-alt overflow-y-auto py-4 shrink-0">
      {groups.map((g) => (
        <div key={g.name} className="px-4 mb-4">
          <div className="text-xs font-bold text-muted uppercase mb-1">
            {g.name} — {g.members.length}
          </div>
          {g.members.map((m) => {
            const status = presence[m.user_id]?.status ?? m.status;
            return (
              <div key={m.user_id} className="flex items-center gap-2 py-1 rounded hover:bg-bg-soft px-1">
                <div className="relative">
                  <Avatar user={m} size={32} />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-alt ${
                      STATUS_COLORS[status] ?? 'bg-gray-500'
                    }`}
                  />
                </div>
                <span className={`text-sm truncate ${status === 'offline' ? 'text-muted' : ''}`}>
                  {m.nickname ?? m.display_name}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
