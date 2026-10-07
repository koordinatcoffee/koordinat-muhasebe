import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Alert } from '../components/ui';
import fullLogo from '../assets/brand/logo-full.png';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setErrorMessage(error.message === 'Invalid login credentials' ? 'E-posta veya şifre hatalı.' : error.message);
    }
    setIsSubmitting(false);
  }

  return (
    <div className="login-screen">
      <form className="card login-card" onSubmit={handleSubmit}>
        <img src={fullLogo} alt="Koordinat Coffee Factory" className="login-card__logo" />
        <p className="login-card__caption text-muted">Gelir · Gider · Kasa Takibi</p>

        <label className="field">
          <span className="field__label">E-posta</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span className="field__label">Şifre</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        <Alert variant="error">{errorMessage}</Alert>

        <button className="btn btn--primary btn--block" disabled={isSubmitting}>
          {isSubmitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </button>
      </form>
    </div>
  );
}
