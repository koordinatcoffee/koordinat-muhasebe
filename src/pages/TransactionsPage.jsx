import { useMemo, useState } from 'react';
import {
  deleteTransaction, listCategories, listCounterparties, listTransactions, saveTransaction,
} from '../lib/api';
import {
  formatCurrency, formatDate, monthRange, parseAmount, PAYMENT_METHOD_LABELS, toAmountInput, todayISO,
} from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import {
  Alert, CategorySelect, EmptyState, ErrorAlert, MoneyInput, MonthPicker, PageHeader, toUserMessage,
} from '../components/ui';

const PAYMENT_TYPES = ['payment'];

const createEmptyForm = (overrides = {}) => ({
  id: null,
  date: todayISO(),
  type: 'payment',
  category: '',
  counterparty: '',
  paymentMethod: 'cash',
  amountInput: '',
  description: '',
  ...overrides,
});

const toForm = (transaction) => ({
  id: transaction.id,
  date: transaction.date,
  type: transaction.type,
  category: transaction.category || '',
  counterparty: transaction.counterparty || '',
  paymentMethod: transaction.payment_method,
  amountInput: toAmountInput(transaction.amount),
  description: transaction.description || '',
});

export default function TransactionsPage() {
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [form, setForm] = useState(() => createEmptyForm());
  const [filters, setFilters] = useState({ search: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const range = monthRange(period.year, period.month);
  const transactions = useAsync(() => listTransactions(range.start, range.end, PAYMENT_TYPES), [range.start]);
  const lookups = useAsync(async () => {
    const [categories, counterparties] = await Promise.all([listCategories(), listCounterparties()]);
    return { categories, counterparties };
  }, []);

  const amount = parseAmount(form.amountInput);
  const isValid = form.date && amount > 0 && form.counterparty.trim();
  const updateForm = (changes) => setForm((current) => ({ ...current, ...changes }));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isValid) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      await saveTransaction({ ...form, amount });
      setFeedback({
        variant: 'success',
        message: `${form.id ? 'Güncellendi' : 'Kaydedildi'}: ${formatCurrency(amount)} · ${form.counterparty.trim()}`,
      });
      // Keep date and payment method for fast consecutive entry
      setForm(createEmptyForm({ date: form.date, paymentMethod: form.paymentMethod }));
      transactions.reload();
      if (form.counterparty && !lookups.data?.counterparties.includes(form.counterparty.trim())) lookups.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: toUserMessage(error) });
    } finally {
      setIsSaving(false);
    }
  }

  function startEditing(transaction) {
    setForm(toForm(transaction));
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete(transaction) {
    const summary = `${formatDate(transaction.date)} · ${transaction.counterparty || '—'} · ${formatCurrency(transaction.amount)}`;
    if (!window.confirm(`${summary} silinsin mi?`)) return;
    try {
      await deleteTransaction(transaction.id);
      if (form.id === transaction.id) setForm(createEmptyForm());
      transactions.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: toUserMessage(error) });
    }
  }

  const visibleTransactions = useMemo(() => {
    const searchTerm = filters.search.trim().toLocaleLowerCase('tr');
    return (transactions.data || []).filter(
      (transaction) =>
        !searchTerm ||
        [transaction.category, transaction.counterparty, transaction.description].some((field) =>
          field?.toLocaleLowerCase('tr').includes(searchTerm),
        ),
    );
  }, [transactions.data, filters]);

  const paymentTotal = visibleTransactions.reduce((total, transaction) => total + Number(transaction.amount), 0);

  const paymentsByCounterparty = useMemo(() => {
    const groups = new Map();
    for (const transaction of visibleTransactions) {
      const name = transaction.counterparty || 'Belirtilmemiş';
      const group = groups.get(name) || { name, amount: 0, count: 0 };
      group.amount += Number(transaction.amount);
      group.count += 1;
      groups.set(name, group);
    }
    return [...groups.values()].sort((a, b) => b.amount - a.amount);
  }, [visibleTransactions]);

  return (
    <>
      <PageHeader
        title="Yapılan Ödemeler"
        description="Kime, ne kadar, hangi yöntemle ödeme yaptığınızı girin (tedarikçi, kira, maaş, vergi…)."
      />

      <form className="card card--form" onSubmit={handleSubmit}>
        <div className="card__header">
          <h3>{form.id ? 'Kaydı düzenle' : 'Yeni ödeme'}</h3>
        </div>

        <div className="form-grid">
          <label className="field">
            <span className="field__label">Tarih</span>
            <input type="date" value={form.date} onChange={(e) => updateForm({ date: e.target.value })} required />
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
            <span className="field__label">
Kime ödendi *</span>
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
              placeholder="Örn: 10 koli 12oz karton bardak"
            />
          </label>
          <div className="field form-grid__submit">
            <button className="btn btn--block btn--primary" disabled={!isValid || isSaving}>
              {isSaving ? 'Kaydediliyor…' : form.id ? 'Güncelle' : 'Ödeme kaydet'}
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

      <div className="layout-split">
        <section className="card">
          <div className="card__header card__header--wrap">
            <h3>Kayıtlar</h3>
            <div className="toolbar">
              <input
                type="search"
                placeholder="Ara…"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                aria-label="Ara"
              />
              <MonthPicker year={period.year} month={period.month} onChange={setPeriod} />
            </div>
          </div>

          <ErrorAlert error={transactions.error} />
          {transactions.isLoading ? (
            <p className="text-muted">Yükleniyor…</p>
          ) : visibleTransactions.length === 0 ? (
            <EmptyState>Bu dönem için kayıt yok.</EmptyState>
          ) : (
            <div className="table-scroll">
              <table className="data-table data-table--stack">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Kategori</th>
                    <th>Kime ödendi</th>
                    <th>Açıklama</th>
                    <th>Yöntem</th>
                    <th className="text-end">Tutar</th>
                    <th aria-label="İşlemler" />
                  </tr>
                </thead>
                <tbody>
                  {visibleTransactions.map((transaction) => (
                    <tr key={transaction.id} className={form.id === transaction.id ? 'is-selected' : undefined}>
                      <td data-label="Tarih">{formatDate(transaction.date)}</td>
                      <td data-label="Kategori">{transaction.category || '—'}</td>
                      <td data-label="Kime ödendi">{transaction.counterparty || '—'}</td>
                      <td data-label="Açıklama" className="text-muted">{transaction.description}</td>
                      <td data-label="Yöntem">{PAYMENT_METHOD_LABELS[transaction.payment_method]}</td>
                      <td data-label="Tutar" className="text-end text-negative">
                        {formatCurrency(transaction.amount)}
                      </td>
                      <td className="row-actions">
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => startEditing(transaction)}>Düzenle</button>
                        <button type="button" className="btn btn--ghost btn--sm text-negative" onClick={() => handleDelete(transaction)}>Sil</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {visibleTransactions.length > 0 && (
            <div className="totals-bar">
              <span>
                Toplam ödeme ({visibleTransactions.length} kayıt):{' '}
                <b className="text-negative">{formatCurrency(paymentTotal)}</b>
              </span>
            </div>
          )}
        </section>

        <section className="card">
          <h3>Kime ne ödedik?</h3>
          {paymentsByCounterparty.length === 0 ? (
            <EmptyState>Kayıt yok.</EmptyState>
          ) : (
            <table className="data-table data-table--compact">
              <tbody>
                {paymentsByCounterparty.map((group) => (
                  <tr key={group.name}>
                    <td>
                      {group.name}
                      <div className="text-muted text-small">{group.count} ödeme</div>
                    </td>
                    <td className="text-end text-strong">{formatCurrency(group.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
