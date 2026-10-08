import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSpreadsheet } from 'lucide-react';
import {
  deletePlannedPayment, listCategories, listCounterparties, listInvoiceBalances, listPendingPlannedPayments,
  payPlannedPayment, savePlannedPayment, setPlannedPaymentUnpaid,
} from '../lib/api';
import {
  formatCurrency, formatDate, formatIban, parseAmount, PAYMENT_METHOD_LABELS, roundAmount, toAmountInput, todayISO,
} from '../lib/format';
import { dueStatus, summarizePlanned, UPCOMING_DAYS } from '../lib/plannedPayments';
import { buildInvoiceLookup, remainingDebt } from '../lib/invoices';
import { downloadWorkbook } from '../lib/excel';
import { ROUTES } from '../config/navigation';
import { useAsync } from '../hooks/useAsync';
import {
  Alert, CategorySelect, EmptyState, ErrorAlert, MoneyInput, PageHeader, StatCard, toUserMessage,
} from '../components/ui';
import {
  CounterpartyFields, EMPTY_PAYMENT_FIELDS, InvoiceDebtHint, InvoiceFields, validatePaymentFields,
} from '../components/payments/PaymentFields';

/** Table tabs: every pending payment, those not marked, those marked "Ödenmedi" */
const STATUS_FILTERS = [
  { value: 'all', label: 'Tümü', matches: () => true },
  { value: 'pending', label: 'Bekleyen', matches: (payment) => !payment.marked_unpaid_at },
  { value: 'unpaid', label: 'Ödenmedi', matches: (payment) => Boolean(payment.marked_unpaid_at) },
];

const createEmptyForm = (overrides = {}) => ({
  id: null,
  dueDate: todayISO(),
  category: '',
  paymentMethod: 'bank_transfer',
  amountInput: '',
  description: '',
  ...EMPTY_PAYMENT_FIELDS,
  ...overrides,
});

const toForm = (payment, contact) => ({
  id: payment.id,
  dueDate: payment.due_date,
  category: payment.category || '',
  counterparty: payment.counterparty,
  iban: contact?.iban ? formatIban(contact.iban) : '',
  phone: contact?.phone || '',
  paymentMethod: payment.payment_method,
  amountInput: toAmountInput(payment.amount),
  description: payment.description || '',
  invoiceNo: payment.invoice_no || '',
  invoiceAmountInput: toAmountInput(payment.invoice_amount),
});

