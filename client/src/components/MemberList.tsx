import { useState } from 'react';
import { useServerStore, type Member } from '../store/serverStore';
import { usePresenceStore } from '../store/presenceStore';
import { api } from '../api/http';
import { Permissions, hasPermission } from '../utils/permissions';
import Avatar from './Avatar';

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
  // The popover is useful if the actor can manage roles OR moderate.
  const canOpenPopover = canManageRoles || canKick || canBan || canTimeout;

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
                  onClick={() => canOpenPopover && setEditing(editing === m.user_id ? null : m.user_id)}
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
                {canOpenPopover && editing === m.user_id && (
                  <MemberPopover
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

function MemberPopover({
  serverId,
  member,
  roles,
  isOwnerTarget,
  canManageRoles,
  canKick,
  canBan,
  canTimeout,
  onClose,
}: {
  serverId: string;
  member: Member;
  roles: { id: string; name: string; color: string; is_default: number }[];
  isOwnerTarget: boolean;
  canManageRoles: boolean;
  canKick: boolean;
  canBan: boolean;
  canTimeout: boolean;
  onClose: () => void;
}) {
  const reloadMembers = useServerStore((s) => s.reloadMembers);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const assignable = roles.filter((r) => !r.is_default);
  // The server still enforces the role-hierarchy guard; this UI just exposes the actions.
  const showMod = !isOwnerTarget && (canKick || canBan || canTimeout);

  async function toggle(roleId: string, has: boolean) {
    setErr('');
    try {
      await api(`/servers/${serverId}/members/${member.user_id}/roles/${roleId}`, {
        method: has ? 'DELETE' : 'PUT',
      });
      await reloadMembers(serverId);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function run(fn: () => Promise<void>) {
    setErr('');
    setBusy(true);
    try {
      await fn();
      await reloadMembers(serverId);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function kick() {
    if (!confirm(`Kick ${member.display_name}?`)) return;
    run(() => api(`/servers/${serverId}/members/${member.user_id}`, { method: 'DELETE' }));
  }
  function ban() {
    const reason = prompt(`Ban ${member.display_name}? Optional reason:`) ?? undefined;
    run(() =>
      api(`/servers/${serverId}/bans`, {
        method: 'POST',
        json: { userId: member.user_id, reason },
      }),
    );
  }
  function timeout() {
    const mins = prompt(`Timeout ${member.display_name} for how many minutes?`, '10');
    if (!mins) return;
    const expiresInMinutes = parseInt(mins, 10);
    if (!Number.isFinite(expiresInMinutes) || expiresInMinutes <= 0) return;
    run(() =>
      api(`/servers/${serverId}/timeouts`, {
        method: 'POST',
        json: { userId: member.user_id, expiresInMinutes },
      }),
    );
  }

  return (
    <div
      className="absolute right-2 top-8 w-56 bg-bg-soft border border-border rounded-lg shadow-lg p-2 z-30"
      onMouseLeave={onClose}
    >
      {err && <div className="text-red-300 text-xs mb-1">{err}</div>}

      {canManageRoles && (
        <>
          <div className="text-xs font-bold text-muted uppercase mb-1">Roles</div>
          {assignable.length === 0 && <div className="text-muted text-xs">No assignable roles.</div>}
          {assignable.map((r) => {
            const has = member.roleIds.includes(r.id);
            return (
              <label key={r.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                <input type="checkbox" checked={has} onChange={() => toggle(r.id, has)} />
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color || '#99aab5' }} />
                <span className="truncate">{r.name}</span>
              </label>
            );
          })}
        </>
      )}

      {showMod && (
        <>
          {canManageRoles && <div className="border-t border-border my-2" />}
          <div className="text-xs font-bold text-muted uppercase mb-1">Moderation</div>
          {canTimeout && (
            <button
              disabled={busy}
              onClick={timeout}
              className="w-full text-left text-sm px-1 py-1 rounded text-yellow-400 hover:bg-bg-alt"
            >
              Timeout…
            </button>
          )}
          {canKick && (
            <button
              disabled={busy}
              onClick={kick}
              className="w-full text-left text-sm px-1 py-1 rounded text-orange-400 hover:bg-bg-alt"
            >
              Kick
            </button>
          )}
          {canBan && (
            <button
              disabled={busy}
              onClick={ban}
              className="w-full text-left text-sm px-1 py-1 rounded text-red-400 hover:bg-bg-alt"
            >
              Ban…
            </button>
          )}
        </>
      )}
    </div>
  );
}
