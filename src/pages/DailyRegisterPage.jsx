import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileSpreadsheet } from 'lucide-react';
import {
  deleteDailyRegister, getDailyRegister, listBranches, listCategories, listDailyRegisters, saveDailyRegister,
} from '../lib/api';
import {
  formatCurrency, formatDate, monthRange, MONTH_NAMES, parseAmount, roundAmount, toAmountInput, todayISO,
} from '../lib/format';
import { groupCategories, NON_REGISTER_INCOME_GROUPS } from '../lib/categories';
import { summarize } from '../lib/summary';
import { downloadWorkbook } from '../lib/excel';
import { useAsync } from '../hooks/useAsync';
import { useAccess } from '../hooks/useAccess';
import { useSelectedBranch } from '../hooks/useSelectedBranch';
import {
  Alert, BranchPicker, EmptyState, ErrorAlert, MoneyInput, MonthPicker, PageHeader, ReadOnlyNotice, SkeletonTable,
  toUserMessage,
} from '../components/ui';

const createEmptyForm = (date) => ({ date, cash: '', card: '', salesBreakdown: {}, note: '' });

const toBreakdownInputs = (salesBreakdown) =>
  Object.fromEntries(Object.entries(salesBreakdown || {}).map(([category, amount]) => [category, toAmountInput(amount)]));

const hasBreakdown = (register) => Object.keys(register?.sales_breakdown || {}).length > 0;

const weekdayOf = (isoDate) => new Date(`${isoDate}T00:00:00`).toLocaleDateString('tr-TR', { weekday: 'long' });

