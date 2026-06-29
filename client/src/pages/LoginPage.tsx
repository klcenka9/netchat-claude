import { useState } from 'react';
import { useAuthStore } from '../store/authStore';

export default function LoginPage({ onSwitch }: { onSwitch: () => void }) {
  const { login, verify2fa, twoFactor } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (twoFactor) await verify2fa(code);
      else await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-bg-soft">
      <form onSubmit={submit} className="bg-bg-alt p-8 rounded-lg w-[420px] shadow-xl">
        <h1 className="text-2xl font-bold text-center mb-1">Welcome back!</h1>
        <p className="text-muted text-center mb-6">We're so excited to see you again.</p>
        {error && <div className="bg-red-500/20 text-red-300 p-2 rounded mb-3 text-sm">{error}</div>}

        {!twoFactor ? (
          <>
            <Label>Email</Label>
            <Input value={email} onChange={setEmail} type="email" autoFocus />
            <Label>Password</Label>
            <Input value={password} onChange={setPassword} type="password" />
          </>
        ) : (
          <>
            <Label>Two-factor code</Label>
            <Input value={code} onChange={setCode} autoFocus />
          </>
        )}

        <button
          disabled={busy}
          className="w-full bg-accent hover:opacity-90 text-white py-2.5 rounded font-medium mt-4 disabled:opacity-50"
        >
          {twoFactor ? 'Verify' : 'Log In'}
        </button>
        <p className="text-muted text-sm mt-4">
          Need an account?{' '}
          <button type="button" onClick={onSwitch} className="text-accent hover:underline">
            Register
          </button>
        </p>
      </form>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-bold text-muted uppercase mt-3 mb-1">{children}</label>;
}
function Input({
  value,
  onChange,
  type = 'text',
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-bg-soft border border-border rounded px-3 py-2 outline-none focus:border-accent"
    />
  );
}
