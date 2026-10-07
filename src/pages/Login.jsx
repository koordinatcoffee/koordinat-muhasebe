import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'E-posta veya şifre hatalı.' : error.message);
    }
    setBusy(false);
  }

  return (
    <div className="center-screen login-bg">
      <form className="card narrow login-card" onSubmit={submit}>
        <div className="brand login-brand">
          <div className="brand-mark">K</div>
          <div>
            <div className="brand-name">Koordinat Coffee Factory</div>
            <div className="brand-sub dark">Gelir · Gider · Kasa Takibi</div>
          </div>
        </div>
        <label className="field">
          <span>E-posta</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Şifre</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </button>
      </form>
    </div>
  );
}
