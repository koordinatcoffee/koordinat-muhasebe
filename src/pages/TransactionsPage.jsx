import { useMemo, useState } from 'react';
import {
  deleteTransaction, listCategories, listCounterparties, listTransactions, saveTransaction,
} from '../lib/api';
import {
  formatCurrency, formatDate, monthRange, parseAmount, PAYMENT_METHOD_LABELS, toAmountInput, todayISO,
  TRANSACTION_TYPE_LABELS,
} from '../lib/format';
import { categoryTypeFor } from '../lib/categories';
import { useAsync } from '../hooks/useAsync';
import {
  Alert, CategorySelect, EmptyState, ErrorAlert, MoneyInput, MonthPicker, PageHeader,
} from '../components/ui';

const PAGE_MODES = {
  ledger: {
    title: 'Gelir - Gider Defteri',
    description:
      'Kasa dışı gelirler (online platform, toptan kahve, catering…) ve harcamalar (bardak, süt, elektrik…). Örn: 30.000 ₺ peçete alındı → Gider.',
    types: ['income', 'expense'],
    defaultType: 'expense',
    counterpartyLabel: 'Firma / Kişi',
    isCounterpartyRequired: false,
  },
  payments: {
    title: 'Yapılan Ödemeler',
    description: 'Kime, ne kadar, hangi yöntemle ödeme yaptığınızı girin (tedarikçi, kira, maaş, vergi…).',
    types: ['payment'],
    defaultType: 'payment',
    counterpartyLabel: 'Kime ödendi',
    isCounterpartyRequired: true,
  },
};

const ALL_TYPES = 'all';

