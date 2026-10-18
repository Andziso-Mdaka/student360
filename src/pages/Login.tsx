import { useState, type FormEvent } from 'react';
import { useStore } from '../data/store';

// Demo accounts created by supabase/seed.sql. Remove this list before any real pilot.
const DEMO_PASSWORD = 'Student360-demo!';
const DEMO_ACCOUNTS = [
  { email: 'thandi.officer@example.com', label: 'Thandi Mokoena', role: 'Case officer' },
  { email: 'kagisho.manager@example.com', label: 'Kagisho Mamabolo', role: 'Manager' },
  { email: 'ayanda.admin@example.com', label: 'Ayanda Dlamini', role: 'Administrator' },
];

export default function Login() {
  const { signIn } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async (e: string, p: string) => {
    setBusy(true);
    setError(null);
    try {
      await signIn(e, p);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    go(email.trim(), password);
  };

  return (
    <div className="login">
      <div className="login-card panel">
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div className="login-brand">
              Student<span>360</span>
            </div>
            <p className="muted" style={{ margin: '4px 0 0' }}>Sign in to manage student cases.</p>
          </div>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="field">
              <span>Email</span>
              <input id="login-email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="field">
              <span>Password</span>
              <input id="login-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error && <div className="callout crit">{error}</div>}
            <button className="btn primary" type="submit" disabled={busy} style={{ justifyContent: 'center' }}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <div className="demo-accounts">
            <span className="eyebrow">Demo accounts (synthetic data)</span>
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.email} className="btn" disabled={busy} onClick={() => go(a.email, DEMO_PASSWORD)}>
                <span>{a.label}</span>
                <span className="muted small">{a.role}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
