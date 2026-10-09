import { useRef, useState } from 'react';
import { RefreshCw, UserPlus } from 'lucide-react';
import { createAppUser, listAppUsers, setAppUserPassword, updateAppUser } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { PAGE_PERMISSIONS } from '../../config/navigation';
import { useAccess } from '../../hooks/useAccess';
import { useAsync } from '../../hooks/useAsync';
import { Alert, EmptyState, ErrorAlert, SkeletonTable, toUserMessage } from '../ui';
import { MIN_PASSWORD_LENGTH } from './PasswordChangeForm';

const PAGE_LABELS = Object.fromEntries(PAGE_PERMISSIONS.map((page) => [page.key, page.label]));

/** Access level per page: none, view only, or view + add / change / delete */
const ACCESS_LEVELS = [
  { value: 'none', label: 'Yok' },
  { value: 'view', label: 'Görüntüle' },
  { value: 'edit', label: 'Düzenle' },
];

/** allowed_pages + editable_pages → { pageKey: 'view' | 'edit' } (pages without access are left out) */
function toPageAccess(allowedPages, editablePages) {
  return Object.fromEntries(
    allowedPages.map((key) => [key, editablePages.includes(key) ? 'edit' : 'view']),
  );
}

const pagesWithAccess = (pageAccess, levels) =>
  Object.keys(pageAccess).filter((key) => levels.includes(pageAccess[key]));
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PASSWORD_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

const createEmptyForm = () => ({
  userId: null,
  email: '',
  fullName: '',
  password: '',
  isAdmin: false,
  isActive: true,
  pageAccess: { dashboard: 'view' },
});

const toForm = (appUser) => ({
  userId: appUser.user_id,
  email: appUser.email,
  fullName: appUser.full_name || '',
  password: '',
  isAdmin: appUser.is_admin,
  isActive: appUser.is_active,
  pageAccess: toPageAccess(appUser.allowed_pages, appUser.editable_pages ?? appUser.allowed_pages),
});

function generatePassword(length = 12) {
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (value) => PASSWORD_CHARACTERS[value % PASSWORD_CHARACTERS.length]).join('');
}

const formatDateTime = (timestamp) =>
  timestamp ? `${formatDate(timestamp)} ${new Date(timestamp).toTimeString().slice(0, 5)}` : 'Hiç giriş yapmadı';