const createEmptyForm = (type, overrides = {}) => ({
  id: null,
  date: todayISO(),
  type,
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

export default function TransactionsPage({ mode }) {
  // Remount on mode change so the ledger and payments pages never share state
  return <TransactionsView key={mode} config={PAGE_MODES[mode]} isPaymentsMode={mode === 'payments'} />;
}

function TransactionsView({ config, isPaymentsMode }) {
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [form, setForm] = useState(() => createEmptyForm(config.defaultType));
  const [filters, setFilters] = useState({ type: ALL_TYPES, search: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const range = monthRange(period.year, period.month);
  const transactions = useAsync(() => listTransactions(range.start, range.end, config.types), [range.start]);
  const lookups = useAsync(async () => {
    const [categories, counterparties] = await Promise.all([listCategories(), listCounterparties()]);
    return { categories, counterparties };
  }, []);

  const hasTypeSwitch = config.types.length > 1;
  const amount = parseAmount(form.amountInput);
  const isValid = form.date && amount > 0 && (!config.isCounterpartyRequired || form.counterparty.trim());
  const updateForm = (changes) => setForm((current) => ({ ...current, ...changes }));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isValid) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      await saveTransaction({ ...form, amount });
      const counterpartySuffix = form.counterparty ? ` · ${form.counterparty}` : '';
      setFeedback({
        variant: 'success',
        message: `${form.id ? 'Güncellendi' : 'Kaydedildi'}: ${TRANSACTION_TYPE_LABELS[form.type]} ${formatCurrency(amount)}${counterpartySuffix}`,
      });
      // Keep date, type and payment method for fast consecutive entry
      setForm(createEmptyForm(form.type, { date: form.date, paymentMethod: form.paymentMethod }));
      transactions.reload();
      if (form.counterparty && !lookups.data?.counterparties.includes(form.counterparty.trim())) lookups.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: error.message });
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
    const summary = `${formatDate(transaction.date)} · ${TRANSACTION_TYPE_LABELS[transaction.type]} · ${formatCurrency(transaction.amount)}`;
    if (!window.confirm(`${summary} silinsin mi?`)) return;
    try {
      await deleteTransaction(transaction.id);
      if (form.id === transaction.id) setForm(createEmptyForm(form.type));
      transactions.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: error.message });
    }
  }

  const visibleTransactions = useMemo(() => {
    const searchTerm = filters.search.trim().toLocaleLowerCase('tr');
    return (transactions.data || []).filter(
      (transaction) =>
        (filters.type === ALL_TYPES || transaction.type === filters.type) &&
        (!searchTerm ||
          [transaction.category, transaction.counterparty, transaction.description].some((field) =>
            field?.toLocaleLowerCase('tr').includes(searchTerm),
          )),
    );
  }, [transactions.data, filters]);

  const totalsByType = visibleTransactions.reduce(
    (totals, transaction) => ({ ...totals, [transaction.type]: totals[transaction.type] + Number(transaction.amount) }),
    { income: 0, expense: 0, payment: 0 },
  );

  const paymentsByCounterparty = useMemo(() => {
    if (!isPaymentsMode) return [];
    const groups = new Map();
    for (const transaction of visibleTransactions) {
      const name = transaction.counterparty || 'Belirtilmemiş';
      const group = groups.get(name) || { name, amount: 0, count: 0 };
      group.amount += Number(transaction.amount);
      group.count += 1;
      groups.set(name, group);
    }
    return [...groups.values()].sort((a, b) => b.amount - a.amount);
  }, [visibleTransactions, isPaymentsMode]);

  const ledgerBalance = totalsByType.income - totalsByType.expense;

  return (
    <>
      <PageHeader title={config.title} description={config.description} />

      <form className="card card--form" onSubmit={handleSubmit}>
        <div className="card__header card__header--wrap">
          <h3>{form.id ? 'Kaydı düzenle' : 'Yeni kayıt'}</h3>
          {hasTypeSwitch && (
            <div className="segmented" role="group" aria-label="Kayıt türü">
              {config.types.map((type) => (
                <button
                  type="button"
                  key={type}
                  className={`segmented__option segmented__option--${type} ${form.type === type ? 'is-active' : ''}`}
                  aria-pressed={form.type === type}
                  onClick={() => updateForm({ type, category: '' })}
                >
                  {TRANSACTION_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          )}
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
              type={categoryTypeFor(form.type)}
              value={form.category}
              onChange={(category) => updateForm({ category })}
            />
          </label>
          <label className="field">
            <span className="field__label">
              {config.counterpartyLabel}{config.isCounterpartyRequired && ' *'}
            </span>
            <input
              type="text"
              list="counterparty-options"
              value={form.counterparty}
              onChange={(e) => updateForm({ counterparty: e.target.value })}
              placeholder="Örn: ABC Ambalaj"
              required={config.isCounterpartyRequired}
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
              placeholder={form.type === 'income' ? 'Örn: Ofis için 5 kg çekirdek kahve' : 'Örn: 10 koli 12oz karton bardak'}
            />
          </label>
          <div className="field form-grid__submit">
            <button
              className={`btn btn--block ${form.type === 'income' ? 'btn--success' : 'btn--primary'}`}
              disabled={!isValid || isSaving}
            >
              {isSaving ? 'Kaydediliyor…' : form.id ? 'Güncelle' : `${TRANSACTION_TYPE_LABELS[form.type]} kaydet`}
            </button>
            {form.id && (
              <button type="button" className="btn btn--ghost btn--block" onClick={() => setForm(createEmptyForm(form.type))}>
                Vazgeç
              </button>
            )}
          </div>
        </div>

        {feedback && <Alert variant={feedback.variant}>{feedback.message}</Alert>}
      </form>

      <div className={isPaymentsMode ? 'layout-split' : undefined}>
        <section className="card">
          <div className="card__header card__header--wrap">
            <h3>Kayıtlar</h3>
            <div className="toolbar">
              {hasTypeSwitch && (
                <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} aria-label="Türe göre filtrele">
                  <option value={ALL_TYPES}>Tümü</option>
                  {config.types.map((type) => (
                    <option key={type} value={type}>{TRANSACTION_TYPE_LABELS[type]}</option>
                  ))}
                </select>
              )}
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
                    {hasTypeSwitch && <th>Tür</th>}
                    <th>Kategori</th>
                    <th>{config.counterpartyLabel}</th>
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
                      {hasTypeSwitch && (
                        <td data-label="Tür">
                          <span className={`badge badge--${transaction.type}`}>{TRANSACTION_TYPE_LABELS[transaction.type]}</span>
                        </td>
                      )}
                      <td data-label="Kategori">{transaction.category || '—'}</td>
                      <td data-label={config.counterpartyLabel}>{transaction.counterparty || '—'}</td>
                      <td data-label="Açıklama" className="text-muted">{transaction.description}</td>
                      <td data-label="Yöntem">{PAYMENT_METHOD_LABELS[transaction.payment_method]}</td>
                      <td data-label="Tutar" className={`text-end ${transaction.type === 'income' ? 'text-positive' : 'text-negative'}`}>
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
              {isPaymentsMode ? (
                <span>
                  Toplam ödeme ({visibleTransactions.length} kayıt):{' '}
                  <b className="text-negative">{formatCurrency(totalsByType.payment)}</b>
                </span>
              ) : (
                <>
                  <span>Gelir: <b className="text-positive">{formatCurrency(totalsByType.income)}</b></span>
                  <span>Gider: <b className="text-negative">{formatCurrency(totalsByType.expense)}</b></span>
                  <span>
                    Fark: <b className={ledgerBalance >= 0 ? 'text-positive' : 'text-negative'}>{formatCurrency(ledgerBalance)}</b>
                  </span>
                </>
              )}
            </div>
          )}
        </section>

        {isPaymentsMode && (
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
        )}
      </div>
    </>
  );
}
