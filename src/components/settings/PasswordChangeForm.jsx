import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { changeOwnPassword } from '../../lib/api';
import { useAccess } from '../../hooks/useAccess';
import { Alert, toUserMessage } from '../ui';

export const MIN_PASSWORD_LENGTH = 8;

const EMPTY_FORM = { currentPassword: '', newPassword: '', confirmPassword: '' };

/** Lets the signed-in user change their own password */
export default function PasswordChangeForm() {
  const { user } = useAccess();
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const isTooShort = form.newPassword.length > 0 && form.newPassword.length < MIN_PASSWORD_LENGTH;
  const isMismatch = form.confirmPassword.length > 0 && form.newPassword !== form.confirmPassword;
  const isValid =
    form.currentPassword && form.newPassword.length >= MIN_PASSWORD_LENGTH && form.newPassword === form.confirmPassword;
  const updateForm = (changes) => setForm((current) => ({ ...current, ...changes }));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isValid) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      await changeOwnPassword(user.email, form.currentPassword, form.newPassword);
      setForm(EMPTY_FORM);
      setFeedback({ variant: 'success', message: 'Şifreniz değiştirildi. Bir sonraki girişte yeni şifrenizi kullanın.' });
    } catch (error) {
      setFeedback({ variant: 'error', message: toUserMessage(error) });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3>Şifre değiştir</h3>
      <p className="text-muted text-small">{user.email} hesabının şifresi.</p>
      <div className="form-grid">
        <label className="field">
          <span className="field__label">Mevcut şifre</span>
          <input
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(e) => updateForm({ currentPassword: e.target.value })}
            required
          />
        </label>
        <label className="field">
          <span className="field__label">Yeni şifre</span>
          <input
            type="password"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(e) => updateForm({ newPassword: e.target.value })}
            aria-invalid={isTooShort}
            required
          />
          {isTooShort && <span className="field__error">En az {MIN_PASSWORD_LENGTH} karakter olmalı.</span>}
        </label>
        <label className="field">
          <span className="field__label">Yeni şifre (tekrar)</span>
          <input
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(e) => updateForm({ confirmPassword: e.target.value })}
            aria-invalid={isMismatch}
            required
          />
          {isMismatch && <span className="field__error">Şifreler aynı değil.</span>}
        </label>
        <div className="field form-grid__submit">
          <button className="btn btn--primary btn--block" disabled={!isValid || isSaving}>
            <KeyRound size={16} />{isSaving ? 'Kaydediliyor…' : 'Şifreyi değiştir'}
          </button>
        </div>
      </div>
      {feedback && <Alert variant={feedback.variant}>{feedback.message}</Alert>}
    </form>
  );
}
