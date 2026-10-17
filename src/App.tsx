import { createContext, useContext, useMemo, useState } from 'react';
import { isOverdue, useStore } from './data/store';
import { can, PERMISSION_LABEL, permissionsFor, ROLE_LABEL, type Permission } from './lib/rbac';
import { supabaseConfigured } from './lib/supabase';
import type { Role, User } from './data/types';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import StudentDetail from './pages/StudentDetail';
import Cases from './pages/Cases';
import ImportPage from './pages/Import';
import Reports from './pages/Reports';
import Audit from './pages/Audit';
import Privacy from './pages/Privacy';

export type Route =
  | { page: 'dashboard' }
  | { page: 'students' }
  | { page: 'student'; id: string }
  | { page: 'cases'; overdueOnly?: boolean; caseId?: string }
  | { page: 'import' }
  | { page: 'reports' }
  | { page: 'audit' }
  | { page: 'privacy' };

interface Nav {
  go: (r: Route) => void;
  toast: (msg: string) => void;
}
const NavCtx = createContext<Nav>({ go: () => {}, toast: () => {} });
export const useNav = () => useContext(NavCtx);

const NAV: { page: Route['page']; label: string; show: (r: Role) => boolean }[] = [
  { page: 'dashboard', label: 'Operations overview', show: (r) => r === 'manager' },
  { page: 'cases', label: 'Cases', show: (r) => r !== 'admin' },
  { page: 'students', label: 'Students', show: (r) => can(r, 'students.view') },
  { page: 'import', label: 'Import data', show: (r) => can(r, 'import.run') },
  { page: 'reports', label: 'Reports', show: (r) => can(r, 'reports.export') },
  { page: 'audit', label: 'Audit log', show: (r) => can(r, 'audit.view') },
  { page: 'privacy', label: 'Privacy & access', show: () => true },
];

const HOME: Record<Role, Route> = {
  officer: { page: 'cases' },
  manager: { page: 'dashboard' },
  admin: { page: 'import' },
};

let toastTimer = 0;

export default function App() {
  const { authReady, session, user, loadError, signOut } = useStore();

  if (!supabaseConfigured)
    return (
      <Centered>
        <div className="callout crit">
          <b>Database not configured</b>
          The app was built without <span className="mono">VITE_SUPABASE_URL</span> and <span className="mono">VITE_SUPABASE_ANON_KEY</span>. Locally,
          put them in <span className="mono">.env.local</span> and restart <span className="mono">npm run dev</span>. On Vercel, add them under
          Settings → Environment Variables, then redeploy.
        </div>
      </Centered>
    );
  if (!authReady) return <Centered><p className="muted">Loading…</p></Centered>;
  if (!session) return <Login />;
  if (loadError)
    return (
      <Centered>
        <div className="callout crit">
          <b>Couldn't load your workspace</b>
          {loadError}
        </div>
        <button className="btn" onClick={signOut}>Sign out</button>
      </Centered>
    );
  if (!user) return <Centered><p className="muted">Loading your workspace…</p></Centered>;
  return <Shell user={user} key={user.id} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="page" style={{ maxWidth: 520, paddingTop: 80 }}>
      {children}
    </div>
  );
}

function Shell({ user }: { user: User }) {
  const { cases, signOut, loading } = useStore();
  const [route, setRoute] = useState<Route>(HOME[user.role]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const nav = useMemo<Nav>(
    () => ({
      go: (r) => {
        setRoute(r);
        document.querySelector('.main')?.scrollTo(0, 0);
      },
      toast: (m) => {
        setToastMsg(m);
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => setToastMsg(null), 3200);
      },
    }),
    [],
  );

  const overdueMine = cases.filter((c) => isOverdue(c) && (user.role !== 'officer' || c.assigneeId === user.id)).length;
  const allowed = NAV.filter((n) => n.show(user.role));
  const activePage = route.page === 'student' ? 'students' : route.page;
  const routeAllowed = allowed.some((n) => n.page === activePage);

  return (
    <NavCtx.Provider value={nav}>
      <div className="app">
        <aside className="rail">
          <div className="brand">
            <b>
              Student<span>360</span>
            </b>
            <small>Mdaka Advanced Technologies</small>
          </div>
          <nav className="nav" aria-label="Main">
            {allowed.map((n) => (
              <button key={n.page} aria-current={activePage === n.page ? 'page' : undefined} onClick={() => nav.go({ page: n.page } as Route)}>
                {n.label}
                {n.page === 'cases' && overdueMine > 0 && <span className="count">{overdueMine}</span>}
              </button>
            ))}
          </nav>
          <div className="whoami">
            <div className="me">
              <b>{user.name}</b>
              <span>{ROLE_LABEL[user.role]}</span>
            </div>
            <button className="btn rail-btn" onClick={signOut}>
              Sign out
            </button>
            <div className="perms">
              {permissionsFor(user.role).map((p: Permission) => (
                <span key={p}>✓ {PERMISSION_LABEL[p]}</span>
              ))}
            </div>
          </div>
        </aside>
        <main className="main" aria-busy={loading}>
          <div className="demo-banner">Prototype with synthetic data only. No real student records.</div>
          {!routeAllowed ? (
            <div className="page">
              <div className="callout crit">
                <b>You don't have access to this page</b>
                Your role ({ROLE_LABEL[user.role]}) doesn't include it. Ask an administrator if you need it.
              </div>
            </div>
          ) : route.page === 'dashboard' ? (
            <Dashboard />
          ) : route.page === 'students' ? (
            <Students />
          ) : route.page === 'student' ? (
            <StudentDetail id={route.id} key={route.id} />
          ) : route.page === 'cases' ? (
            <Cases initialOverdue={route.overdueOnly} openCaseId={route.caseId} key={JSON.stringify(route)} />
          ) : route.page === 'import' ? (
            <ImportPage />
          ) : route.page === 'reports' ? (
            <Reports />
          ) : route.page === 'audit' ? (
            <Audit />
          ) : (
            <Privacy />
          )}
        </main>
      </div>
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </NavCtx.Provider>
  );
}
