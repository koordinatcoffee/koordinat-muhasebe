import { lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from './lib/supabaseClient';
import { ROUTES } from './config/navigation';
import AppLayout from './components/layout/AppLayout';
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

  return (
    <Routes>
      <Route element={<AppLayout user={session.user} />}>
        <Route index element={<DashboardPage />} />
        <Route path={ROUTES.dailyRegister} element={<DailyRegisterPage />} />
        <Route path={ROUTES.payments} element={<TransactionsPage />} />
        <Route path={ROUTES.plannedPayments} element={<PlannedPaymentsPage />} />
        <Route path={ROUTES.reports} element={<ReportsPage />} />
        <Route path={ROUTES.settings} element={<SettingsPage />} />
        <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
      </Route>
    </Routes>
  );
}