/** Admin only: creates panel users, activates / deactivates them and sets which pages they can open */
export default function UserManager() {
  const { user } = useAccess();
  const users = useAsync(listAppUsers, []);
  const [form, setForm] = useState(createEmptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const formRef = useRef(null);

  const isEditing = Boolean(form.userId);
  const isSelf = form.userId === user.id;
  const updateForm = (changes) => setForm((current) => ({ ...current, ...changes }));

  const passwordError =
    form.password && form.password.length < MIN_PASSWORD_LENGTH ? `En az ${MIN_PASSWORD_LENGTH} karakter olmalı.` : null;
  const emailError = form.email && !EMAIL_PATTERN.test(form.email.trim()) ? 'Geçerli bir e-posta girin.' : null;
  const hasNoPages = !form.isAdmin && pagesWithAccess(form.pageAccess, ['view', 'edit']).length === 0;
  const isValid = isEditing
    ? !passwordError && !hasNoPages
    : form.email && !emailError && form.password && !passwordError && !hasNoPages;

  function setPageAccess(pageKey, level) {
    const pageAccess = { ...form.pageAccess };
    if (level === 'none') delete pageAccess[pageKey];
    else pageAccess[pageKey] = level;
    updateForm({ pageAccess });
  }

  /** Form → the allowed / editable page lists the API expects */
  const toAccessLists = (values) => ({
    allowedPages: pagesWithAccess(values.pageAccess, ['view', 'edit']),
    editablePages: pagesWithAccess(values.pageAccess, ['edit']),
  });

  function startEditing(appUser) {
    setForm(toForm(appUser));
    setFeedback(null);
    // The form is above the list: bring it into view so the edit is visible
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** The RPC signatures changed with view-only access; an old database cannot find them */
  const toSaveErrorMessage = (error) =>
    error?.code === 'PGRST202' || /could not find the function/i.test(error?.message || '')
      ? 'Veritabanı güncel değil: Supabase SQL Editor\'da supabase/schema.sql dosyasını çalıştırıp tekrar deneyin.'
      : toUserMessage(error);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isValid) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      if (isEditing) {
        await updateAppUser({ ...form, ...toAccessLists(form) });
        if (form.password) await setAppUserPassword(form.userId, form.password);
      } else {
        await createAppUser({ ...form, ...toAccessLists(form), email: form.email.trim() });
      }
      const passwordNote = form.password ? ` Şifre: ${form.password} — kullanıcıya iletin.` : '';
      setFeedback({
        variant: 'success',
        message: `${isEditing ? 'Güncellendi' : 'Kullanıcı oluşturuldu'}: ${form.email.trim()}.${passwordNote}`,
      });
      setForm(createEmptyForm());
      users.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: toSaveErrorMessage(error) });
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive(appUser) {
    const action = appUser.is_active ? 'pasif yapılsın' : 'aktif yapılsın';
    const consequence = appUser.is_active ? '\nKullanıcı panele giriş yapamaz ve açık oturumu kapatılır.' : '';
    if (!window.confirm(`${appUser.email} ${action} mı?${consequence}`)) return;
    setFeedback(null);
    try {
      const values = toForm(appUser);
      await updateAppUser({ ...values, ...toAccessLists(values), isActive: !appUser.is_active });
      if (form.userId === appUser.user_id) setForm(createEmptyForm());
      users.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: toSaveErrorMessage(error) });
    }
  }

  return (
    <section className="card">
      <div className="card__header">
        <h3>Kullanıcılar</h3>
        <button type="button" className="btn btn--ghost btn--sm" onClick={users.reload} aria-label="Listeyi yenile">
          <RefreshCw size={16} />
        </button>
      </div>
      <p className="text-muted text-small">
        Panele girecek kullanıcıları tanımlayın. Yöneticiler tüm sayfaları görür ve kullanıcıları yönetir; diğer kullanıcılara
        her sayfa için Yok / Görüntüle / Düzenle yetkisi verilir. Pasif kullanıcılar giriş yapamaz. Mevcut bir kullanıcıyı
        değiştirmek için listede "Düzenle"ye basın.
      </p>

      <form ref={formRef} className="user-form" onSubmit={handleSubmit}>
        <h4>{isEditing ? `Düzenle: ${form.email}` : 'Yeni kullanıcı'}</h4>
        <div className="form-grid">
          <label className="field">
            <span className="field__label">Ad soyad</span>
            <input type="text" value={form.fullName} onChange={(e) => updateForm({ fullName: e.target.value })} placeholder="Örn: Ayşe Yılmaz" />
          </label>
          <label className="field">
            <span className="field__label">E-posta *</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => updateForm({ email: e.target.value })}
              disabled={isEditing}
              aria-invalid={Boolean(emailError)}
              autoComplete="off"
              required
            />
            {emailError && <span className="field__error">{emailError}</span>}
          </label>
          <label className="field form-grid__half">
            <span className="field__label">{isEditing ? 'Yeni şifre (boş bırakılırsa değişmez)' : 'Şifre *'}</span>
            <div className="input-with-button">
              <input
                type="text"
                className="mono"
                value={form.password}
                onChange={(e) => updateForm({ password: e.target.value })}
                aria-invalid={Boolean(passwordError)}
                autoComplete="new-password"
                spellCheck={false}
                required={!isEditing}
              />
              <button type="button" className="btn btn--sm" onClick={() => updateForm({ password: generatePassword() })}>
                Rastgele oluştur
              </button>
            </div>
            {passwordError && <span className="field__error">{passwordError}</span>}
          </label>
        </div>

        <div className="user-form__options">
          <label className="checkbox checkbox--plain">
            <input type="checkbox" checked={form.isAdmin} disabled={isSelf} onChange={(e) => updateForm({ isAdmin: e.target.checked })} />
            <span><b>Yönetici</b> — tüm sayfalar ve kullanıcı yönetimi</span>
          </label>
          {isEditing && (
            <label className="checkbox checkbox--plain">
              <input type="checkbox" checked={form.isActive} disabled={isSelf} onChange={(e) => updateForm({ isActive: e.target.checked })} />
              <span><b>Aktif</b> — panele giriş yapabilir</span>
            </label>
          )}
        </div>

        <div className="field">
          <span className="field__label">Sayfa yetkileri</span>
          {form.isAdmin && (
            <Alert variant="info">
              {isSelf
                ? 'Kendi hesabınız yönetici olarak kalır ve tüm sayfaları düzenler.'
                : 'Yöneticiler tüm sayfaları görür ve düzenler. Sayfa bazında Görüntüle / Düzenle vermek için önce yukarıdaki "Yönetici" işaretini kaldırın.'}
            </Alert>
          )}
          <div className="page-access-list">
            {PAGE_PERMISSIONS.map((page) => {
              // Admins have full access: shown as the highest level, not changeable
              const highestLevel = page.viewOnly ? 'view' : 'edit';
              const current = form.isAdmin ? highestLevel : form.pageAccess[page.key] || 'none';
              return (
                <div key={page.key} className="page-access-row">
                  <span>{page.label}</span>
                  <div className="segmented segmented--sm" role="group" aria-label={`${page.label} yetkisi`}>
                    {ACCESS_LEVELS.filter((level) => !(page.viewOnly && level.value === 'edit')).map((level) => (
                      <button
                        key={level.value}
                        type="button"
                        className={`segmented__option ${current === level.value ? 'is-active' : ''}`}
                        aria-pressed={current === level.value}
                        disabled={form.isAdmin}
                        onClick={() => setPageAccess(page.key, level.value)}
                      >
                        {level.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {hasNoPages && <span className="field__error">En az bir sayfaya erişim verin.</span>}
          <span className="text-muted text-small">
            Görüntüle: sayfayı açar ve kayıtları görür, ekleyemez / değiştiremez / silemez. Düzenle: tüm işlemler.
            Ayarlar sayfası herkese açıktır (kendi şifresini değiştirmek için).
          </span>
        </div>

        <div className="toolbar">
          <button className="btn btn--primary" disabled={!isValid || isSaving}>
            <UserPlus size={16} />{isSaving ? 'Kaydediliyor…' : isEditing ? 'Güncelle' : 'Kullanıcı oluştur'}
          </button>
          {isEditing && (
            <button type="button" className="btn btn--ghost" onClick={() => setForm(createEmptyForm())}>Vazgeç</button>
          )}
        </div>
        {feedback && <Alert variant={feedback.variant}>{feedback.message}</Alert>}
      </form>

      <ErrorAlert error={users.error} />
      {users.isLoading ? (
        <SkeletonTable rows={3} columns={5} />
      ) : !users.data?.length ? (
        <EmptyState>Kullanıcı yok.</EmptyState>
      ) : (
        <div className="table-scroll">
          <table className="data-table data-table--stack">
            <thead>
              <tr>
                <th>Kullanıcı</th>
                <th>Rol</th>
                <th>Durum</th>
                <th>Sayfalar</th>
                <th>Son giriş</th>
                <th aria-label="İşlemler" />
              </tr>
            </thead>
            <tbody>
              {users.data.map((appUser) => (
                <tr key={appUser.user_id} className={form.userId === appUser.user_id ? 'is-selected' : undefined}>
                  <td data-label="Kullanıcı">
                    {appUser.full_name || '—'}
                    <div className="text-muted text-small">{appUser.email}{appUser.user_id === user.id && ' (siz)'}</div>
                  </td>
                  <td data-label="Rol">{appUser.is_admin ? 'Yönetici' : 'Kullanıcı'}</td>
                  <td data-label="Durum">
                    <span className={`badge badge--${appUser.is_active ? 'income' : 'expense'}`}>
                      {appUser.is_active ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td data-label="Sayfalar" className="text-small">
                    {appUser.is_admin
                      ? 'Tüm sayfalar'
                      : appUser.allowed_pages
                          .map((key) => {
                            const isEditable = (appUser.editable_pages ?? appUser.allowed_pages).includes(key);
                            return `${PAGE_LABELS[key] || key} (${isEditable ? 'düzenle' : 'görüntüle'})`;
                          })
                          .join(', ') || '—'}
                  </td>
                  <td data-label="Son giriş" className="text-small text-muted">{formatDateTime(appUser.last_sign_in_at)}</td>
                  <td className="row-actions">
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => startEditing(appUser)}>Düzenle</button>
                    {appUser.user_id !== user.id && (
                      <button
                        type="button"
                        className={`btn btn--ghost btn--sm ${appUser.is_active ? 'text-negative' : ''}`}
                        onClick={() => toggleActive(appUser)}
                      >
                        {appUser.is_active ? 'Pasif yap' : 'Aktif yap'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
