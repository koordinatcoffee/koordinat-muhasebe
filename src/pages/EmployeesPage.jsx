import { useMemo, useState } from 'react';
import { FileSpreadsheet, UserPlus } from 'lucide-react';
import {
  deleteEmployee, deleteEmployeeEntry, listEmployeeEntries, listEmployees, listEmployeeSalaries, saveEmployee,
  saveEmployeeEntry,
} from '../lib/api';
import {
  formatCurrency, formatDate, formatIban, isValidIban, monthRange, MONTH_NAMES, parseAmount, PAYMENT_METHOD_LABELS,
  roundAmount, toAmountInput, todayISO,
} from '../lib/format';
import { balanceStatus, ENTRY_KIND_LABELS, monthlyBalances, salaryForMonth } from '../lib/payroll';
import { downloadWorkbook } from '../lib/excel';
import { useAsync } from '../hooks/useAsync';
import { useAccess } from '../hooks/useAccess';
import {
  Alert, EmptyState, ErrorAlert, MoneyInput, MonthPicker, PageHeader, ReadOnlyNotice, StatCard, toUserMessage,
} from '../components/ui';

const RESTRICT_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

/** Default date for an entry in the selected month: today when it is the current month, else its last day */
const defaultEntryDate = (range) => {
  const today = todayISO();
  return today >= range.start && today <= range.end ? today : range.end;
};

const createEmptyEntryForm = (date, overrides = {}) => ({
  id: null,
  employeeId: '',
  kind: 'advance',
  date,
  amountInput: '',
  paymentMethod: 'cash',
  note: '',
  ...overrides,
});

const toEntryForm = (entry) => ({
  id: entry.id,
  employeeId: entry.employee_id,
  kind: entry.kind,
  date: entry.date,
  amountInput: toAmountInput(entry.amount),
  paymentMethod: entry.payment_method,
  note: entry.note || '',
});

const createEmptyEmployeeForm = (salaryMonth) => ({
  id: null,
  fullName: '',
  position: '',
  phone: '',
  iban: '',
  startDate: todayISO(),
  endDate: '',
  note: '',
  salaryInput: '',
  savedSalary: null,
  salaryMonth,
});

