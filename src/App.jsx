import { lazy, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from './lib/supabaseClient';
import { getMyProfile } from './lib/api';
import { NAVIGATION_ITEMS, ROUTES } from './config/navigation';
import { AccessContext, buildCanAccess, useAccess } from './hooks/useAccess';
import { useAsync } from './hooks/useAsync';
import AppLayout from './components/layout/AppLayout';
import { ErrorAlert } from './components/ui';
import LoginPage from './pages/LoginPage';

// Pages are code-split so the first screen loads only what it needs
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const DailyRegisterPage = lazy(() => import('./pages/DailyRegisterPage'));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'));
const PlannedPaymentsPage = lazy(() => import('./pages/PlannedPaymentsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const SESSION_LOADING = undefined;

export default function App() {
  const [session, setSession] = useState(SESSION_LOADING);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <div className="center-screen">
        <div className="card card--narrow">
          <h2>Kurulum gerekli</h2>
          <p>
            Proje klasöründeki <code>.env</code> dosyasına <code>VITE_SUPABASE_URL</code> ve{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> değerlerini girip uygulamayı yeniden başlatın.
          </p>
        </div>
      </div>
    );
  }

  if (session === SESSION_LOADING) return <div className="center-screen text-muted">Yükleniyor…</div>;
  if (!session) return <LoginPage />;
  // Keyed by user so switching accounts reloads the access rights
  return <SignedInApp key={session.user.id} user={session.user} />;
}

function SignedInApp({ user }) {
  const profile = useAsync(() => getMyProfile(user.id), [user.id]);
  const access = useMemo(
    () => profile.data && { user, profile: profile.data, canAccess: buildCanAccess(profile.data) },
    [user, profile.data],
  );

  if (profile.isLoading) return <div className="center-screen text-muted">Yükleniyor…</div>;
  if (profile.error || !profile.data?.is_active) {
    return (
      <div className="center-screen">
        <div className="card card--narrow">
          <h2>Erişim yok</h2>
          {profile.error ? (
            <ErrorAlert error={profile.error} />
          ) : (
            <p>
              <b>{user.email}</b> hesabı panele erişim için tanımlı değil veya pasif durumda. Yöneticinize başvurun.
            </p>
          )}
          <button type="button" className="btn btn--primary" onClick={() => supabase.auth.signOut()}>Çıkış yap</button>
        </div>
      </div>
    );
  }

  return (
    <AccessContext.Provider value={access}>
      <Routes>
        <Route element={<AppLayout user={user} />}>
          <Route index element={<RequirePage page="dashboard"><DashboardPage /></RequirePage>} />
          <Route path={ROUTES.dailyRegister} element={<RequirePage page="daily-register"><DailyRegisterPage /></RequirePage>} />
          <Route path={ROUTES.payments} element={<RequirePage page="payments"><TransactionsPage /></RequirePage>} />
          <Route path={ROUTES.plannedPayments} element={<RequirePage page="planned-payments"><PlannedPaymentsPage /></RequirePage>} />
          <Route path={ROUTES.reports} element={<RequirePage page="reports"><ReportsPage /></RequirePage>} />
          <Route path={ROUTES.settings} element={<SettingsPage />} />
          <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
        </Route>
      </Routes>
    </AccessContext.Provider>
  );
}

/** Shows the page only with access to it; otherwise opens the first page the user may see */
function RequirePage({ page, children }) {
  const { canAccess } = useAccess();
  if (canAccess(page)) return children;
  const fallback = NAVIGATION_ITEMS.find((item) => canAccess(item.permission));
  return <Navigate to={fallback.path} replace />;
}