export default function PlannedPaymentsPage() {
  const today = todayISO();
  const [form, setForm] = useState(() => createEmptyForm());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const payments = useAsync(() => listPendingPlannedPayments(), []);
  const invoices = useAsync(listInvoiceBalances, []);
  const lookups = useAsync(async () => {
    const [categories, counterparties] = await Promise.all([listCategories(), listCounterparties()]);
    return { categories, counterparties };
  }, []);

  const counterparties = lookups.data?.counterparties || [];
  const contactOf = useMemo(() => {
    const byName = new Map(counterparties.map((counterparty) => [counterparty.name, counterparty]));
    return (name) => byName.get(name) || null;
  }, [counterparties]);
  const invoiceBalanceOf = useMemo(() => buildInvoiceLookup(invoices.data || []), [invoices.data]);
  // Planned payments are not part of invoice balances until they are paid
  const remainingOf = (payment) =>
    remainingDebt(invoiceBalanceOf(payment.counterparty, payment.invoice_no), payment.invoice_amount);

  const amount = parseAmount(form.amountInput);
  const paymentFields = validatePaymentFields(form);
  const isValid = form.dueDate && amount > 0 && paymentFields.isValid;
  const updateForm = (changes) => setForm((current) => ({ ...current, ...changes }));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isValid) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      await savePlannedPayment({ ...form, amount, invoiceAmount: paymentFields.invoiceAmount });
      setFeedback({
        variant: 'success',
        message: `${form.id ? 'Güncellendi' : 'Kaydedildi'}: ${formatDate(form.dueDate)} · ${form.counterparty.trim()} · ${formatCurrency(amount)}`,
      });
      setForm(createEmptyForm({ dueDate: form.dueDate, paymentMethod: form.paymentMethod }));
      payments.reload();
      lookups.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: toUserMessage(error) });
    } finally {
      setIsSaving(false);
    }
  }

  function startEditing(payment) {
    setForm(toForm(payment, contactOf(payment.counterparty)));
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
      invoices.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: toUserMessage(error) });
    }
  }

  async function toggleUnpaid(payment) {
    const isUnpaid = !payment.marked_unpaid_at;
    setFeedback(null);
    try {
      await setPlannedPaymentUnpaid(payment.id, isUnpaid);
      setFeedback({
        variant: isUnpaid ? 'warning' : 'success',
        message: isUnpaid
          ? `Ödenmedi olarak işaretlendi: ${describe(payment)}. Ödeme bekleyen listesinde kalır; ödenince "Ödendi"ye basın.`
          : `"Ödenmedi" işareti kaldırıldı: ${describe(payment)}`,
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
      lookups.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: toUserMessage(error) });
    }
  }

  const searchedPayments = useMemo(() => {
    const searchTerm = search.trim().toLocaleLowerCase('tr');
    return (payments.data || []).filter(
      (payment) =>
        !searchTerm ||
        [payment.category, payment.counterparty, payment.description, payment.invoice_no].some((field) =>
          field?.toLocaleLowerCase('tr').includes(searchTerm),
        ),
    );
  }, [payments.data, search]);

  const activeFilter = STATUS_FILTERS.find((filter) => filter.value === statusFilter);
  const visiblePayments = searchedPayments.filter(activeFilter.matches);
  const countByFilter = Object.fromEntries(
    STATUS_FILTERS.map((filter) => [filter.value, searchedPayments.filter(filter.matches).length]),
  );
  const unpaidAmount = searchedPayments
    .filter((payment) => payment.marked_unpaid_at)
    .reduce((total, payment) => total + Number(payment.amount), 0);

  // Cards and the monthly box cover every pending payment; the tabs only filter the table
  const summary = useMemo(() => summarizePlanned(searchedPayments, today), [searchedPayments, today]);
  const tableTotal = visiblePayments.reduce((total, payment) => total + Number(payment.amount), 0);

  async function exportToExcel() {
    setIsExporting(true);
    try {
      const subtitle = [
        `${formatDate(today)} itibarıyla bekleyenler`,
        statusFilter !== 'all' && `Filtre: ${activeFilter.label}`,
        search.trim() && `Arama: "${search.trim()}"`,
      ]
        .filter(Boolean)
        .join(' · ');
      await downloadWorkbook(`koordinat-yapilacak-odemeler-${today}`, [
        {
          name: 'Yapılacak Ödemeler',
          title: 'Yapılacak Ödemeler',
          subtitle,
          columns: [
            { header: 'Ödeme tarihi', key: 'dueDate', type: 'date', width: 13 },
            { header: 'Durum', key: 'status', width: 14 },
            { header: 'Ödenmedi', key: 'unpaid', width: 12 },
            { header: 'Kime ödenecek', key: 'counterparty', width: 26 },
            { header: 'IBAN', key: 'iban', width: 34 },
            { header: 'Telefon', key: 'phone', width: 16 },
            { header: 'Kategori', key: 'category', width: 24 },
            { header: 'Fatura no', key: 'invoiceNo', width: 16 },
            { header: 'Fatura tutarı', key: 'invoiceAmount', type: 'currency' },
            { header: 'Faturada kalan borç', key: 'remaining', type: 'currency', width: 18 },
            { header: 'Açıklama', key: 'description', width: 32 },
            { header: 'Ödeme yöntemi', key: 'method', width: 14 },
            { header: 'Ödenecek tutar', key: 'amount', type: 'currency' },
          ],
          rows: visiblePayments.map((payment) => {
            const contact = contactOf(payment.counterparty);
            const status = dueStatus(payment.due_date, today);
            return {
              dueDate: payment.due_date,
              status: status.label,
              unpaid: payment.marked_unpaid_at ? `Evet (${formatDate(payment.marked_unpaid_at)})` : '',
              counterparty: payment.counterparty,
              iban: contact?.iban ? formatIban(contact.iban) : '',
              phone: contact?.phone,
              category: payment.category,
              invoiceNo: payment.invoice_no,
              invoiceAmount: payment.invoice_amount,
              remaining: remainingOf(payment),
              description: payment.description,
              method: PAYMENT_METHOD_LABELS[payment.payment_method],
              amount: payment.amount,
              _style: status.tone === 'expense' || payment.marked_unpaid_at ? 'negative' : undefined,
            };
          }),
          totals: { counterparty: `TOPLAM (${visiblePayments.length} ödeme)`, amount: tableTotal },
          note: 'Kırmızı satırlar: ödeme tarihi geçmiş veya "Ödenmedi" işaretli. "Faturada kalan borç": bu ödeme yapılmadan önceki kalan tutar.',
        },
        {
          name: 'Aylara Göre',
          title: 'Ne zaman ne kadar ödenecek?',
          subtitle,
          columns: [
            { header: 'Dönem', key: 'label', width: 22 },
            { header: 'Ödeme adedi', key: 'count', type: 'number', width: 12 },
            { header: 'Tutar', key: 'amount', type: 'currency', width: 18 },
          ],
          rows: summary.byMonth.map((month) => ({ ...month, _style: month.key === 'overdue' ? 'negative' : undefined })),
          totals: { label: 'TOPLAM', count: summary.total.count, amount: summary.total.amount },
        },
      ]);
    } catch (error) {
      setFeedback({ variant: 'error', message: `Excel dosyası oluşturulamadı: ${toUserMessage(error)}` });
    } finally {
      setIsExporting(false);
    }
  }

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
        actions={
          <button type="button" className="btn" onClick={exportToExcel} disabled={!payments.data || isExporting}>
            <FileSpreadsheet size={16} />{isExporting ? 'Hazırlanıyor…' : "Excel'e aktar"}
          </button>
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
            <span className="field__label">Ödenecek tutar</span>
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
          <CounterpartyFields
            form={form}
            updateForm={updateForm}
            counterparties={counterparties}
            label="Kime ödenecek"
            ibanError={paymentFields.ibanError}
          />
          <label className="field">
            <span className="field__label">Ödeme yöntemi</span>
            <select value={form.paymentMethod} onChange={(e) => updateForm({ paymentMethod: e.target.value })}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <InvoiceFields form={form} updateForm={updateForm} />
          <label className="field form-grid__half">
            <span className="field__label">Açıklama</span>
            <input
              type="text"
              value={form.description}
              onChange={(e) => updateForm({ description: e.target.value })}
              placeholder="Örn: Ekim kirası"
            />
          </label>
          <InvoiceDebtHint
            balance={invoiceBalanceOf(form.counterparty, form.invoiceNo)}
            invoiceAmount={paymentFields.invoiceAmount}
            amount={amount}
          />
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
          <StatCard
            label="Ödenmedi işaretli"
            value={roundAmount(unpaidAmount)}
            tone={countByFilter.unpaid ? 'negative' : undefined}
            hint={`${countByFilter.unpaid} ödeme`}
          />
          <StatCard label="Toplam bekleyen" value={summary.total.amount} hint={`${summary.total.count} ödeme`} emphasized />
        </div>
      )}

      <div className="layout-split">
        <section className="card">
          <div className="card__header card__header--wrap">
            <h3>Bekleyen ödemeler</h3>
            <div className="toolbar">
              <div className="segmented" role="group" aria-label="Duruma göre filtrele">
                {STATUS_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    className={`segmented__option ${filter.value === 'unpaid' ? 'segmented__option--expense' : ''} ${statusFilter === filter.value ? 'is-active' : ''}`}
                    aria-pressed={statusFilter === filter.value}
                    onClick={() => setStatusFilter(filter.value)}
                  >
                    {filter.label} ({countByFilter[filter.value]})
                  </button>
                ))}
              </div>
              <input type="search" placeholder="Ara…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Ara" />
            </div>
          </div>

          {payments.isLoading ? (
            <p className="text-muted">Yükleniyor…</p>
          ) : visiblePayments.length === 0 ? (
            <EmptyState>{statusFilter === 'unpaid' ? 'Ödenmedi işaretli ödeme yok.' : 'Bekleyen ödeme yok.'}</EmptyState>
          ) : (
            <div className="table-scroll">
              <table className="data-table data-table--stack">
                <thead>
                  <tr>
                    <th>Ödeme tarihi</th>
                    <th>Durum</th>
                    <th>Kime</th>
                    <th>Kategori</th>
                    <th>Fatura</th>
                    <th>Açıklama</th>
                    <th>Yöntem</th>
                    <th className="text-end">Tutar</th>
                    <th className="text-end">Kalan borç</th>
                    <th aria-label="İşlemler" />
                  </tr>
                </thead>
                <tbody>
                  {visiblePayments.map((payment) => {
                    const status = dueStatus(payment.due_date, today);
                    const contact = contactOf(payment.counterparty);
                    const remaining = remainingOf(payment);
                    return (
                      <tr
                        key={payment.id}
                        className={form.id === payment.id ? 'is-selected' : payment.marked_unpaid_at ? 'is-unpaid' : undefined}
                      >
                        <td data-label="Ödeme tarihi">{formatDate(payment.due_date)}</td>
                        <td data-label="Durum">
                          <span className={`badge badge--${status.tone}`}>{status.label}</span>
                          {payment.marked_unpaid_at && (
                            <div>
                              <span className="badge badge--expense" title={`${formatDate(payment.marked_unpaid_at)} tarihinde işaretlendi`}>
                                Ödenmedi
                              </span>
                            </div>
                          )}
                        </td>
                        <td data-label="Kime">
                          {payment.counterparty}
                          {contact?.phone && <div className="text-muted text-small">{contact.phone}</div>}
                          {contact?.iban && <div className="text-muted text-small mono">{formatIban(contact.iban)}</div>}
                        </td>
                        <td data-label="Kategori">{payment.category || '—'}</td>
                        <td data-label="Fatura">
                          {payment.invoice_no || '—'}
                          {payment.invoice_amount && (
                            <div className="text-muted text-small">{formatCurrency(payment.invoice_amount)}</div>
                          )}
                        </td>
                        <td data-label="Açıklama" className="text-muted">{payment.description}</td>
                        <td data-label="Yöntem">{PAYMENT_METHOD_LABELS[payment.payment_method]}</td>
                        <td data-label="Tutar" className="text-end text-strong">{formatCurrency(payment.amount)}</td>
                        <td data-label="Kalan borç" className="text-end text-muted">
                          {remaining === null ? '—' : formatCurrency(remaining)}
                        </td>
                        <td className="row-actions">
                          <button type="button" className="btn btn--primary btn--sm" onClick={() => handlePay(payment)}>Ödendi</button>
                          <button
                            type="button"
                            className={`btn btn--sm btn--unpaid ${payment.marked_unpaid_at ? 'is-active' : ''}`}
                            aria-pressed={Boolean(payment.marked_unpaid_at)}
                            title={payment.marked_unpaid_at ? 'İşareti kaldırmak için tıklayın' : 'Ödenmedi olarak işaretle'}
                            onClick={() => toggleUnpaid(payment)}
                          >
                            Ödenmedi
                          </button>
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