export default function DailyRegisterPage() {
  const { canEdit } = useAccess();
  const isEditable = canEdit('daily-register');
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [form, setForm] = useState(() => createEmptyForm(todayISO()));
  const [existingRegister, setExistingRegister] = useState(null);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const branches = useAsync(listBranches, []);
  const [branchId, setBranchId] = useSelectedBranch(branches.data);
  const branchName = branches.data?.find((branch) => branch.id === branchId)?.name || '';

  const range = monthRange(period.year, period.month);
  // Every branch's registers for the month: the selected branch is listed, all are summarized
  const registers = useAsync(() => listDailyRegisters(range.start, range.end), [range.start]);
  const categories = useAsync(listCategories, []);
  const salesGroups = groupCategories(categories.data || [], 'income').filter(
    (group) => !NON_REGISTER_INCOME_GROUPS.includes(group.groupName),
  );

  // One register per branch and day: picking a date (or branch) that already has a record loads it for editing
  useEffect(() => {
    let isCancelled = false;
    setExistingRegister(null);
    if (!form.date || !branchId) return undefined;
    getDailyRegister(branchId, form.date)
      .then((register) => {
        if (isCancelled) return;
        setExistingRegister(register);
        setForm((current) =>
          register
            ? {
                date: current.date,
                cash: toAmountInput(register.cash),
                card: toAmountInput(register.card),
                salesBreakdown: toBreakdownInputs(register.sales_breakdown),
                note: register.note || '',
              }
            : createEmptyForm(current.date),
        );
        if (hasBreakdown(register)) setIsBreakdownOpen(true);
      })
      .catch((error) => !isCancelled && setFeedback({ variant: 'error', message: toUserMessage(error) }));
    return () => {
      isCancelled = true;
    };
  }, [form.date, branchId]);

  const updateForm = (changes) => setForm((current) => ({ ...current, ...changes }));

  const cash = parseAmount(form.cash);
  const card = parseAmount(form.card);
  const total = (cash || 0) + (card || 0);

  const salesBreakdown = Object.fromEntries(
    Object.entries(form.salesBreakdown)
      .map(([category, input]) => [category, parseAmount(input)])
      .filter(([, amount]) => amount !== 0),
  );
  const breakdownAmounts = Object.values(salesBreakdown);
  const isBreakdownInvalid = breakdownAmounts.some((amount) => Number.isNaN(amount) || amount < 0);
  const allocatedTotal = breakdownAmounts.reduce((sum, amount) => sum + (Number.isNaN(amount) ? 0 : amount), 0);
  const unallocated = roundAmount(total - allocatedTotal);
  const isOverAllocated = unallocated < 0;

  const isValid =
    branchId &&
    form.date && !Number.isNaN(cash) && !Number.isNaN(card) && cash >= 0 && card >= 0 && total > 0 &&
    !isBreakdownInvalid && !isOverAllocated;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isValid) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      const saved = await saveDailyRegister({ branchId, date: form.date, cash, card, salesBreakdown, note: form.note.trim() });
      setExistingRegister(saved);
      setFeedback({
        variant: 'success',
        message: `${branchName} · ${formatDate(form.date)} kasası kaydedildi: ${formatCurrency(saved.total)}`,
      });
      registers.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: toUserMessage(error) });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(register) {
    if (!window.confirm(`${branchName} · ${formatDate(register.date)} tarihli kasa kaydı silinsin mi?`)) return;
    try {
      await deleteDailyRegister(register.id);
      if (register.id === existingRegister?.id) {
        setExistingRegister(null);
        setForm(createEmptyForm(form.date));
      }
      registers.reload();
    } catch (error) {
      setFeedback({ variant: 'error', message: toUserMessage(error) });
    }
  }

  function selectDateForEditing(date) {
    updateForm({ date });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const allRows = registers.data || [];
  const rows = allRows.filter((register) => register.branch_id === branchId);
  const monthTotals = rows.reduce(
    (totals, register) => ({ cash: totals.cash + Number(register.cash), card: totals.card + Number(register.card) }),
    { cash: 0, card: 0 },
  );

  // Month totals of every branch, in branch order
  const branchTotals = useMemo(
    () =>
      (branches.data || []).map((branch) => {
        const branchRows = allRows.filter((register) => register.branch_id === branch.id);
        const cashTotal = branchRows.reduce((sum, register) => sum + Number(register.cash), 0);
        const cardTotal = branchRows.reduce((sum, register) => sum + Number(register.card), 0);
        return { id: branch.id, name: branch.name, days: branchRows.length, cash: cashTotal, card: cardTotal, total: cashTotal + cardTotal };
      }),
    [branches.data, allRows],
  );
  const allBranchesTotal = branchTotals.reduce((sum, branch) => sum + branch.total, 0);
  const branchNameOf = (id) => branches.data?.find((branch) => branch.id === id)?.name || '—';

  async function exportToExcel() {
    setIsExporting(true);
    try {
      const periodTitle = `${MONTH_NAMES[period.month - 1]} ${period.year}`;
      const monthTotal = monthTotals.cash + monthTotals.card;
      const sales = summarize(rows, [], categories.data || []);
      const share = (amount) => (monthTotal > 0 ? (amount / monthTotal) * 100 : null);

      await downloadWorkbook(`koordinat-gunluk-kasa-${range.start.slice(0, 7)}`, [
        {
          name: 'Günlük Kasa',
          title: `Günlük Kasa — ${branchName}`,
          subtitle: periodTitle,
          columns: [
            { header: 'Tarih', key: 'date', type: 'date' },
            { header: 'Gün', key: 'weekday', width: 12 },
            { header: 'Nakit', key: 'cash', type: 'currency', width: 18 },
            { header: 'Kredi kartı', key: 'card', type: 'currency', width: 18 },
            { header: 'Toplam', key: 'total', type: 'currency', width: 18 },
            { header: 'Not', key: 'note', width: 36 },
          ],
          rows: [...rows].reverse().map((register) => ({
            date: register.date,
            weekday: weekdayOf(register.date),
            cash: register.cash,
            card: register.card,
            total: register.total,
            note: register.note,
          })),
          totals: {
            date: `TOPLAM (${rows.length} gün)`,
            cash: monthTotals.cash,
            card: monthTotals.card,
            total: monthTotal,
            _types: { date: 'text' },
          },
          note: rows.length ? `Günlük ortalama: ${formatCurrency(monthTotal / rows.length)}` : undefined,
        },
        {
          name: 'Satış Dağılımı',
          title: `Satış dağılımı (ürün grubuna göre) — ${branchName}`,
          subtitle: periodTitle,
          columns: [
            { header: 'Grup', key: 'group', width: 30 },
            { header: 'Alt kalem', key: 'item', width: 44 },
            { header: 'Tutar', key: 'amount', type: 'currency', width: 18 },
            { header: 'Pay', key: 'share', type: 'percent' },
          ],
          rows: sales.incomeByGroup.flatMap((group) => [
            { group: group.name, amount: group.amount, share: share(group.amount), _style: 'group' },
            ...group.items.map((item) => ({ item: item.name, amount: item.amount, share: share(item.amount) })),
          ]),
          totals: { group: 'TOPLAM', amount: monthTotal, share: monthTotal > 0 ? 100 : null },
        },
        {
          name: 'Şubeler',
          title: 'Şubelere göre kasa',
          subtitle: periodTitle,
          columns: [
            { header: 'Şube', key: 'name', width: 26 },
            { header: 'Gün', key: 'days', type: 'number' },
            { header: 'Nakit', key: 'cash', type: 'currency', width: 18 },
            { header: 'Kredi kartı', key: 'card', type: 'currency', width: 18 },
            { header: 'Toplam', key: 'total', type: 'currency', width: 18 },
            { header: 'Pay', key: 'share', type: 'percent' },
          ],
          rows: branchTotals.map((branch) => ({
            ...branch,
            share: allBranchesTotal > 0 ? (branch.total / allBranchesTotal) * 100 : null,
          })),
          totals: {
            name: 'TÜM ŞUBELER',
            cash: branchTotals.reduce((sum, branch) => sum + branch.cash, 0),
            card: branchTotals.reduce((sum, branch) => sum + branch.card, 0),
            total: allBranchesTotal,
            share: allBranchesTotal > 0 ? 100 : null,
          },
        },
        {
          name: 'Tüm Şubeler Günlük',
          title: 'Tüm şubelerin günlük kasası',
          subtitle: periodTitle,
          columns: [
            { header: 'Tarih', key: 'date', type: 'date' },
            { header: 'Şube', key: 'branch', width: 24 },
            { header: 'Nakit', key: 'cash', type: 'currency', width: 18 },
            { header: 'Kredi kartı', key: 'card', type: 'currency', width: 18 },
            { header: 'Toplam', key: 'total', type: 'currency', width: 18 },
            { header: 'Not', key: 'note', width: 34 },
          ],
          rows: [...allRows].reverse().map((register) => ({
            date: register.date,
            branch: branchNameOf(register.branch_id),
            cash: register.cash,
            card: register.card,
            total: register.total,
            note: register.note,
          })),
          totals: { date: `TOPLAM (${allRows.length} kayıt)`, total: allBranchesTotal, _types: { date: 'text' } },
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
        title="Günlük Kasa"
        description="Gün sonunda kasadaki nakit ve kredi kartı (POS / Z raporu) satış toplamlarını girin."
        actions={
          <button type="button" className="btn" onClick={exportToExcel} disabled={!registers.data || !branchId || isExporting}>
            <FileSpreadsheet size={16} />{isExporting ? 'Hazırlanıyor…' : "Excel'e aktar"}
          </button>
        }
      />

      <ErrorAlert error={branches.error} />
      {branches.data && branches.data.length > 1 && (
        <div className="branch-bar">
          <span className="field__label">Şube</span>
          <BranchPicker branches={branches.data} value={branchId} onChange={setBranchId} />
        </div>
      )}

      {isEditable ? (
        <form className="card card--form" onSubmit={handleSubmit}>
          <div className="card__header">
            <h3>
              {existingRegister ? 'Kasa kaydını güncelle' : 'Yeni kasa kaydı'}
              {branchName && <span className="text-muted"> · {branchName}</span>}
            </h3>
            {existingRegister && <span className="badge badge--info">Bu şube ve tarih için kayıt var — güncellenecek</span>}
          </div>

          <div className="form-grid">
            <label className="field">
              <span className="field__label">Tarih</span>
              <input type="date" value={form.date} onChange={(e) => updateForm({ date: e.target.value })} required />
            </label>
            <label className="field">
              <span className="field__label">Nakit</span>
              <MoneyInput value={form.cash} onChange={(cashInput) => updateForm({ cash: cashInput })} autoFocus />
            </label>
            <label className="field">
              <span className="field__label">Kredi Kartı</span>
              <MoneyInput value={form.card} onChange={(cardInput) => updateForm({ card: cardInput })} />
            </label>
            <div className="field">
              <span className="field__label">Toplam</span>
              <div className="total-display">{formatCurrency(total)}</div>
            </div>
            <label className="field form-grid__wide">
              <span className="field__label">Not (isteğe bağlı)</span>
              <input type="text" value={form.note} onChange={(e) => updateForm({ note: e.target.value })} placeholder="Örn: Hafta sonu yoğunluk" />
            </label>
            <div className="field form-grid__submit">
              <button className="btn btn--primary btn--block" disabled={!isValid || isSaving}>
                {isSaving ? 'Kaydediliyor…' : existingRegister ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>

          <div className="sales-breakdown">
            <button
              type="button"
              className="sales-breakdown__toggle"
              onClick={() => setIsBreakdownOpen((open) => !open)}
              aria-expanded={isBreakdownOpen}
            >
              {isBreakdownOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <span>
                Satış dağılımı — ürün grubuna göre <span className="text-muted">(isteğe bağlı)</span>
              </span>
            </button>

            {isBreakdownOpen && (
              <>
                <p className="text-muted text-small">
                  POS / adisyon raporundaki ürün grubu tutarlarını girerseniz raporlarda "ne sattık" dökümü çıkar.
                  Dağıtılmayan kısım "Kasa Satışı (dağıtılmamış)" olarak kalır. Toplam, kasa toplamını geçemez.
                </p>
                <ErrorAlert error={categories.error} />
                {salesGroups.map((group) => (
                  <div key={group.groupName} className="sales-breakdown__group">
                    <div className="group-title">{group.groupName}</div>
                    <div className="sales-breakdown__grid">
                      {group.categories.map((category) => (
                        <label key={category.id} className="field">
                          <span className="field__label">{category.name}</span>
                          <MoneyInput
                            value={form.salesBreakdown[category.name] ?? ''}
                            onChange={(amountInput) =>
                              updateForm({ salesBreakdown: { ...form.salesBreakdown, [category.name]: amountInput } })
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <div className={`sales-breakdown__summary ${isOverAllocated ? 'is-over' : ''}`}>
                  <span>Dağıtılan: <b>{formatCurrency(allocatedTotal)}</b></span>
                  {isOverAllocated ? (
                    <span>Kasa toplamını <b>{formatCurrency(-unallocated)}</b> aşıyor</span>
                  ) : (
                    <span>Dağıtılmamış: <b>{formatCurrency(unallocated)}</b></span>
                  )}
                </div>
              </>
            )}
          </div>

          {feedback && <Alert variant={feedback.variant}>{feedback.message}</Alert>}
        </form>
      ) : (
        <ReadOnlyNotice />
      )}

      <section className="card">
        <div className="card__header card__header--wrap">
          <h3>Aylık kasa listesi{branchName && <span className="text-muted"> · {branchName}</span>}</h3>
          <MonthPicker year={period.year} month={period.month} onChange={setPeriod} />
        </div>
        <ErrorAlert error={registers.error} />
        {registers.isLoading || branches.isLoading ? (
          <SkeletonTable rows={6} columns={5} />
        ) : rows.length === 0 ? (
          <EmptyState>Bu şube için bu ay kasa kaydı yok.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table data-table--stack">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th className="text-end">Nakit</th>
                  <th className="text-end">Kredi Kartı</th>
                  <th className="text-end">Toplam</th>
                  <th>Not</th>
                  <th aria-label="İşlemler" />
                </tr>
              </thead>
              <tbody>
                {rows.map((register) => (
                  <tr key={register.id} className={register.id === existingRegister?.id ? 'is-selected' : undefined}>
                    <td data-label="Tarih">
                      {formatDate(register.date)}
                      {hasBreakdown(register) && <span className="badge badge--info badge--tiny">dağılım</span>}
                    </td>
                    <td data-label="Nakit" className="text-end">{formatCurrency(register.cash)}</td>
                    <td data-label="Kredi Kartı" className="text-end">{formatCurrency(register.card)}</td>
                    <td data-label="Toplam" className="text-end text-strong">{formatCurrency(register.total)}</td>
                    <td data-label="Not" className="text-muted">{register.note}</td>
                    <td className="row-actions">
                      {isEditable && (
                        <>
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => selectDateForEditing(register.date)}>Düzenle</button>
                          <button type="button" className="btn btn--ghost btn--sm text-negative" onClick={() => handleDelete(register)}>Sil</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td data-label="Ay toplamı">{rows.length} gün</td>
                  <td data-label="Nakit" className="text-end">{formatCurrency(monthTotals.cash)}</td>
                  <td data-label="Kredi Kartı" className="text-end">{formatCurrency(monthTotals.card)}</td>
                  <td data-label="Toplam" className="text-end">{formatCurrency(monthTotals.cash + monthTotals.card)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {branchTotals.length > 1 && (
        <section className="card">
          <h3>Şubelere göre — {MONTH_NAMES[period.month - 1]} {period.year}</h3>
          {registers.isLoading ? (
            <SkeletonTable rows={branchTotals.length} columns={5} />
          ) : (
            <div className="table-scroll">
              <table className="data-table data-table--stack">
                <thead>
                  <tr>
                    <th>Şube</th>
                    <th className="text-end">Gün</th>
                    <th className="text-end">Nakit</th>
                    <th className="text-end">Kredi Kartı</th>
                    <th className="text-end">Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {branchTotals.map((branch) => (
                    <tr key={branch.id} className={branch.id === branchId ? 'is-selected' : undefined}>
                      <td data-label="Şube">
                        <button type="button" className="link-button" onClick={() => setBranchId(branch.id)}>{branch.name}</button>
                      </td>
                      <td data-label="Gün" className="text-end">{branch.days}</td>
                      <td data-label="Nakit" className="text-end">{formatCurrency(branch.cash)}</td>
                      <td data-label="Kredi Kartı" className="text-end">{formatCurrency(branch.card)}</td>
                      <td data-label="Toplam" className="text-end text-strong">{formatCurrency(branch.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Tüm şubeler</td>
                    <td />
                    <td className="text-end">{formatCurrency(branchTotals.reduce((sum, branch) => sum + branch.cash, 0))}</td>
                    <td className="text-end">{formatCurrency(branchTotals.reduce((sum, branch) => sum + branch.card, 0))}</td>
                    <td className="text-end">{formatCurrency(allBranchesTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
