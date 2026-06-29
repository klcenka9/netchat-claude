import { useState } from 'react';
import { X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { api } from '../api/http';

type Tab = 'account' | 'profile' | 'appearance' | 'twofactor';

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('account');
  const { me, logout } = useAuthStore();
  if (!me) return null;

  return (
    <div className="fixed inset-0 bg-bg z-50 flex">
      <div className="w-64 bg-bg-alt p-4 flex flex-col">
        <div className="text-xs font-bold text-muted uppercase mb-2">User Settings</div>
        {(['account', 'profile', 'appearance', 'twofactor'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-left px-2 py-1.5 rounded capitalize ${
              tab === t ? 'bg-bg-soft' : 'hover:bg-bg-soft'
            }`}
          >
            {t === 'twofactor' ? 'Two-Factor Auth' : t}
          </button>
        ))}
        <button onClick={logout} className="text-left px-2 py-1.5 rounded text-red-400 hover:bg-bg-soft mt-2">
          Log Out
        </button>
      </div>

      <div className="flex-1 p-10 overflow-y-auto relative">
        <button onClick={onClose} className="absolute top-6 right-8 text-muted hover:text-text">
          <X size={28} />
        </button>
        {tab === 'account' && <AccountTab />}
        {tab === 'profile' && <ProfileTab />}
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'twofactor' && <TwoFactorTab />}
      </div>
    </div>
  );
}

function AccountTab() {
  const me = useAuthStore((s) => s.me)!;
  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-bold mb-4">My Account</h2>
      <div className="bg-bg-alt rounded p-4 space-y-2">
        <Row label="Username" value={me.username} />
        <Row label="Display name" value={me.display_name} />
        <Row label="Email" value={me.email} />
      </div>
    </div>
  );
}

function ProfileTab() {
  const { me, setMe } = useAuthStore();
  const [about, setAbout] = useState(me?.about_me ?? '');
  const [pronouns, setPronouns] = useState(me?.pronouns ?? '');
  const [status, setStatus] = useState(me?.custom_status ?? '');

  async function save() {
    const updated = await api('/users/me', {
      method: 'PATCH',
      json: { about_me: about, pronouns, custom_status: status || null },
    });
    setMe(updated as any);
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-bold mb-4">Profile</h2>
      <Field label="About me" value={about} onChange={setAbout} />
      <Field label="Pronouns" value={pronouns} onChange={setPronouns} />
      <Field label="Custom status" value={status} onChange={setStatus} />
      <button onClick={save} className="bg-accent text-white px-4 py-2 rounded mt-4">
        Save
      </button>
    </div>
  );
}

function AppearanceTab() {
  const { theme, toggle } = useThemeStore();
  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-bold mb-4">Appearance</h2>
      <button onClick={toggle} className="bg-bg-alt px-4 py-2 rounded">
        Theme: <span className="font-semibold">{theme}</span> (click to toggle)
      </button>
    </div>
  );
}

function TwoFactorTab() {
  const { me, refreshMe } = useAuthStore();
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');

  async function enable() {
    const res = await api<{ qr: string }>('/auth/2fa/enable', { method: 'POST' });
    setQr(res.qr);
  }
  async function confirm() {
    try {
      await api('/auth/2fa/confirm', { method: 'POST', json: { code } });
      setMsg('2FA enabled!');
      setQr(null);
      await refreshMe();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-bold mb-4">Two-Factor Authentication</h2>
      {me?.totp_enabled ? (
        <p className="text-green-400">2FA is enabled on your account.</p>
      ) : qr ? (
        <div>
          <img src={qr} alt="TOTP QR" className="w-44 h-44 bg-white p-2 rounded" />
          <p className="text-muted text-sm my-2">Scan with your authenticator, then enter a code:</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="bg-bg-soft border border-border rounded px-3 py-2"
          />
          <button onClick={confirm} className="bg-accent text-white px-4 py-2 rounded ml-2">
            Confirm
          </button>
        </div>
      ) : (
        <button onClick={enable} className="bg-accent text-white px-4 py-2 rounded">
          Enable 2FA
        </button>
      )}
      {msg && <p className="mt-3 text-sm">{msg}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-bold text-muted uppercase">{label}</div>
      <div>{value}</div>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-bold text-muted uppercase mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg-soft border border-border rounded px-3 py-2 outline-none"
      />
    </div>
  );
}
