import { useState } from 'react';
import { useAuthStore } from '../store/authStore';

export default function RegisterPage({ onSwitch }: { onSwitch: () => void }) {
  const register = useAuthStore((s) => s.register);
  const [form, setForm] = useState({ username: '', email: '', password: '', registrationCode: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(form.username, form.email, form.password, form.registrationCode);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-bg-soft">
      <form onSubmit={submit} className="bg-bg-alt p-8 rounded-lg w-[420px] shadow-xl">
        <h1 className="text-2xl font-bold text-center mb-6">Create an account</h1>
        {error && <div className="bg-red-500/20 text-red-300 p-2 rounded mb-3 text-sm">{error}</div>}
        <Field label="Username" value={form.username} onChange={set('username')} />
        <Field label="Email" value={form.email} onChange={set('email')} type="email" />
        <Field label="Password" value={form.password} onChange={set('password')} type="password" />
        <Field
          label="Registration code"
          value={form.registrationCode}
          onChange={set('registrationCode')}
        />
        <button
          disabled={busy}
          className="w-full bg-accent hover:opacity-90 text-white py-2.5 rounded font-medium mt-4 disabled:opacity-50"
        >
          Continue
        </button>
        <p className="text-muted text-sm mt-4">
          <button type="button" onClick={onSwitch} className="text-accent hover:underline">
            Already have an account?
          </button>
        </p>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <>
      <label className="block text-xs font-bold text-muted uppercase mt-3 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg-soft border border-border rounded px-3 py-2 outline-none focus:border-accent"
      />
    </>
  );
}
