import { useState } from 'react';
import { useServerStore, type Member } from '../store/serverStore';
import { usePresenceStore } from '../store/presenceStore';
import { Permissions, hasPermission } from '../utils/permissions';
import Avatar from './Avatar';
import ProfileCard from './ProfileCard';

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-500',
  idle: 'bg-yellow-500',
  dnd: 'bg-red-500',
  offline: 'bg-gray-500',
  invisible: 'bg-gray-500',
};

export default function MemberList() {
  const { activeServerId, members, roles, servers, myPermissions } = useServerStore();
  const presence = usePresenceStore((s) => s.statuses);
  const [editing, setEditing] = useState<string | null>(null);
  if (!activeServerId) return null;
  const list = members[activeServerId] ?? [];
  const serverRoles = roles[activeServerId] ?? [];
  const perms = myPermissions(activeServerId);
  const ownerId = servers.find((s) => s.id === activeServerId)?.owner_id ?? null;
  const canManageRoles = hasPermission(perms, Permissions.MANAGE_ROLES);
  const canKick = hasPermission(perms, Permissions.KICK_MEMBERS);
  const canBan = hasPermission(perms, Permissions.BAN_MEMBERS);
  const canTimeout = hasPermission(perms, Permissions.MODERATE_MEMBERS);

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
              <div key={m.user_id} className="relative">
                <button
                  onClick={() => setEditing(editing === m.user_id ? null : m.user_id)}
                  className="w-full flex items-center gap-2 py-1 rounded hover:bg-bg-soft px-1 text-left"
                >
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
                </button>
                {editing === m.user_id && (
                  <ProfileCard
                    serverId={activeServerId}
                    member={m}
                    roles={serverRoles}
                    isOwnerTarget={m.user_id === ownerId}
                    canManageRoles={canManageRoles}
                    canKick={canKick}
                    canBan={canBan}
                    canTimeout={canTimeout}
                    onClose={() => setEditing(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
