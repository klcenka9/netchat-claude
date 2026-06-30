import { useEffect, useState } from 'react';
import { Check, X, MessageSquare, Ban, UserPlus, Users } from 'lucide-react';
import { useFriendsStore, type Friendship } from '../store/friendsStore';
import { useDmStore } from '../store/dmStore';
import { usePresenceStore } from '../store/presenceStore';
import { useUiStore } from '../store/uiStore';
import Avatar from './Avatar';

type Tab = 'online' | 'all' | 'pending' | 'blocked';
const TABS: Tab[] = ['online', 'all', 'pending', 'blocked'];

export default function FriendsPage() {
  const { friends, blocks, load, loadBlocks, sendRequest, accept, remove, blockUser, unblock } =
    useFriendsStore();
  const presence = usePresenceStore((s) => s.statuses);
  const openDm = useDmStore((s) => s.openDm);
  const setHomeView = useUiStore((s) => s.setHomeView);
  const [tab, setTab] = useState<Tab>('online');
  const [addName, setAddName] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    load();
    loadBlocks();
  }, [load, loadBlocks]);

  function statusOf(f: Friendship) {
    return presence[f.user.id]?.status ?? f.user.status ?? 'offline';
  }

  const accepted = friends.filter((f) => f.status === 'accepted');
  const pending = friends.filter((f) => f.status === 'pending');
  let rows: Friendship[] = [];
  if (tab === 'online') rows = accepted.filter((f) => statusOf(f) !== 'offline');
  else if (tab === 'all') rows = accepted;
  else if (tab === 'pending') rows = pending;

  async function onAdd() {
    const name = addName.trim();
    if (!name) return;
    try {
      await sendRequest(name);
      setMsg({ ok: true, text: `Friend request sent to ${name}.` });
      setAddName('');
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  async function startDm(userId: string) {
    await openDm(userId);
    setHomeView('dm');
  }

  return (
    <div className="flex-1 flex flex-col bg-bg min-w-0">
      <div className="h-12 px-4 flex items-center gap-4 border-b border-border shadow-sm shrink-0">
        <div className="flex items-center gap-2 font-semibold">
          <Users size={20} /> Friends
        </div>
        <div className="w-px h-5 bg-border" />
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`capitalize px-2 py-1 rounded text-sm ${
              tab === t ? 'bg-bg-soft text-text' : 'text-muted hover:text-text'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-6 py-4 border-b border-border">
        <div className="text-xs font-bold text-muted uppercase mb-2">Add Friend</div>
        <div className="flex gap-2">
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAdd()}
            placeholder="Enter a username"
            className="flex-1 bg-bg-soft border border-border rounded px-3 py-2 outline-none"
          />
          <button
            onClick={onAdd}
            disabled={!addName.trim()}
            className="bg-accent text-white px-4 rounded flex items-center gap-1 disabled:opacity-50"
          >
            <UserPlus size={16} /> Send
          </button>
        </div>
        {msg && (
          <div className={`text-sm mt-2 ${msg.ok ? 'text-green-400' : 'text-red-300'}`}>{msg.text}</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-3">
        {tab === 'blocked' ? (
          blocks.length === 0 ? (
            <div className="text-muted text-sm">No blocked users.</div>
          ) : (
            blocks.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 py-2 border-b border-border/50 group"
              >
                <Avatar user={u} size={32} />
                <span className="flex-1 truncate">{u.display_name}</span>
                <button
                  onClick={() => unblock(u.id)}
                  className="text-sm text-muted hover:text-text px-2 py-1 rounded bg-bg-soft"
                >
                  Unblock
                </button>
              </div>
            ))
          )
        ) : rows.length === 0 ? (
          <div className="text-muted text-sm">
            {tab === 'pending' ? 'No pending requests.' : 'No friends here yet.'}
          </div>
        ) : (
          rows.map((f) => (
            <div
              key={f.otherUserId}
              className="flex items-center gap-3 py-2 border-b border-border/50 group"
            >
              <Avatar user={f.user} size={32} />
              <div className="flex-1 min-w-0">
                <div className="truncate">{f.user.display_name}</div>
                <div className="text-xs text-muted truncate">
                  {f.status === 'pending'
                    ? f.incoming
                      ? 'Incoming Friend Request'
                      : 'Outgoing Friend Request'
                    : statusOf(f)}
                </div>
              </div>
              <div className="flex gap-1">
                {f.status === 'pending' && f.incoming && (
                  <IconBtn title="Accept" onClick={() => accept(f.otherUserId)}>
                    <Check size={18} className="text-green-400" />
                  </IconBtn>
                )}
                {f.status === 'accepted' && (
                  <>
                    <IconBtn title="Message" onClick={() => startDm(f.otherUserId)}>
                      <MessageSquare size={18} />
                    </IconBtn>
                    <IconBtn title="Block" onClick={() => blockUser(f.otherUserId)}>
                      <Ban size={18} className="text-red-400" />
                    </IconBtn>
                  </>
                )}
                <IconBtn
                  title={f.status === 'pending' ? (f.incoming ? 'Decline' : 'Cancel') : 'Remove'}
                  onClick={() => remove(f.otherUserId)}
                >
                  <X size={18} className="text-muted" />
                </IconBtn>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-9 h-9 grid place-items-center rounded-full bg-bg-soft hover:bg-bg-alt"
    >
      {children}
    </button>
  );
}
