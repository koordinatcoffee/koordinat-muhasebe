import { useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import {
  deleteTransaction, listCategories, listCounterparties, listInvoiceBalances, listTransactions, saveTransaction,
} from '../lib/api';
import {
  formatCurrency, formatDate, formatIban, monthRange, MONTH_NAMES, parseAmount, PAYMENT_METHOD_LABELS,
  toAmountInput, todayISO,
} from '../lib/format';
import { buildInvoiceLookup, remainingDebt } from '../lib/invoices';
import { downloadWorkbook } from '../lib/excel';
import { useAsync } from '../hooks/useAsync';
import {
  Alert, CategorySelect, EmptyState, ErrorAlert, MoneyInput, MonthPicker, PageHeader, toUserMessage,
} from '../components/ui';
import {
  CounterpartyFields, EMPTY_PAYMENT_FIELDS, InvoiceDebtHint, InvoiceFields, validatePaymentFields,
} from '../components/payments/PaymentFields';

const PAYMENT_TYPES = ['payment'];

const createEmptyForm = (overrides = {}) => ({
  id: null,
  original: null,
  date: todayISO(),
  type: 'payment',
  category: '',
  paymentMethod: 'cash',
  amountInput: '',
  description: '',
  ...EMPTY_PAYMENT_FIELDS,
  ...overrides,
});

const toForm = (transaction, contact) => ({
  id: transaction.id,
  // The saved payment is already part of its invoice balance
  original: { counterparty: transaction.counterparty, invoiceNo: transaction.invoice_no, amount: Number(transaction.amount) },
  date: transaction.date,
  type: transaction.type,
  category: transaction.category || '',
  counterparty: transaction.counterparty || '',
  iban: contact?.iban ? formatIban(contact.iban) : '',
  phone: contact?.phone || '',
  paymentMethod: transaction.payment_method,
  amountInput: toAmountInput(transaction.amount),
  description: transaction.description || '',
  invoiceNo: transaction.invoice_no || '',
  invoiceAmountInput: toAmountInput(transaction.invoice_amount),
});

export default function TransactionsPage() {
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [form, setForm] = useState(() => createEmptyForm());
  const [filters, setFilters] = useState({ search: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const range = monthRange(period.year, period.month);
  const periodTitle = `${MONTH_NAMES[period.month - 1]} ${period.year}`;
  const transactions = useAsync(() => listTransactions(range.start, range.end, PAYMENT_TYPES), [range.start]);
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

  const amount = parseAmount(form.amountInput);
  const paymentFields = validatePaymentFields(form);
  const isValid = form.date && amount > 0 && paymentFields.isValid;
  const updateForm = (changes) => setForm((current) => ({ ...current, ...changes }));

  const formInvoiceBalance = invoiceBalanceOf(form.counterparty, form.invoiceNo);
  const isSameInvoiceAsSaved =
    form.original &&
    form.original.counterparty === form.counterparty.trim() &&
    (form.original.invoiceNo || '') === form.invoiceNo.trim();

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isValid) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      await saveTransaction({ ...form, amount, invoiceAmount: paymentFields.invoiceAmount });
      setFeedback({
        variant: 'success',
        message: `${form.id ? 'Güncellendi' : 'Kaydedildi'}: ${formatCurrency(amount)} · ${form.counterparty.trim()}`,
      });
      // Keep date and payment method for fast consecutive entry
      setForm(createEmptyForm({ date: form.date, paymentMethod: form.paymentMethod }));
      transactions.reload();
      invoices.reload();
      lookups.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: toUserMessage(error) });
    } finally {
      setIsSaving(false);
    }
  }

  function startEditing(transaction) {
    setForm(toForm(transaction, contactOf(transaction.counterparty)));
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
      invoices.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: toUserMessage(error) });
    }
  }

  const visibleTransactions = useMemo(() => {
    const searchTerm = filters.search.trim().toLocaleLowerCase('tr');
    return (transactions.data || []).filter(
      (transaction) =>
        !searchTerm ||
        [transaction.category, transaction.counterparty, transaction.description, transaction.invoice_no].some((field) =>
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

  const openInvoices = useMemo(
    () =>
      (invoices.data || [])
        .filter((invoice) => Number(invoice.remaining_amount) > 0)
        .sort((a, b) => Number(b.remaining_amount) - Number(a.remaining_amount)),
    [invoices.data],
  );
  const openInvoiceTotal = openInvoices.reduce((total, invoice) => total + Number(invoice.remaining_amount), 0);

  const remainingOf = (transaction) =>
    remainingDebt(invoiceBalanceOf(transaction.counterparty, transaction.invoice_no), transaction.invoice_amount);

  async function exportToExcel() {
    setIsExporting(true);
    try {
      const subtitle = [periodTitle, filters.search.trim() && `Arama: "${filters.search.trim()}"`].filter(Boolean).join(' · ');
      await downloadWorkbook(`koordinat-yapilan-odemeler-${range.start.slice(0, 7)}`, [
        {
          name: 'Ödemeler',
          title: 'Yapılan Ödemeler',
          subtitle,
          columns: [
            { header: 'Tarih', key: 'date', type: 'date' },
            { header: 'Kime ödendi', key: 'counterparty', width: 26 },
            { header: 'IBAN', key: 'iban', width: 34 },
            { header: 'Telefon', key: 'phone', width: 16 },
            { header: 'Kategori', key: 'category', width: 24 },
            { header: 'Fatura no', key: 'invoiceNo', width: 16 },
            { header: 'Fatura tutarı', key: 'invoiceAmount', type: 'currency' },
            { header: 'Açıklama', key: 'description', width: 32 },
            { header: 'Ödeme yöntemi', key: 'method', width: 14 },
            { header: 'Ödenen tutar', key: 'amount', type: 'currency' },
            { header: 'Faturada kalan borç', key: 'remaining', type: 'currency', width: 18 },
          ],
          rows: [...visibleTransactions].reverse().map((transaction) => {
            const contact = contactOf(transaction.counterparty);
            return {
              date: transaction.date,
              counterparty: transaction.counterparty,
              iban: contact?.iban ? formatIban(contact.iban) : '',
              phone: contact?.phone,
              category: transaction.category,
              invoiceNo: transaction.invoice_no,
              invoiceAmount: transaction.invoice_amount,
              description: transaction.description,
              method: PAYMENT_METHOD_LABELS[transaction.payment_method],
              amount: transaction.amount,
              remaining: remainingOf(transaction),
            };
          }),
          totals: { counterparty: `TOPLAM (${visibleTransactions.length} ödeme)`, amount: paymentTotal },
          note: '"Faturada kalan borç": o faturanın tutarından, bugüne kadar yapılan tüm ödemeler düşüldükten sonra kalan tutar.',
        },
        {
          name: 'Kime Ödendi',
          title: 'Kime ne ödedik?',
          subtitle,
          columns: [
            { header: 'Kime ödendi', key: 'name', width: 30 },
            { header: 'IBAN', key: 'iban', width: 34 },
            { header: 'Telefon', key: 'phone', width: 16 },
            { header: 'Ödeme adedi', key: 'count', type: 'number', width: 12 },
            { header: 'Toplam', key: 'amount', type: 'currency', width: 18 },
          ],
          rows: paymentsByCounterparty.map((group) => {
            const contact = contactOf(group.name);
            return {
              ...group,
              iban: contact?.iban ? formatIban(contact.iban) : '',
              phone: contact?.phone,
            };
          }),
          totals: { name: 'TOPLAM', count: visibleTransactions.length, amount: paymentTotal },
        },
        {
          name: 'Açık Faturalar',
          title: 'Açık faturalar (kalan borç)',
          subtitle: 'Tüm dönemler',
          columns: [
            { header: 'Kime', key: 'counterparty', width: 30 },
            { header: 'Fatura no', key: 'invoiceNo', width: 18 },
            { header: 'Fatura tutarı', key: 'invoiceAmount', type: 'currency' },
            { header: 'Ödenen', key: 'paid', type: 'currency' },
            { header: 'Kalan borç', key: 'remaining', type: 'currency' },
            { header: 'Son ödeme', key: 'lastPayment', type: 'date' },
          ],
          rows: openInvoices.map((invoice) => ({
            counterparty: invoice.counterparty,
            invoiceNo: invoice.invoice_no,
            invoiceAmount: invoice.invoice_amount,
            paid: invoice.paid_amount,
            remaining: invoice.remaining_amount,
            lastPayment: invoice.last_payment_date,
          })),
          totals: { counterparty: 'TOPLAM', remaining: openInvoiceTotal },
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
        title="Yapılan Ödemeler"
        description="Kime, ne kadar, hangi yöntemle ödeme yaptığınızı girin (tedarikçi, kira, maaş, vergi…)."
        actions={
          <button type="button" className="btn" onClick={exportToExcel} disabled={!transactions.data || isExporting}>
            <FileSpreadsheet size={16} />{isExporting ? 'Hazırlanıyor…' : "Excel'e aktar"}
          </button>
        }
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
            <span className="field__label">Ödenen tutar</span>
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
            label="Kime ödendi"
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
              placeholder="Örn: 10 koli 12oz karton bardak"
            />
          </label>
          <InvoiceDebtHint
            balance={formInvoiceBalance}
            invoiceAmount={paymentFields.invoiceAmount}
            amount={amount}
            alreadyCounted={isSameInvoiceAsSaved ? form.original.amount : 0}
          />
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
                    <th>Kime ödendi</th>
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
                  {visibleTransactions.map((transaction) => {
                    const contact = contactOf(transaction.counterparty);
                    const remaining = remainingOf(transaction);
                    return (
                      <tr key={transaction.id} className={form.id === transaction.id ? 'is-selected' : undefined}>
                        <td data-label="Tarih">{formatDate(transaction.date)}</td>
                        <td data-label="Kime ödendi">
                          {transaction.counterparty || '—'}
                          {contact?.phone && <div className="text-muted text-small">{contact.phone}</div>}
                          {contact?.iban && <div className="text-muted text-small mono">{formatIban(contact.iban)}</div>}
                        </td>
                        <td data-label="Kategori">{transaction.category || '—'}</td>
                        <td data-label="Fatura">
                          {transaction.invoice_no || '—'}
                          {transaction.invoice_amount && (
                            <div className="text-muted text-small">{formatCurrency(transaction.invoice_amount)}</div>
                          )}
                        </td>
                        <td data-label="Açıklama" className="text-muted">{transaction.description}</td>
                        <td data-label="Yöntem">{PAYMENT_METHOD_LABELS[transaction.payment_method]}</td>
                        <td data-label="Tutar" className="text-end text-negative">{formatCurrency(transaction.amount)}</td>
                        <td data-label="Kalan borç" className={`text-end ${remaining > 0 ? 'text-strong' : 'text-muted'}`}>
                          {remaining === null ? '—' : formatCurrency(remaining)}
                        </td>
                        <td className="row-actions">
                          {transaction.employee_entry_id ? (
                            // Mirrored staff advance / salary payment: changed on the staff page
                            <span className="badge badge--info" title="Personel Avansları sayfasından düzenlenir">Personel</span>
                          ) : (
                            <>
                              <button type="button" className="btn btn--ghost btn--sm" onClick={() => startEditing(transaction)}>Düzenle</button>
                              <button type="button" className="btn btn--ghost btn--sm text-negative" onClick={() => handleDelete(transaction)}>Sil</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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

        <div>
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

          <section className="card">
            <h3>Açık faturalar</h3>
            <ErrorAlert error={invoices.error} />
            {openInvoices.length === 0 ? (
              <EmptyState>Kalan borcu olan fatura yok.</EmptyState>
            ) : (
              <table className="data-table data-table--compact">
                <tbody>
                  {openInvoices.map((invoice) => (
                    <tr key={`${invoice.counterparty}-${invoice.invoice_no}`}>
                      <td>
                        {invoice.counterparty}
                        <div className="text-muted text-small">
                          {invoice.invoice_no} · {formatCurrency(invoice.paid_amount)} / {formatCurrency(invoice.invoice_amount)} ödendi
                        </div>
                      </td>
                      <td className="text-end text-strong text-negative">{formatCurrency(invoice.remaining_amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td>Toplam kalan</td><td className="text-end text-negative">{formatCurrency(openInvoiceTotal)}</td></tr>
                </tfoot>
              </table>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
