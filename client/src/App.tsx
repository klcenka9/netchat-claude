import { useEffect, useState } from 'react';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AppShell from './pages/AppShell';

export default function App() {
  const { me, loading, init } = useAuthStore();
  const setTheme = useThemeStore((s) => s.setTheme);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  // Sync persisted server-side theme once logged in.
  useEffect(() => {
    if (me?.theme) setTheme(me.theme as 'dark' | 'light', false);
  }, [me?.theme, setTheme]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-muted">Loading NetChat…</div>
    );
  }

  if (!me) {
    return showRegister ? (
      <RegisterPage onSwitch={() => setShowRegister(false)} />
    ) : (
      <LoginPage onSwitch={() => setShowRegister(true)} />
    );
  }

  return <AppShell />;
}
