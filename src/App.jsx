import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { isConfigured, supabase } from './lib/supabase';
import Layout from './components/Layout';
import Login from './pages/Login';
import Ozet from './pages/Ozet';
import Kasa from './pages/Kasa';
import Hareketler from './pages/Hareketler';
import Raporlar from './pages/Raporlar';
import Ayarlar from './pages/Ayarlar';

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) {
    return (
      <div className="center-screen">
        <div className="card narrow">
          <h2>Kurulum gerekli</h2>
          <p>
            Proje klasöründeki <code>.env</code> dosyasına <code>VITE_SUPABASE_URL</code> ve{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> değerlerini girip uygulamayı yeniden başlatın.
          </p>
        </div>
      </div>
    );
  }

  if (session === undefined) return <div className="center-screen muted">Yükleniyor…</div>;
  if (!session) return <Login />;

  return (
    <Routes>
      <Route element={<Layout user={session.user} />}>
        <Route index element={<Ozet />} />
        <Route path="kasa" element={<Kasa />} />
        <Route path="defter" element={<Hareketler mode="defter" />} />
        <Route path="odemeler" element={<Hareketler mode="odeme" />} />
        <Route path="raporlar" element={<Raporlar />} />
        <Route path="ayarlar" element={<Ayarlar />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
