import { useState } from 'react';
import { Home, Plus } from 'lucide-react';
import { useServerStore } from '../store/serverStore';
import type { Mode } from '../pages/AppShell';

export default function ServerRail({
  mode,
  setMode,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
}) {
  const { servers, activeServerId, selectServer, createServer, joinInvite } = useServerStore();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="w-[72px] bg-bg-soft flex flex-col items-center py-3 gap-2 overflow-y-auto">
      <button
        onClick={() => setMode({ kind: 'home' })}
        className={`w-12 h-12 rounded-2xl grid place-items-center transition-all ${
          mode.kind === 'home' ? 'bg-accent rounded-xl text-white' : 'bg-bg-alt hover:bg-accent hover:rounded-xl'
        }`}
        title="Home / DMs"
      >
        <Home size={24} />
      </button>
      <div className="w-8 h-0.5 bg-border rounded-full" />

      {servers.map((s) => (
        <button
          key={s.id}
          onClick={() => {
            setMode({ kind: 'server' });
            selectServer(s.id);
          }}
          className={`w-12 h-12 rounded-2xl grid place-items-center font-semibold overflow-hidden transition-all ${
            mode.kind === 'server' && activeServerId === s.id
              ? 'bg-accent rounded-xl text-white'
              : 'bg-bg-alt hover:bg-accent hover:rounded-xl'
          }`}
          title={s.name}
        >
          {s.icon_url ? (
            <img src={s.icon_url} alt={s.name} className="w-full h-full object-cover" />
          ) : (
            initials(s.name)
          )}
        </button>
      ))}

      <button
        onClick={() => setShowAdd(true)}
        className="w-12 h-12 rounded-2xl grid place-items-center bg-bg-alt text-green-400 hover:bg-green-500 hover:text-white hover:rounded-xl transition-all"
        title="Add a server"
      >
        <Plus size={24} />
      </button>

      {showAdd && (
        <AddServerModal
          onClose={() => setShowAdd(false)}
          onCreate={createServer}
          onJoin={joinInvite}
        />
      )}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function AddServerModal({
  onClose,
  onCreate,
  onJoin,
}: {
  onClose: () => void;
  onCreate: (n: string) => Promise<void>;
  onJoin: (c: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50" onClick={onClose}>
      <div className="bg-bg-alt p-6 rounded-lg w-[440px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Add a Server</h2>
        {err && <div className="text-red-300 text-sm mb-2">{err}</div>}
        <label className="text-xs font-bold text-muted uppercase">Create new</label>
        <div className="flex gap-2 mt-1 mb-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Server name"
            className="flex-1 bg-bg-soft border border-border rounded px-3 py-2 outline-none"
          />
          <button
            onClick={async () => {
              try {
                await onCreate(name);
                onClose();
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
            className="bg-accent text-white px-4 rounded"
          >
            Create
          </button>
        </div>
        <label className="text-xs font-bold text-muted uppercase">Join with invite code</label>
        <div className="flex gap-2 mt-1">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="invite code"
            className="flex-1 bg-bg-soft border border-border rounded px-3 py-2 outline-none"
          />
          <button
            onClick={async () => {
              try {
                await onJoin(code);
                onClose();
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
            className="bg-bg-soft px-4 rounded"
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}
