import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api/http';
import { useServerStore, type Role } from '../store/serverStore';
import {
  PERMISSION_NAMES,
  PERMISSION_LABELS,
  Permissions,
  type PermissionName,
} from '../utils/permissions';

export default function RolesEditor({ serverId }: { serverId: string }) {
  const { roles, reloadRoles } = useServerStore();
  const serverRoles = (roles[serverId] ?? []).slice().sort((a, b) => b.position - a.position);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    reloadRoles(serverId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  useEffect(() => {
    if (!selectedId && serverRoles.length) setSelectedId(serverRoles[0].id);
  }, [serverRoles, selectedId]);

  const selected = serverRoles.find((r) => r.id === selectedId) ?? null;

  async function createRole() {
    setErr('');
    try {
      const role = await api<Role>(`/servers/${serverId}/roles`, {
        method: 'POST',
        json: { name: 'new role' },
      });
      await reloadRoles(serverId);
      setSelectedId(role.id);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold mb-4">Roles</h2>
      {err && <div className="text-red-300 text-sm mb-2">{err}</div>}
      <div className="flex gap-4">
        <div className="w-52 shrink-0">
          <button
            onClick={createRole}
            className="w-full flex items-center justify-center gap-1 bg-accent text-white rounded py-1.5 text-sm mb-2"
          >
            <Plus size={16} /> Create Role
          </button>
          <div className="bg-bg-alt rounded">
            {serverRoles.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 ${
                  selectedId === r.id ? 'bg-bg-soft' : 'hover:bg-bg-soft'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: r.color || '#99aab5' }}
                />
                <span className="truncate text-sm">{r.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {selected ? (
            <RoleForm
              key={selected.id}
              serverId={serverId}
              role={selected}
              onChanged={() => reloadRoles(serverId)}
              onDeleted={() => {
                setSelectedId(null);
                reloadRoles(serverId);
              }}
            />
          ) : (
            <div className="text-muted text-sm">Select a role to edit.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleForm({
  serverId,
  role,
  onChanged,
  onDeleted,
}: {
  serverId: string;
  role: Role;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color || '#99aab5');
  const [hoist, setHoist] = useState(!!role.hoist);
  const [perms, setPerms] = useState(role.permissions);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  function toggle(name: PermissionName) {
    const bit = Permissions[name];
    setPerms((p) => (p & bit ? p & ~bit : p | bit));
  }

  async function save() {
    setErr('');
    setSaved(false);
    try {
      await api(`/roles/${role.id}`, {
        method: 'PATCH',
        json: { name, color, hoist, permissions: perms },
      });
      setSaved(true);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function remove() {
    if (!confirm(`Delete role "${role.name}"?`)) return;
    try {
      await api(`/roles/${role.id}`, { method: 'DELETE' });
      onDeleted();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const isDefault = !!role.is_default;

  return (
    <div>
      {err && <div className="text-red-300 text-sm mb-2">{err}</div>}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-bold text-muted uppercase mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isDefault}
            className="w-full bg-bg-soft border border-border rounded px-3 py-2 outline-none disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted uppercase mb-1">Color</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-full h-10 bg-bg-soft border border-border rounded px-1"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm mb-4">
        <input type="checkbox" checked={hoist} onChange={(e) => setHoist(e.target.checked)} />
        Display role members separately (hoist)
      </label>

      <div className="text-xs font-bold text-muted uppercase mb-2">Permissions</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-bg-alt rounded p-3 mb-4 max-h-72 overflow-y-auto">
        {PERMISSION_NAMES.map((p) => (
          <label key={p} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={(perms & Permissions[p]) === Permissions[p]}
              onChange={() => toggle(p)}
            />
            {PERMISSION_LABELS[p]}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} className="bg-accent text-white px-4 py-2 rounded">
          Save Changes
        </button>
        {!isDefault && (
          <button
            onClick={remove}
            className="text-red-400 hover:bg-bg-soft px-3 py-2 rounded flex items-center gap-1"
          >
            <Trash2 size={16} /> Delete Role
          </button>
        )}
        {saved && <span className="text-green-400 text-sm">Saved.</span>}
      </div>

      <div className="text-xs text-muted mt-4">
        Tip: assign roles to members from the member list. Role id: {role.id}
      </div>
    </div>
  );
}
