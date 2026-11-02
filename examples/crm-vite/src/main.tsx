import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MorphAuditLog, MorphDashboard, MorphProvider, MorphReport } from '@morph-reports/react';
import { demo, demoClient, realClient } from './client';
import { actions, model, reports } from './morph';

const DEMO_USERS = [
  { key: 'manager', label: 'Thandi M. (sales manager)' },
  { key: 'rep', label: 'Sipho N. (rep)' },
  { key: 'rep2', label: 'Ayesha K. (rep)' },
];

function App() {
  const params = new URLSearchParams(location.search);
  const [user, setUser] = useState(params.get('as') ?? 'manager');
  const page = params.get('page') ?? 'dashboard';
  const supabase = useMemo(() => (demo ? demoClient(user) : realClient()), [user]);
  const [signedIn, setSignedIn] = useState(demo);

  useEffect(() => {
    if (demo) return;
    void (supabase as ReturnType<typeof realClient>).auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, [supabase]);

  if (!signedIn) return <SignIn onDone={() => setSignedIn(true)} />;

  return (
    <MorphProvider key={user} supabase={supabase} model={model} reports={reports} actions={actions} dev>
      <main>
        {demo && (
          <label style={{ fontSize: 13, color: '#525866' }}>
            Demo user{' '}
            <select value={user} onChange={(e) => setUser(e.target.value)}>
              {DEMO_USERS.map((u) => (
                <option key={u.key} value={u.key}>{u.label}</option>
              ))}
            </select>
          </label>
        )}
        {page === 'report' ? <MorphReport report={params.get('id') ?? 'deals-by-stage'} /> : page === 'audit' ? <MorphAuditLog /> : <MorphDashboard title="Sales" />}
      </main>
    </MorphProvider>
  );
}

function SignIn(props: { onDone(): void }) {
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const { error } = await realClient().auth.signInWithPassword({ email: String(f.get('email')), password: String(f.get('password')) });
        if (error) setError(error.message);
        else props.onDone();
      }}
    >
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required />
      <button type="submit">Sign in</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
