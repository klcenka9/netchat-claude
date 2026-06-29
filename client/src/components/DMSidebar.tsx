import { useState } from 'react';
import { Users } from 'lucide-react';
import { useDmStore } from '../store/dmStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../api/http';
import Avatar from './Avatar';
import UserFooter from './UserFooter';

export default function DMSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { dms, activeDmId, selectDm, openDm } = useDmStore();
  const me = useAuthStore((s) => s.me);
  const [newUser, setNewUser] = useState('');

  function dmTitle(dm: (typeof dms)[number]) {
    if (dm.name) return dm.name;
    const others = dm.participants.filter((p) => p.id !== me?.id);
    return others.map((o) => o.display_name).join(', ') || 'Just you';
  }

  return (
    <div className="w-60 bg-bg-alt flex flex-col">
      <div className="h-12 px-3 flex items-center border-b border-border shadow-sm">
        <div className="bg-bg-soft rounded px-2 py-1 text-sm text-muted w-full">Find or start a conversation</div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex items-center gap-2 px-2 py-2 text-muted font-medium">
          <Users size={20} /> Direct Messages
        </div>
        {dms.map((dm) => {
          const other = dm.participants.find((p) => p.id !== me?.id) ?? dm.participants[0];
          return (
            <button
              key={dm.id}
              onClick={() => selectDm(dm.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-soft ${
                activeDmId === dm.id ? 'bg-bg-soft' : ''
              }`}
            >
              <Avatar user={other ?? { display_name: '?', avatar_url: null }} size={32} />
              <span className="truncate text-sm">{dmTitle(dm)}</span>
            </button>
          );
        })}

        <div className="mt-3 px-2">
          <input
            value={newUser}
            onChange={(e) => setNewUser(e.target.value)}
            placeholder="username to DM…"
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && newUser.trim()) {
                try {
                  const user = await api<{ id: string }>(
                    `/users/lookup?username=${encodeURIComponent(newUser.trim())}`,
                  );
                  await openDm(user.id);
                } catch {
                  /* user not found */
                }
                setNewUser('');
              }
            }}
            className="w-full bg-bg-soft border border-border rounded px-2 py-1 text-sm outline-none"
          />
        </div>
      </div>

      <UserFooter onOpenSettings={onOpenSettings} />
    </div>
  );
}
