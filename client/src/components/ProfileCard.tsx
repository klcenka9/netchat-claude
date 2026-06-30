import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { api } from '../api/http';
import { useServerStore, type Member } from '../store/serverStore';
import { useDmStore } from '../store/dmStore';
import { useAuthStore } from '../store/authStore';
import Avatar from './Avatar';

interface PublicUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  about_me: string | null;
  pronouns: string | null;
  accent_color: string | null;
  custom_status: string | null;
}

// Profile popout card (spec §11 #4): avatar, banner, about me, pronouns, mutual
// servers — plus inline role assignment + moderation for permitted viewers.
export default function ProfileCard({
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
  const allMembers = useServerStore((s) => s.members);
  const servers = useServerStore((s) => s.servers);
  const meId = useAuthStore((s) => s.me?.id);
  const openDm = useDmStore((s) => s.openDm);
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const assignable = roles.filter((r) => !r.is_default);
  const showMod = !isOwnerTarget && (canKick || canBan || canTimeout);

  useEffect(() => {
    api<PublicUser>(`/users/${member.user_id}`).then(setProfile).catch(() => undefined);
  }, [member.user_id]);

  // Best-effort mutual servers from already-loaded member lists.
  const mutual = servers.filter((s) => {
    const list = allMembers[s.id] ?? [];
    return (
      list.some((m) => m.user_id === member.user_id) && list.some((m) => m.user_id === meId)
    );
  });

  async function toggleRole(roleId: string, has: boolean) {
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

  const accent = profile?.accent_color ?? '#5865f2';

  return (
    <div
      className="absolute right-2 top-8 w-64 bg-bg-soft border border-border rounded-lg shadow-2xl overflow-hidden z-40"
      onMouseLeave={onClose}
    >
      <div
        className="h-16 bg-cover bg-center"
        style={{ background: profile?.banner_url ? `url(${profile.banner_url}) center/cover` : accent }}
      />
      <div className="px-3 pb-3 -mt-6">
        <Avatar user={member} size={56} />
        <div className="font-bold mt-1">{member.nickname ?? member.display_name}</div>
        <div className="text-xs text-muted">@{member.username}</div>
        {profile?.pronouns && <div className="text-xs text-muted mt-0.5">{profile.pronouns}</div>}
        {member.custom_status && <div className="text-sm mt-1">{member.custom_status}</div>}

        {profile?.about_me && (
          <>
            <div className="text-xs font-bold text-muted uppercase mt-3 mb-1">About me</div>
            <div className="text-sm whitespace-pre-wrap">{profile.about_me}</div>
          </>
        )}

        {mutual.length > 0 && (
          <>
            <div className="text-xs font-bold text-muted uppercase mt-3 mb-1">
              {mutual.length} mutual server{mutual.length > 1 ? 's' : ''}
            </div>
            <div className="text-sm text-muted truncate">{mutual.map((s) => s.name).join(', ')}</div>
          </>
        )}

        {member.user_id !== meId && (
          <button
            onClick={() => openDm(member.user_id)}
            className="w-full mt-3 flex items-center justify-center gap-2 bg-accent text-white rounded py-1.5 text-sm"
          >
            <MessageCircle size={16} /> Message
          </button>
        )}

        {err && <div className="text-red-300 text-xs mt-2">{err}</div>}

        {canManageRoles && assignable.length > 0 && (
          <>
            <div className="border-t border-border my-2" />
            <div className="text-xs font-bold text-muted uppercase mb-1">Roles</div>
            {assignable.map((r) => {
              const has = member.roleIds.includes(r.id);
              return (
                <label key={r.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                  <input type="checkbox" checked={has} onChange={() => toggleRole(r.id, has)} />
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color || '#99aab5' }} />
                  <span className="truncate">{r.name}</span>
                </label>
              );
            })}
          </>
        )}

        {showMod && (
          <>
            <div className="border-t border-border my-2" />
            <div className="text-xs font-bold text-muted uppercase mb-1">Moderation</div>
            {canTimeout && (
              <button
                disabled={busy}
                onClick={() => {
                  const mins = prompt(`Timeout ${member.display_name} for how many minutes?`, '10');
                  const n = mins ? parseInt(mins, 10) : NaN;
                  if (Number.isFinite(n) && n > 0)
                    run(() =>
                      api(`/servers/${serverId}/timeouts`, {
                        method: 'POST',
                        json: { userId: member.user_id, expiresInMinutes: n },
                      }),
                    );
                }}
                className="w-full text-left text-sm px-1 py-1 rounded text-yellow-400 hover:bg-bg-alt"
              >
                Timeout…
              </button>
            )}
            {canKick && (
              <button
                disabled={busy}
                onClick={() => {
                  if (confirm(`Kick ${member.display_name}?`))
                    run(() => api(`/servers/${serverId}/members/${member.user_id}`, { method: 'DELETE' }));
                }}
                className="w-full text-left text-sm px-1 py-1 rounded text-orange-400 hover:bg-bg-alt"
              >
                Kick
              </button>
            )}
            {canBan && (
              <button
                disabled={busy}
                onClick={() => {
                  const reason = prompt(`Ban ${member.display_name}? Optional reason:`) ?? undefined;
                  run(() =>
                    api(`/servers/${serverId}/bans`, {
                      method: 'POST',
                      json: { userId: member.user_id, reason },
                    }),
                  );
                }}
                className="w-full text-left text-sm px-1 py-1 rounded text-red-400 hover:bg-bg-alt"
              >
                Ban…
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