export default function EmployeesPage() {
  const { canEdit } = useAccess();
  const isEditable = canEdit('employees');
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const range = monthRange(period.year, period.month);
  const periodTitle = `${MONTH_NAMES[period.month - 1]} ${period.year}`;

  const [entryForm, setEntryForm] = useState(() => createEmptyEntryForm(defaultEntryDate(range)));
  const [employeeForm, setEmployeeForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [employeeFeedback, setEmployeeFeedback] = useState(null);

  const data = useAsync(async () => {
    const [employees, salaries, entries] = await Promise.all([
      listEmployees(),
      listEmployeeSalaries(),
      listEmployeeEntries(range.end),
    ]);
    return { employees, salaries, entries };
  }, [range.end]);

  const employees = data.data?.employees || [];
  const salaries = data.data?.salaries || [];
  const balances = useMemo(
    () => (data.data ? monthlyBalances(data.data.employees, data.data.salaries, data.data.entries, period.year, period.month) : []),
    [data.data, period.year, period.month],
  );
  const monthEntries = useMemo(
    () => (data.data?.entries || []).filter((entry) => entry.date >= range.start),
    [data.data, range.start],
  );
  const employeeName = (id) => employees.find((employee) => employee.id === id)?.full_name || '—';

  const totals = balances.reduce(
    (sum, row) => ({
      earned: sum.earned + row.earned,
      advances: sum.advances + row.advances,
      salaryPayments: sum.salaryPayments + row.salaryPayments,
      weOwe: sum.weOwe + Math.max(row.balance, 0),
      theyOwe: sum.theyOwe + Math.max(-row.balance, 0),
    }),
    { earned: 0, advances: 0, salaryPayments: 0, weOwe: 0, theyOwe: 0 },
  );

  // ------------------------------------------------------------ entry form

  const entryAmount = parseAmount(entryForm.amountInput);
  const isEntryValid = entryForm.employeeId && entryForm.date && entryAmount > 0;
  const updateEntryForm = (changes) => setEntryForm((current) => ({ ...current, ...changes }));
  const selectedBalance = balances.find((row) => row.employee.id === entryForm.employeeId);
  const isEntryInMonth = entryForm.date >= range.start && entryForm.date <= range.end;

  // Balance after this entry (an edited entry is already counted in the balance)
  const editedEntry = entryForm.id ? monthEntries.find((entry) => entry.id === entryForm.id) : null;
  const balanceAfterEntry =
    selectedBalance && isEntryInMonth
      ? roundAmount(selectedBalance.balance + Number(editedEntry?.amount || 0) - (entryAmount > 0 ? entryAmount : 0))
      : null;

  function changePeriod(nextPeriod) {
    setPeriod(nextPeriod);
    const nextRange = monthRange(nextPeriod.year, nextPeriod.month);
    if (!entryForm.id) updateEntryForm({ date: defaultEntryDate(nextRange) });
  }

  async function handleEntrySubmit(event) {
    event.preventDefault();
    if (!isEntryValid) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      await saveEmployeeEntry({ ...entryForm, amount: entryAmount });
      setFeedback({
        variant: 'success',
        message: `${entryForm.id ? 'Güncellendi' : 'Kaydedildi'}: ${employeeName(entryForm.employeeId)} · ${ENTRY_KIND_LABELS[entryForm.kind]} ${formatCurrency(entryAmount)}`,
      });
      setEntryForm(createEmptyEntryForm(entryForm.date, { paymentMethod: entryForm.paymentMethod, kind: entryForm.kind }));
      data.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: toUserMessage(error) });
    } finally {
      setIsSaving(false);
    }
  }

  function startEditingEntry(entry) {
    setEntryForm(toEntryForm(entry));
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDeleteEntry(entry) {
    const summary = `${formatDate(entry.date)} · ${employeeName(entry.employee_id)} · ${ENTRY_KIND_LABELS[entry.kind]} ${formatCurrency(entry.amount)}`;
    if (!window.confirm(`${summary} silinsin mi?\nYapılan Ödemeler'deki karşılığı da silinir.`)) return;
    try {
      await deleteEmployeeEntry(entry.id);
      if (entryForm.id === entry.id) setEntryForm(createEmptyEntryForm(defaultEntryDate(range)));
      data.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: toUserMessage(error) });
    }
  }

  /** Prefills a salary payment that closes the employee's open balance */
  function payRemaining(row) {
    setEntryForm(
      createEmptyEntryForm(defaultEntryDate(range), {
        employeeId: row.employee.id,
        kind: 'salary_payment',
        amountInput: toAmountInput(row.balance),
        paymentMethod: row.employee.iban ? 'bank_transfer' : 'cash',
        note: `${periodTitle} maaşı`,
      }),
    );
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --------------------------------------------------------- employee form

  const salaryMonthOfPeriod = range.start.slice(0, 7);

  function startEditingEmployee(employee) {
    const [year, month] = salaryMonthOfPeriod.split('-').map(Number);
    const salary = salaryForMonth(salaries, employee.id, year, month);
    setEmployeeForm({
      id: employee.id,
      fullName: employee.full_name,
      position: employee.position || '',
      phone: employee.phone || '',
      iban: employee.iban ? formatIban(employee.iban) : '',
      startDate: employee.start_date,
      endDate: employee.end_date || '',
      note: employee.note || '',
      salaryInput: toAmountInput(salary),
      savedSalary: salary,
      salaryMonth: salaryMonthOfPeriod,
    });
    setEmployeeFeedback(null);
  }

  const updateEmployeeForm = (changes) => setEmployeeForm((current) => ({ ...current, ...changes }));
  const salaryAmount = employeeForm ? parseAmount(employeeForm.salaryInput) : NaN;
  const employeeIbanError =
    employeeForm?.iban.trim() && !isValidIban(employeeForm.iban) ? 'IBAN hatalı (TR ile başlayan 26 karakter olmalı).' : null;
  const isSalaryChanged = employeeForm && salaryAmount !== employeeForm.savedSalary;
  const isEmployeeValid =
    employeeForm &&
    employeeForm.fullName.trim() &&
    employeeForm.startDate &&
    (!employeeForm.endDate || employeeForm.endDate >= employeeForm.startDate) &&
    employeeForm.salaryInput.trim() !== '' &&
    salaryAmount >= 0 &&
    !employeeIbanError &&
    (!employeeForm.id || !isSalaryChanged || employeeForm.salaryMonth);

  async function handleEmployeeSubmit(event) {
    event.preventDefault();
    if (!isEmployeeValid) return;
    setIsSaving(true);
    setEmployeeFeedback(null);
    try {
      // A new employee's salary starts in their first month; a changed salary from the chosen month
      const salaryValidFrom = employeeForm.id
        ? `${employeeForm.salaryMonth}-01`
        : `${employeeForm.startDate.slice(0, 7)}-01`;
      await saveEmployee({
        ...employeeForm,
        salary: employeeForm.id && !isSalaryChanged ? null : salaryAmount,
        salaryValidFrom,
      });
      setEmployeeFeedback({ variant: 'success', message: `${employeeForm.id ? 'Güncellendi' : 'Eklendi'}: ${employeeForm.fullName.trim()}` });
      setEmployeeForm(null);
      data.reload();
    } catch (error) {
      setEmployeeFeedback({
        variant: 'error',
        message: error.code === UNIQUE_VIOLATION ? 'Bu isimde bir personel zaten var.' : toUserMessage(error),
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteEmployee(employee) {
    if (!window.confirm(`${employee.full_name} silinsin mi?`)) return;
    setEmployeeFeedback(null);
    try {
      await deleteEmployee(employee.id);
      if (employeeForm?.id === employee.id) setEmployeeForm(null);
      data.reload();
    } catch (error) {
      setEmployeeFeedback({
        variant: 'error',
        message:
          error.code === RESTRICT_VIOLATION
            ? 'Avans / maaş kaydı olan personel silinemez. İşten ayrıldıysa "İşten çıkış" tarihini girin.'
            : toUserMessage(error),
      });
    }
  }

  const activeEmployees = employees.filter((employee) => !employee.end_date || employee.end_date >= range.start);
  const entryEmployeeOptions = [
    ...activeEmployees,
    ...employees.filter((employee) => !activeEmployees.includes(employee) && employee.id === entryForm.employeeId),
  ];

  // ---------------------------------------------------------------- export

  async function exportToExcel() {
    setIsExporting(true);
    setFeedback(null);
    try {
      await downloadWorkbook(`koordinat-personel-avanslari-${range.start.slice(0, 7)}`, [
        {
          name: 'Ay Sonu Durumu',
          title: 'Personel ay sonu durumu',
          subtitle: periodTitle,
          columns: [
            { header: 'Personel', key: 'name', width: 26 },
            { header: 'Görev', key: 'position', width: 16 },
            { header: 'Aylık net maaş', key: 'monthlySalary', type: 'currency', width: 16 },
            { header: 'Devreden', key: 'carriedOver', type: 'currency' },
            { header: 'Bu ay hakediş', key: 'earned', type: 'currency' },
            { header: 'Avans', key: 'advances', type: 'currency' },
            { header: 'Maaş ödemesi', key: 'salaryPayments', type: 'currency' },
            { header: 'Ay sonu bakiye', key: 'balance', type: 'currency', width: 16 },
            { header: 'Durum', key: 'status', width: 18 },
          ],
          rows: balances.map((row) => ({
            name: row.employee.full_name,
            position: row.employee.position,
            monthlySalary: row.isEmployed ? row.monthlySalary : null,
            carriedOver: row.carriedOver,
            earned: row.earned,
            advances: row.advances,
            salaryPayments: row.salaryPayments,
            balance: Math.abs(row.balance),
            status: balanceStatus(row.balance).label,
            _style: row.balance > 0 ? 'negative' : row.balance < 0 ? 'positive' : undefined,
          })),
          totals: {
            name: 'TOPLAM',
            earned: totals.earned,
            advances: totals.advances,
            salaryPayments: totals.salaryPayments,
          },
          note:
            `Ay sonu bakiye = devreden + bu ay hakediş − avans − maaş ödemesi. ` +
            `Personel alacaklı (bizim ödeyeceğimiz): ${formatCurrency(totals.weOwe)} · ` +
            `Biz alacaklıyız (personelin borcu): ${formatCurrency(totals.theyOwe)}.`,
        },
        {
          name: 'Hareketler',
          title: 'Avans ve maaş ödemeleri',
          subtitle: periodTitle,
          columns: [
            { header: 'Tarih', key: 'date', type: 'date' },
            { header: 'Personel', key: 'name', width: 26 },
            { header: 'Tür', key: 'kind', width: 15 },
            { header: 'Ödeme yöntemi', key: 'method', width: 14 },
            { header: 'Not', key: 'note', width: 34 },
            { header: 'Tutar', key: 'amount', type: 'currency', width: 16 },
          ],
          rows: [...monthEntries].reverse().map((entry) => ({
            date: entry.date,
            name: employeeName(entry.employee_id),
            kind: ENTRY_KIND_LABELS[entry.kind],
            method: PAYMENT_METHOD_LABELS[entry.payment_method],
            note: entry.note,
            amount: entry.amount,
          })),
          totals: { name: `TOPLAM (${monthEntries.length} kayıt)`, amount: totals.advances + totals.salaryPayments },
        },
        {
          name: 'Personel',
          title: 'Personel listesi',
          subtitle: `Maaşlar ${periodTitle} itibarıyla`,
          columns: [
            { header: 'Ad soyad', key: 'name', width: 26 },
            { header: 'Görev', key: 'position', width: 16 },
            { header: 'Telefon', key: 'phone', width: 16 },
            { header: 'IBAN', key: 'iban', width: 34 },
            { header: 'İşe giriş', key: 'startDate', type: 'date' },
            { header: 'İşten çıkış', key: 'endDate', type: 'date' },
            { header: 'Aylık net maaş', key: 'salary', type: 'currency', width: 16 },
          ],
          rows: employees.map((employee) => ({
            name: employee.full_name,
            position: employee.position,
            phone: employee.phone,
            iban: employee.iban ? formatIban(employee.iban) : '',
            startDate: employee.start_date,
            endDate: employee.end_date,
            salary: salaryForMonth(salaries, employee.id, period.year, period.month),
            _style: employee.end_date && employee.end_date < range.start ? 'muted' : undefined,
          })),
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
        title="Personel Avansları"
        description="Personelin maaşını ve verilen avansları girin; ay sonunda kimin alacaklı olduğunu görün. Avans ve maaş ödemeleri Yapılan Ödemeler'e ve raporlara otomatik eklenir."
        actions={
          <>
            <MonthPicker year={period.year} month={period.month} onChange={changePeriod} />
            <button type="button" className="btn" onClick={exportToExcel} disabled={!data.data || isExporting}>
              <FileSpreadsheet size={16} />{isExporting ? 'Hazırlanıyor…' : "Excel'e aktar"}
            </button>
          </>
        }
      />
      <ErrorAlert error={data.error} />

      {isEditable ? (
        <form className="card card--form" onSubmit={handleEntrySubmit}>
          <div className="card__header card__header--wrap">
            <h3>{entryForm.id ? 'Kaydı düzenle' : 'Avans / maaş ödemesi gir'}</h3>
            <div className="segmented" role="group" aria-label="Kayıt türü">
              {Object.entries(ENTRY_KIND_LABELS).map(([kind, label]) => (
                <button
                  type="button"
                  key={kind}
                  className={`segmented__option ${entryForm.kind === kind ? 'is-active' : ''}`}
                  aria-pressed={entryForm.kind === kind}
                  onClick={() => updateEntryForm({ kind })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {employees.length === 0 && !data.isLoading ? (
            <EmptyState>Önce aşağıdan personel ekleyin.</EmptyState>
          ) : (
            <div className="form-grid">
              <label className="field">
                <span className="field__label">Personel *</span>
                <select value={entryForm.employeeId} onChange={(e) => updateEntryForm({ employeeId: e.target.value })} required>
                  <option value="">— Seçin —</option>
                  {entryEmployeeOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>{employee.full_name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Tarih</span>
                <input type="date" value={entryForm.date} onChange={(e) => updateEntryForm({ date: e.target.value })} required />
              </label>
              <label className="field">
                <span className="field__label">Tutar</span>
                <MoneyInput value={entryForm.amountInput} onChange={(amountInput) => updateEntryForm({ amountInput })} required />
              </label>
              <label className="field">
                <span className="field__label">Ödeme yöntemi</span>
                <select value={entryForm.paymentMethod} onChange={(e) => updateEntryForm({ paymentMethod: e.target.value })}>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="field form-grid__wide">
                <span className="field__label">Not</span>
                <input
                  type="text"
                  value={entryForm.note}
                  onChange={(e) => updateEntryForm({ note: e.target.value })}
                  placeholder={entryForm.kind === 'advance' ? 'Örn: Kira için avans' : `Örn: ${periodTitle} maaşı`}
                />
              </label>
              <div className="field form-grid__submit">
                <button className="btn btn--primary btn--block" disabled={!isEntryValid || isSaving}>
                  {isSaving ? 'Kaydediliyor…' : entryForm.id ? 'Güncelle' : `${ENTRY_KIND_LABELS[entryForm.kind]} kaydet`}
                </button>
                {entryForm.id && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--block"
                    onClick={() => setEntryForm(createEmptyEntryForm(defaultEntryDate(range)))}
                  >
                    Vazgeç
                  </button>
                )}
              </div>
              {selectedBalance && (
                <div className="field form-grid__full text-small">
                  <span>
                    {selectedBalance.employee.full_name} · {periodTitle}: hakediş {formatCurrency(selectedBalance.carriedOver + selectedBalance.earned)}
                    {selectedBalance.carriedOver !== 0 && ` (devreden ${formatCurrency(selectedBalance.carriedOver)} dahil)`},
                    avans {formatCurrency(selectedBalance.advances)}, maaş ödemesi {formatCurrency(selectedBalance.salaryPayments)}.
                    {balanceAfterEntry !== null && (
                      <>
                        {' '}Bu kayıttan sonra: <BalanceText balance={balanceAfterEntry} />
                      </>
                    )}
                  </span>
                </div>
              )}
            </div>
          )}
          {feedback && <Alert variant={feedback.variant}>{feedback.message}</Alert>}
        </form>
      ) : (
        <ReadOnlyNotice />
      )}

      {data.data && (
        <div className="stat-grid">
          <StatCard label="Bu ay maaş hakedişi" value={roundAmount(totals.earned)} hint={`${balances.filter((row) => row.isEmployed).length} personel`} />
          <StatCard label="Verilen avans" value={roundAmount(totals.advances)} hint={`Maaş ödemesi ${formatCurrency(totals.salaryPayments)}`} />
          <StatCard label="Personel alacaklı" value={roundAmount(totals.weOwe)} tone={totals.weOwe > 0 ? 'negative' : undefined} hint="Ay sonu bizim ödeyeceğimiz" />
          <StatCard label="Biz alacaklıyız" value={roundAmount(totals.theyOwe)} tone={totals.theyOwe > 0 ? 'positive' : undefined} hint="Personelin bize borcu" emphasized />
        </div>
      )}

      <section className="card">
        <h3>{periodTitle} — ay sonu durumu</h3>
        {data.isLoading ? (
          <p className="text-muted">Yükleniyor…</p>
        ) : balances.length === 0 ? (
          <EmptyState>Bu ay çalışan personel yok.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table data-table--stack">
              <thead>
                <tr>
                  <th>Personel</th>
                  <th className="text-end">Aylık maaş</th>
                  <th className="text-end">Devreden</th>
                  <th className="text-end">Bu ay hakediş</th>
                  <th className="text-end">Avans</th>
                  <th className="text-end">Maaş ödemesi</th>
                  <th className="text-end">Ay sonu</th>
                  <th aria-label="İşlemler" />
                </tr>
              </thead>
              <tbody>
                {balances.map((row) => (
                  <tr key={row.employee.id}>
                    <td data-label="Personel">
                      {row.employee.full_name}
                      {row.employee.position && <div className="text-muted text-small">{row.employee.position}</div>}
                      {!row.isEmployed && <div className="text-muted text-small">İşten ayrıldı</div>}
                    </td>
                    <td data-label="Aylık maaş" className="text-end">{row.isEmployed ? formatCurrency(row.monthlySalary) : '—'}</td>
                    <td data-label="Devreden" className="text-end">{formatCurrency(row.carriedOver)}</td>
                    <td data-label="Bu ay hakediş" className="text-end">{formatCurrency(row.earned)}</td>
                    <td data-label="Avans" className="text-end">{formatCurrency(row.advances)}</td>
                    <td data-label="Maaş ödemesi" className="text-end">{formatCurrency(row.salaryPayments)}</td>
                    <td data-label="Ay sonu" className="text-end"><BalanceText balance={row.balance} /></td>
                    <td className="row-actions">
                      {isEditable && (
                        <>
                          {row.balance > 0 && (
                            <button type="button" className="btn btn--primary btn--sm" onClick={() => payRemaining(row)}>Kalanı öde</button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-muted text-small">
          Ay sonu = devreden + bu ay hakediş − avans − maaş ödemesi. İşe giriş / çıkış ayında maaş, çalışılan gün sayısına göre
          hesaplanır. Kapanmayan bakiye sonraki aya devreder.
        </p>
      </section>

      <section className="card">
        <h3>{periodTitle} — avans ve maaş ödemeleri</h3>
        {monthEntries.length === 0 ? (
          <EmptyState>Bu ay kayıt yok.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table data-table--stack">
              <thead>
                <tr>
                  <th>Tarih</th><th>Personel</th><th>Tür</th><th>Yöntem</th><th>Not</th>
                  <th className="text-end">Tutar</th>
                  <th aria-label="İşlemler" />
                </tr>
              </thead>
              <tbody>
                {monthEntries.map((entry) => (
                  <tr key={entry.id} className={entryForm.id === entry.id ? 'is-selected' : undefined}>
                    <td data-label="Tarih">{formatDate(entry.date)}</td>
                    <td data-label="Personel">{employeeName(entry.employee_id)}</td>
                    <td data-label="Tür">
                      <span className={`badge badge--${entry.kind === 'advance' ? 'payment' : 'info'}`}>{ENTRY_KIND_LABELS[entry.kind]}</span>
                    </td>
                    <td data-label="Yöntem">{PAYMENT_METHOD_LABELS[entry.payment_method]}</td>
                    <td data-label="Not" className="text-muted">{entry.note}</td>
                    <td data-label="Tutar" className="text-end text-strong">{formatCurrency(entry.amount)}</td>
                    <td className="row-actions">
                      {isEditable && (
                        <>
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => startEditingEntry(entry)}>Düzenle</button>
                          <button type="button" className="btn btn--ghost btn--sm text-negative" onClick={() => handleDeleteEntry(entry)}>Sil</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card__header">
          <h3>Personel</h3>
          {isEditable && !employeeForm && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                setEmployeeForm(createEmptyEmployeeForm(salaryMonthOfPeriod));
                setEmployeeFeedback(null);
              }}
            >
              <UserPlus size={16} />Yeni personel
            </button>
          )}
        </div>

        {employeeForm && (
          <form className="user-form" onSubmit={handleEmployeeSubmit}>
            <h4>{employeeForm.id ? `Düzenle: ${employeeForm.fullName}` : 'Yeni personel'}</h4>
            <div className="form-grid">
              <label className="field">
                <span className="field__label">Ad soyad *</span>
                <input type="text" value={employeeForm.fullName} onChange={(e) => updateEmployeeForm({ fullName: e.target.value })} required />
              </label>
              <label className="field">
                <span className="field__label">Görev</span>
                <input type="text" value={employeeForm.position} onChange={(e) => updateEmployeeForm({ position: e.target.value })} placeholder="Örn: Barista" />
              </label>
              <label className="field">
                <span className="field__label">Aylık net maaş *</span>
                <MoneyInput value={employeeForm.salaryInput} onChange={(salaryInput) => updateEmployeeForm({ salaryInput })} required />
              </label>
              {employeeForm.id && isSalaryChanged && (
                <label className="field">
                  <span className="field__label">Yeni maaş hangi aydan itibaren?</span>
                  <input type="month" value={employeeForm.salaryMonth} onChange={(e) => updateEmployeeForm({ salaryMonth: e.target.value })} required />
                </label>
              )}
              <label className="field">
                <span className="field__label">Telefon</span>
                <input type="tel" value={employeeForm.phone} onChange={(e) => updateEmployeeForm({ phone: e.target.value })} />
              </label>
              <label className="field form-grid__half">
                <span className="field__label">IBAN</span>
                <input
                  type="text"
                  className="mono"
                  value={employeeForm.iban}
                  onChange={(e) => updateEmployeeForm({ iban: e.target.value })}
                  onBlur={() => employeeForm.iban.trim() && updateEmployeeForm({ iban: formatIban(employeeForm.iban) })}
                  placeholder="TR00 0000 0000 0000 0000 0000 00"
                  aria-invalid={Boolean(employeeIbanError)}
                  spellCheck={false}
                />
                {employeeIbanError && <span className="field__error">{employeeIbanError}</span>}
              </label>
              <label className="field">
                <span className="field__label">İşe giriş *</span>
                <input type="date" value={employeeForm.startDate} onChange={(e) => updateEmployeeForm({ startDate: e.target.value })} required />
              </label>
              <label className="field">
                <span className="field__label">İşten çıkış</span>
                <input type="date" value={employeeForm.endDate} min={employeeForm.startDate} onChange={(e) => updateEmployeeForm({ endDate: e.target.value })} />
              </label>
              <label className="field form-grid__half">
                <span className="field__label">Not</span>
                <input type="text" value={employeeForm.note} onChange={(e) => updateEmployeeForm({ note: e.target.value })} />
              </label>
            </div>
            {employeeForm.id && isSalaryChanged && (
              <p className="text-muted text-small">
                Önceki aylar eski maaşla hesaplanmaya devam eder; yeni maaş seçilen aydan itibaren geçerli olur.
              </p>
            )}
            <div className="toolbar">
              <button className="btn btn--primary" disabled={!isEmployeeValid || isSaving}>
                {isSaving ? 'Kaydediliyor…' : employeeForm.id ? 'Güncelle' : 'Personel ekle'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setEmployeeForm(null)}>Vazgeç</button>
            </div>
          </form>
        )}
        {employeeFeedback && <Alert variant={employeeFeedback.variant}>{employeeFeedback.message}</Alert>}

        {employees.length === 0 ? (
          <EmptyState>Henüz personel eklenmedi.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table data-table--stack">
              <thead>
                <tr>
                  <th>Ad soyad</th><th>Telefon / IBAN</th><th>İşe giriş</th><th>İşten çıkış</th>
                  <th className="text-end">Aylık net maaş ({MONTH_NAMES[period.month - 1]})</th>
                  <th aria-label="İşlemler" />
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => {
                  const hasLeft = employee.end_date && employee.end_date < range.start;
                  return (
                    <tr key={employee.id} className={employeeForm?.id === employee.id ? 'is-selected' : hasLeft ? 'text-muted' : undefined}>
                      <td data-label="Ad soyad">
                        {employee.full_name}
                        {employee.position && <div className="text-muted text-small">{employee.position}</div>}
                      </td>
                      <td data-label="Telefon / IBAN" className="text-small">
                        {employee.phone || '—'}
                        {employee.iban && <div className="text-muted mono">{formatIban(employee.iban)}</div>}
                      </td>
                      <td data-label="İşe giriş">{formatDate(employee.start_date)}</td>
                      <td data-label="İşten çıkış">{employee.end_date ? formatDate(employee.end_date) : '—'}</td>
                      <td data-label="Aylık net maaş" className="text-end text-strong">
                        {formatCurrency(salaryForMonth(salaries, employee.id, period.year, period.month))}
                      </td>
                      <td className="row-actions">
                        {isEditable && (
                          <>
                            <button type="button" className="btn btn--ghost btn--sm" onClick={() => startEditingEmployee(employee)}>Düzenle</button>
                            <button type="button" className="btn btn--ghost btn--sm text-negative" onClick={() => handleDeleteEmployee(employee)}>Sil</button>
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
      </section>
    </>
  );
}

function BalanceText({ balance }) {
  const status = balanceStatus(balance);
  return (
    <span className="balance-text">
      <b className={balance > 0 ? 'text-negative' : balance < 0 ? 'text-positive' : undefined}>{formatCurrency(Math.abs(balance))}</b>{' '}
      <span className={`badge badge--${status.tone}`}>{status.label}</span>
    </span>
  );
}
