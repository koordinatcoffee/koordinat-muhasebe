import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  deletePlannedPayment, listCategories, listCounterparties, listPendingPlannedPayments, payPlannedPayment,
  savePlannedPayment,
} from '../lib/api';
import {
  formatCurrency, formatDate, parseAmount, PAYMENT_METHOD_LABELS, toAmountInput, todayISO,
} from '../lib/format';
import { dueStatus, summarizePlanned, UPCOMING_DAYS } from '../lib/plannedPayments';
import { ROUTES } from '../config/navigation';
import { useAsync } from '../hooks/useAsync';
import {
  Alert, CategorySelect, EmptyState, ErrorAlert, MoneyInput, PageHeader, StatCard, toUserMessage,
} from '../components/ui';

const createEmptyForm = (overrides = {}) => ({
  id: null,
  dueDate: todayISO(),
  category: '',
  counterparty: '',
  paymentMethod: 'bank_transfer',
  amountInput: '',
  description: '',
  ...overrides,
});

const toForm = (payment) => ({
  id: payment.id,
  dueDate: payment.due_date,
  category: payment.category || '',
  counterparty: payment.counterparty,
  paymentMethod: payment.payment_method,
  amountInput: toAmountInput(payment.amount),
  description: payment.description || '',
});

export default function PlannedPaymentsPage() {
  const today = todayISO();
  const [form, setForm] = useState(() => createEmptyForm());
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const payments = useAsync(() => listPendingPlannedPayments(), []);
  const lookups = useAsync(async () => {
    const [categories, counterparties] = await Promise.all([listCategories(), listCounterparties()]);
    return { categories, counterparties };
  }, []);

  const amount = parseAmount(form.amountInput);
  const isValid = form.dueDate && amount > 0 && form.counterparty.trim();
  const updateForm = (changes) => setForm((current) => ({ ...current, ...changes }));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isValid) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      await savePlannedPayment({ ...form, amount });
      setFeedback({
        variant: 'success',
        message: `${form.id ? 'Güncellendi' : 'Kaydedildi'}: ${formatDate(form.dueDate)} · ${form.counterparty.trim()} · ${formatCurrency(amount)}`,
      });
      setForm(createEmptyForm({ dueDate: form.dueDate, paymentMethod: form.paymentMethod }));
      payments.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: toUserMessage(error) });
    } finally {
      setIsSaving(false);
    }
  }

  function startEditing(payment) {
    setForm(toForm(payment));
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const describe = (payment) => `${formatDate(payment.due_date)} · ${payment.counterparty} · ${formatCurrency(payment.amount)}`;

  async function handlePay(payment) {
    if (!window.confirm(`${describe(payment)}\nBugün ödendi olarak "Yapılan Ödemeler"e eklensin mi?`)) return;
    setFeedback(null);
    try {
      await payPlannedPayment(payment.id, today);
      if (form.id === payment.id) setForm(createEmptyForm());
      setFeedback({
        variant: 'success',
        message: `Ödendi: ${payment.counterparty} · ${formatCurrency(payment.amount)} — Yapılan Ödemeler'e eklendi.`,
      });
      payments.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: toUserMessage(error) });
    }
  }

  async function handleDelete(payment) {
    if (!window.confirm(`${describe(payment)} silinsin mi?`)) return;
    try {
      await deletePlannedPayment(payment.id);
      if (form.id === payment.id) setForm(createEmptyForm());
      payments.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: toUserMessage(error) });
    }
  }

  const visiblePayments = useMemo(() => {
    const searchTerm = search.trim().toLocaleLowerCase('tr');
    return (payments.data || []).filter(
      (payment) =>
        !searchTerm ||
        [payment.category, payment.counterparty, payment.description].some((field) =>
          field?.toLocaleLowerCase('tr').includes(searchTerm),
        ),
    );
  }, [payments.data, search]);

  const summary = useMemo(() => summarizePlanned(visiblePayments, today), [visiblePayments, today]);

  return (
    <>
      <PageHeader
        title="Yapılacak Ödemeler"
        description={
          <>
            Ne zaman, kime, ne kadar ödeme yapılacağını girin. Ödeme yapıldığında <b>Ödendi</b>'ye basın; kayıt{' '}
            <Link to={ROUTES.payments}>Yapılan Ödemeler</Link>'e geçer.
          </>
        }
      />

      <form className="card card--form" onSubmit={handleSubmit}>
        <div className="card__header">
          <h3>{form.id ? 'Kaydı düzenle' : 'Yeni yapılacak ödeme'}</h3>
        </div>

        <div className="form-grid">
          <label className="field">
            <span className="field__label">Ödeme tarihi</span>
            <input type="date" value={form.dueDate} onChange={(e) => updateForm({ dueDate: e.target.value })} required />
          </label>
          <label className="field">
            <span className="field__label">Tutar</span>
            <MoneyInput value={form.amountInput} onChange={(amountInput) => updateForm({ amountInput })} autoFocus required />
          </label>
          <label className="field">
            <span className="field__label">Kategori</span>
            <CategorySelect
              categories={lookups.data?.categories || []}
              type="expense"
              value={form.category}
              onChange={(category) => updateForm({ category })}
            />
          </label>
          <label className="field">
            <span className="field__label">Kime ödenecek *</span>
            <input
              type="text"
              list="counterparty-options"
              value={form.counterparty}
              onChange={(e) => updateForm({ counterparty: e.target.value })}
              placeholder="Örn: ABC Ambalaj"
              required
            />
            <datalist id="counterparty-options">
              {(lookups.data?.counterparties || []).map((name) => <option key={name} value={name} />)}
            </datalist>
          </label>
          <label className="field">
            <span className="field__label">Ödeme yöntemi</span>
            <select value={form.paymentMethod} onChange={(e) => updateForm({ paymentMethod: e.target.value })}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="field form-grid__half">
            <span className="field__label">Açıklama</span>
            <input
              type="text"
              value={form.description}
              onChange={(e) => updateForm({ description: e.target.value })}
              placeholder="Örn: Ekim kirası, fatura no 1234"
            />
          </label>
          <div className="field form-grid__submit">
            <button className="btn btn--block btn--primary" disabled={!isValid || isSaving}>
              {isSaving ? 'Kaydediliyor…' : form.id ? 'Güncelle' : 'Kaydet'}
            </button>
            {form.id && (
              <button type="button" className="btn btn--ghost btn--block" onClick={() => setForm(createEmptyForm())}>
                Vazgeç
              </button>
            )}
          </div>
        </div>

        {feedback && <Alert variant={feedback.variant}>{feedback.message}</Alert>}
      </form>

      <ErrorAlert error={payments.error} />

      {payments.data && (
        <div className="stat-grid">
          <StatCard
            label="Gecikmiş"
            value={summary.overdue.amount}
            tone={summary.overdue.count ? 'negative' : undefined}
            hint={`${summary.overdue.count} ödeme`}
          />
          <StatCard
            label={`Önümüzdeki ${UPCOMING_DAYS} gün`}
            value={summary.upcoming.amount}
            hint={`${summary.upcoming.count} ödeme · bugün dahil`}
          />
          <StatCard label="Toplam bekleyen" value={summary.total.amount} hint={`${summary.total.count} ödeme`} emphasized />
        </div>
      )}

      <div className="layout-split">
        <section className="card">
          <div className="card__header card__header--wrap">
            <h3>Bekleyen ödemeler</h3>
            <div className="toolbar">
              <input type="search" placeholder="Ara…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Ara" />
            </div>
          </div>

          {payments.isLoading ? (
            <p className="text-muted">Yükleniyor…</p>
          ) : visiblePayments.length === 0 ? (
            <EmptyState>Bekleyen ödeme yok.</EmptyState>
          ) : (
            <div className="table-scroll">
              <table className="data-table data-table--stack">
                <thead>
                  <tr>
                    <th>Ödeme tarihi</th>
                    <th>Durum</th>
                    <th>Kime</th>
                    <th>Kategori</th>
                    <th>Açıklama</th>
                    <th>Yöntem</th>
                    <th className="text-end">Tutar</th>
                    <th aria-label="İşlemler" />
                  </tr>
                </thead>
                <tbody>
                  {visiblePayments.map((payment) => {
                    const status = dueStatus(payment.due_date, today);
                    return (
                      <tr key={payment.id} className={form.id === payment.id ? 'is-selected' : undefined}>
                        <td data-label="Ödeme tarihi">{formatDate(payment.due_date)}</td>
                        <td data-label="Durum"><span className={`badge badge--${status.tone}`}>{status.label}</span></td>
                        <td data-label="Kime">{payment.counterparty}</td>
                        <td data-label="Kategori">{payment.category || '—'}</td>
                        <td data-label="Açıklama" className="text-muted">{payment.description}</td>
                        <td data-label="Yöntem">{PAYMENT_METHOD_LABELS[payment.payment_method]}</td>
                        <td data-label="Tutar" className="text-end text-strong">{formatCurrency(payment.amount)}</td>
                        <td className="row-actions">
                          <button type="button" className="btn btn--primary btn--sm" onClick={() => handlePay(payment)}>Ödendi</button>
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => startEditing(payment)}>Düzenle</button>
                          <button type="button" className="btn btn--ghost btn--sm text-negative" onClick={() => handleDelete(payment)}>Sil</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <h3>Ne zaman ne kadar?</h3>
          {summary.byMonth.length === 0 ? (
            <EmptyState>Kayıt yok.</EmptyState>
          ) : (
            <table className="data-table data-table--compact">
              <tbody>
                {summary.byMonth.map((month) => (
                  <tr key={month.key}>
                    <td className={month.key === 'overdue' ? 'text-negative' : undefined}>
                      {month.label}
                      <div className="text-muted text-small">{month.count} ödeme</div>
                    </td>
                    <td className={`text-end text-strong ${month.key === 'overdue' ? 'text-negative' : ''}`}>
                      {formatCurrency(month.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>Toplam</td><td className="text-end">{formatCurrency(summary.total.amount)}</td></tr>
              </tfoot>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
