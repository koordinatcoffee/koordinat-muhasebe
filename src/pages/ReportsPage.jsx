import { useMemo, useState } from 'react';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { listCategories, listDailyRegisters, listTransactions } from '../lib/api';
import { downloadWorkbook } from '../lib/excel';
import {
  formatCurrency, formatDate, formatPercent, monthRange, MONTH_NAMES, PAYMENT_METHOD_LABELS, todayISO,
  TRANSACTION_TYPE_LABELS, yearRange,
} from '../lib/format';
import { COST_RATIOS } from '../lib/categories';
import { dailyBreakdown, monthlyBreakdown, summarize } from '../lib/summary';
import { useAsync } from '../hooks/useAsync';
import {
  Alert, EmptyState, ErrorAlert, getYearOptions, PageHeader, StatCard, toUserMessage,
} from '../components/ui';
import GroupedAmountTable, { shareOf } from '../components/reports/GroupedAmountTable';
import fullLogo from '../assets/brand/logo-full.png';

const PERIOD_TYPES = [
  { value: 'month', label: 'Aylık' },
  { value: 'year', label: 'Yıllık' },
  { value: 'custom', label: 'Tarih aralığı' },
];

const REGISTER_ENTRY_TYPE = 'register';
const REGISTER_ENTRY_LABEL = 'Kasa';

const isInflow = (entry) => entry.type === REGISTER_ENTRY_TYPE || entry.type === 'income';
const entryTypeLabel = (entry) =>
  entry.type === REGISTER_ENTRY_TYPE ? REGISTER_ENTRY_LABEL : TRANSACTION_TYPE_LABELS[entry.type];

/** Register cash/card amounts as ledger-like entries so they can be listed with transactions */
function registersToEntries(registers) {
  return registers.flatMap((register) =>
    [
      ['cash', register.cash],
      ['card', register.card],
    ]
      .filter(([, amount]) => Number(amount) > 0)
      .map(([paymentMethod, amount]) => ({
        key: `${register.id}-${paymentMethod}`,
        date: register.date,
        type: REGISTER_ENTRY_TYPE,
        category: 'Kasa Satışı',
        counterparty: '',
        payment_method: paymentMethod,
        description: register.note,
        amount: Number(amount),
      })),
  );
}

export default function ReportsPage() {
  const now = new Date();
  const [periodType, setPeriodType] = useState('month');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [customRange, setCustomRange] = useState({
    start: monthRange(now.getFullYear(), now.getMonth() + 1).start,
    end: todayISO(),
  });
  const [showAllEntries, setShowAllEntries] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  const range =
    periodType === 'month' ? monthRange(year, month) : periodType === 'year' ? yearRange(year) : customRange;
  const periodTitle =
    periodType === 'month'
      ? `${MONTH_NAMES[month - 1]} ${year}`
      : periodType === 'year'
        ? `${year} Yılı`
        : `${formatDate(range.start)} – ${formatDate(range.end)}`;
  const isRangeValid = Boolean(range.start && range.end && range.start <= range.end);

  const { data, isLoading, error } = useAsync(async () => {
    if (!isRangeValid) return null;
    const [registers, transactions, categories] = await Promise.all([
      listDailyRegisters(range.start, range.end),
      listTransactions(range.start, range.end),
      listCategories(),
    ]);
    return { registers, transactions, categories };
  }, [range.start, range.end]);

  const summary = useMemo(
    () => data && summarize(data.registers, data.transactions, data.categories),
    [data],
  );

  const periodBreakdown = useMemo(() => {
    if (!data) return [];
    return periodType === 'year'
      ? monthlyBreakdown(year, data.registers, data.transactions)
      : dailyBreakdown(range.start, range.end, data.registers, data.transactions).filter((row) => !row.isEmpty);
  }, [data, periodType, year, range.start, range.end]);

  const allEntries = useMemo(() => {
    if (!data) return [];
    return [...registersToEntries(data.registers), ...data.transactions].sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const costRatioRows = summary
    ? COST_RATIOS.map((ratio) => {
        const amount = summary.expenseByGroup.find((group) => group.name === ratio.group)?.amount || 0;
        return { ...ratio, amount, share: shareOf(amount, summary.totalIncome) };
      })
    : [];

  const breakdownUnitLabel = periodType === 'year' ? 'Ay' : 'Gün';

  async function exportToExcel() {
    setIsExporting(true);
    setExportError(null);
    const groupRows = (groups, total) =>
      groups.flatMap((group) => [
        { group: group.name, amount: group.amount, share: shareOf(group.amount, total), _style: 'group' },
        ...group.items.map((item) => ({ item: item.name, amount: item.amount, share: shareOf(item.amount, total) })),
      ]);
    const groupColumns = [
      { header: 'Grup', key: 'group', width: 32 },
      { header: 'Alt kalem', key: 'item', width: 40 },
      { header: 'Tutar', key: 'amount', type: 'currency', width: 18 },
      { header: 'Pay', key: 'share', type: 'percent' },
    ];
    const percentRow = { _types: { amount: 'percent' } };

    try {
      await downloadWorkbook(`koordinat-rapor-${range.start}_${range.end}`, [
        {
          name: 'Özet',
          title: 'Gelir / Gider ve Kâr-Zarar Özeti',
          subtitle: periodTitle,
          columns: [
            { header: 'Kalem', key: 'label', width: 34 },
            { header: 'Tutar', key: 'amount', type: 'currency', width: 20 },
          ],
          rows: [
            { label: 'Kasa · Nakit', amount: summary.registerCash },
            { label: 'Kasa · Kredi Kartı', amount: summary.registerCard },
            { label: 'Diğer gelirler', amount: summary.otherIncome },
            { label: 'TOPLAM GELİR', amount: summary.totalIncome, _style: 'group' },
            { label: 'Giderler', amount: summary.expenses },
            { label: 'Yapılan ödemeler', amount: summary.payments },
            { label: 'TOPLAM GİDER', amount: summary.totalOutflow, _style: 'group' },
            { label: 'Kâr marjı', amount: summary.profitMargin, ...percentRow },
            { label: 'Gider / Gelir oranı', amount: summary.outflowRatio, ...percentRow },
          ],
          totals: {
            label: summary.net >= 0 ? 'NET KÂR' : 'NET ZARAR',
            amount: summary.net,
          },
        },
        {
          name: 'Maliyet Oranları',
          title: 'Maliyet oranları (gelire göre)',
          subtitle: periodTitle,
          columns: [
            { header: 'Kalem', key: 'label', width: 24 },
            { header: 'Tutar', key: 'amount', type: 'currency', width: 18 },
            { header: 'Gelire oranı', key: 'share', type: 'percent', width: 14 },
            { header: 'Sektör ortalaması', key: 'benchmark', width: 20 },
          ],
          rows: costRatioRows,
        },
        {
          name: 'Gelir Dağılımı',
          title: 'Gelirler — ne sattık?',
          subtitle: periodTitle,
          columns: groupColumns,
          rows: groupRows(summary.incomeByGroup, summary.totalIncome),
          totals: { group: 'TOPLAM GELİR', amount: summary.totalIncome, share: summary.totalIncome > 0 ? 100 : null },
        },
        {
          name: 'Gider Dağılımı',
          title: 'Giderler — nereye harcadık?',
          subtitle: periodTitle,
          columns: groupColumns,
          rows: groupRows(summary.expenseByGroup, summary.totalOutflow),
          totals: { group: 'TOPLAM GİDER', amount: summary.totalOutflow, share: summary.totalOutflow > 0 ? 100 : null },
        },
        {
          name: 'Ödemeler (Kime)',
          title: 'Nereye ne ödeme yaptık?',
          subtitle: periodTitle,
          columns: [
            { header: 'Kime', key: 'name', width: 34 },
            { header: 'Adet', key: 'count', type: 'number' },
            { header: 'Tutar', key: 'amount', type: 'currency', width: 18 },
          ],
          rows: summary.paymentsByCounterparty,
          totals: {
            name: 'TOPLAM',
            count: summary.paymentsByCounterparty.reduce((count, row) => count + row.count, 0),
            amount: summary.payments,
          },
        },
        {
          name: 'Ödeme Yöntemi',
          title: 'Ödeme yöntemine göre giriş / çıkış',
          subtitle: periodTitle,
          columns: [
            { header: 'Yöntem', key: 'method', width: 20 },
            { header: 'Giriş', key: 'inflow', type: 'currency', width: 18 },
            { header: 'Çıkış', key: 'outflow', type: 'currency', width: 18 },
            { header: 'Net', key: 'net', type: 'currency', width: 18 },
          ],
          rows: Object.entries(summary.byPaymentMethod).map(([method, flow]) => ({
            method: PAYMENT_METHOD_LABELS[method],
            inflow: flow.inflow,
            outflow: flow.outflow,
            net: flow.inflow - flow.outflow,
          })),
          totals: { method: 'TOPLAM', inflow: summary.totalIncome, outflow: summary.totalOutflow, net: summary.net },
        },
        {
          name: `${breakdownUnitLabel} Bazında Döküm`,
          title: `${breakdownUnitLabel} bazında döküm`,
          subtitle: periodTitle,
          columns: [
            { header: breakdownUnitLabel, key: 'label', type: periodType === 'year' ? 'text' : 'date', width: 14 },
            { header: 'Kasa (nakit + kart)', key: 'registerTotal', type: 'currency', width: 18 },
            { header: 'Diğer gelir', key: 'otherIncome', type: 'currency' },
            { header: 'Toplam gelir', key: 'totalIncome', type: 'currency', width: 18 },
            { header: 'Gider', key: 'expenses', type: 'currency' },
            { header: 'Ödeme', key: 'payments', type: 'currency' },
            { header: 'Net', key: 'net', type: 'currency', width: 18 },
            { header: 'Marj', key: 'profitMargin', type: 'percent' },
          ],
          rows: periodBreakdown.map((row) => ({
            ...row,
            label: periodType === 'year' ? row.label : row.key,
            _style: row.isEmpty ? 'muted' : undefined,
          })),
          totals: {
            label: 'TOPLAM',
            registerTotal: summary.registerTotal,
            otherIncome: summary.otherIncome,
            totalIncome: summary.totalIncome,
            expenses: summary.expenses,
            payments: summary.payments,
            net: summary.net,
            profitMargin: summary.profitMargin,
            _types: { label: 'text' },
          },
        },
        {
          name: 'Tüm Hareketler',
          title: 'Tüm hareketler',
          subtitle: periodTitle,
          columns: [
            { header: 'Tarih', key: 'date', type: 'date' },
            { header: 'Tür', key: 'type', width: 10 },
            { header: 'Kategori', key: 'category', width: 28 },
            { header: 'Firma / Kişi', key: 'counterparty', width: 26 },
            { header: 'Fatura no', key: 'invoiceNo', width: 16 },
            { header: 'Ödeme yöntemi', key: 'method', width: 14 },
            { header: 'Açıklama', key: 'description', width: 34 },
            { header: 'Giriş', key: 'inflow', type: 'currency' },
            { header: 'Çıkış', key: 'outflow', type: 'currency' },
          ],
          rows: allEntries.map((entry) => ({
            date: entry.date,
            type: entryTypeLabel(entry),
            category: entry.category,
            counterparty: entry.counterparty,
            invoiceNo: entry.invoice_no,
            method: PAYMENT_METHOD_LABELS[entry.payment_method],
            description: entry.description,
            inflow: isInflow(entry) ? entry.amount : null,
            outflow: isInflow(entry) ? null : entry.amount,
          })),
          totals: {
            date: `TOPLAM (${allEntries.length} hareket)`,
            inflow: summary.totalIncome,
            outflow: summary.totalOutflow,
            _types: { date: 'text' },
          },
        },
      ]);
    } catch (error) {
      setExportError(error);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Raporlar / Kâr - Zarar"
        description="Ay sonu ve yıl sonu gelir-gider, kâr-zarar ve ödeme dökümü."
        actions={
          <>
            <button type="button" className="btn" onClick={exportToExcel} disabled={!summary || isLoading || isExporting}>
              <FileSpreadsheet size={16} />{isExporting ? 'Hazırlanıyor…' : "Excel'e aktar"}
            </button>
            <button type="button" className="btn btn--primary" onClick={() => window.print()} disabled={!summary}>
              <Printer size={16} />Yazdır / PDF
            </button>
          </>
        }
      />

      <section className="card no-print">
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Rapor dönemi">
            {PERIOD_TYPES.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`segmented__option ${periodType === option.value ? 'is-active' : ''}`}
                aria-pressed={periodType === option.value}
                onClick={() => setPeriodType(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {periodType === 'month' && (
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Ay">
              {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
            </select>
          )}
          {periodType !== 'custom' && (
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Yıl">
              {getYearOptions(year).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          )}
          {periodType === 'custom' && (
            <div className="date-range">
              <input type="date" value={customRange.start} onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })} aria-label="Başlangıç" />
              <span className="text-muted">→</span>
              <input type="date" value={customRange.end} onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })} aria-label="Bitiş" />
            </div>
          )}
          <label className="checkbox">
            <input type="checkbox" checked={showAllEntries} onChange={(e) => setShowAllEntries(e.target.checked)} />
            Tüm hareketleri listele
          </label>
        </div>
        {!isRangeValid && (
          <div className="alert alert--error">Başlangıç tarihi bitiş tarihinden sonra olamaz.</div>
        )}
      </section>

      <div className="print-only print-header">
        <img src={fullLogo} alt="Koordinat Coffee Factory" className="print-header__logo" />
        <div>
          <div className="print-header__title">Gelir / Gider ve Kâr-Zarar Raporu</div>
          <div><b>{periodTitle}</b></div>
          <div className="text-small">Rapor tarihi: {formatDate(todayISO())}</div>
        </div>
      </div>

      <ErrorAlert error={error} />
      {exportError && <Alert variant="error">Excel dosyası oluşturulamadı: {toUserMessage(exportError)}</Alert>}
      {isLoading && <p className="text-muted">Yükleniyor…</p>}

      {summary && !isLoading && (
        <>
          <h2 className="section-title no-print">{periodTitle}</h2>
          <div className="stat-grid">
            <StatCard
              label="Toplam Gelir"
              value={summary.totalIncome}
              tone="positive"
              hint={`Kasa ${formatCurrency(summary.registerTotal)} + Diğer ${formatCurrency(summary.otherIncome)}`}
            />
            <StatCard
              label="Toplam Gider"
              value={summary.totalOutflow}
              tone="negative"
              hint={`Gider ${formatCurrency(summary.expenses)} + Ödeme ${formatCurrency(summary.payments)}`}
            />
            <StatCard
              label={summary.net >= 0 ? 'Net Kâr' : 'Net Zarar'}
              value={summary.net}
              tone={summary.net >= 0 ? 'positive' : 'negative'}
              emphasized
            />
            <StatCard
              label="Kâr Marjı"
              value={formatPercent(summary.profitMargin)}
              hint={`Gider / Gelir oranı ${formatPercent(summary.outflowRatio)}`}
            />
          </div>

          <h2 className="section-title">Maliyet oranları (gelire göre)</h2>
          <div className="stat-grid">
            {costRatioRows.map((row) => (
              <StatCard
                key={row.group}
                label={row.label}
                value={formatPercent(row.share)}
                hint={`${formatCurrency(row.amount)} · ${row.benchmark}`}
              />
            ))}
          </div>

          <div className="layout-grid">
            <section className="card">
              <h3>Gelirler — ne sattık?</h3>
              <GroupedAmountTable
                groups={summary.incomeByGroup}
                total={summary.totalIncome}
                totalLabel="Toplam Gelir"
                tone="positive"
                emptyMessage="Gelir yok."
              />
              <p className="text-muted text-small">
                Kasa nakit {formatCurrency(summary.registerCash)} · kredi kartı {formatCurrency(summary.registerCard)}.
                Ürün grubu dağılımı Günlük Kasa'dan girilir.
              </p>
            </section>

            <section className="card">
              <h3>Giderler — nereye harcadık?</h3>
              <GroupedAmountTable
                groups={summary.expenseByGroup}
                total={summary.totalOutflow}
                totalLabel="Toplam Gider"
                tone="negative"
                emptyMessage="Gider yok."
              />
            </section>

            <section className="card">
              <h3>Nereye ne ödeme yaptık?</h3>
              {summary.paymentsByCounterparty.length === 0 ? (
                <EmptyState>Bu dönemde ödeme kaydı yok.</EmptyState>
              ) : (
                <div className="table-scroll">
                  <table className="data-table data-table--compact">
                    <thead>
                      <tr><th>Kime</th><th className="text-end">Adet</th><th className="text-end">Tutar</th></tr>
                    </thead>
                    <tbody>
                      {summary.paymentsByCounterparty.map((row) => (
                        <tr key={row.name}>
                          <td>{row.name}</td>
                          <td className="text-end text-muted">{row.count}</td>
                          <td className="text-end">{formatCurrency(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr><td>Toplam</td><td /><td className="text-end text-negative">{formatCurrency(summary.payments)}</td></tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <h3>Ödeme yöntemine göre (ne geldi, ne çıktı)</h3>
              <div className="table-scroll">
                <table className="data-table data-table--compact">
                  <thead>
                    <tr>
                      <th>Yöntem</th><th className="text-end">Giriş</th><th className="text-end">Çıkış</th><th className="text-end">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(summary.byPaymentMethod).map(([method, flow]) => {
                      const methodNet = flow.inflow - flow.outflow;
                      return (
                        <tr key={method}>
                          <td>{PAYMENT_METHOD_LABELS[method]}</td>
                          <td className="text-end text-positive">{formatCurrency(flow.inflow)}</td>
                          <td className="text-end text-negative">{formatCurrency(flow.outflow)}</td>
                          <td className={`text-end text-strong ${methodNet >= 0 ? 'text-positive' : 'text-negative'}`}>
                            {formatCurrency(methodNet)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-muted text-small">"Nakit" satırının neti, dönem içinde nakit kasaya giren ile çıkan farkını gösterir.</p>
            </section>
          </div>

          <section className="card print-page-break">
            <h3>{breakdownUnitLabel} bazında döküm</h3>
            {periodBreakdown.length === 0 ? (
              <EmptyState>Bu dönemde kayıt yok.</EmptyState>
            ) : (
              <div className="table-scroll">
                <table className="data-table data-table--compact data-table--wide">
                  <thead>
                    <tr>
                      <th>{breakdownUnitLabel}</th>
                      <th className="text-end">Kasa (Nakit+Kart)</th>
                      <th className="text-end">Diğer Gelir</th>
                      <th className="text-end">Toplam Gelir</th>
                      <th className="text-end">Gider</th>
                      <th className="text-end">Ödeme</th>
                      <th className="text-end">Net</th>
                      <th className="text-end">Marj</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodBreakdown.map((row) => (
                      <tr key={row.key} className={row.isEmpty ? 'text-muted' : undefined}>
                        <td>{row.label}</td>
                        <td className="text-end">{formatCurrency(row.registerTotal)}</td>
                        <td className="text-end">{formatCurrency(row.otherIncome)}</td>
                        <td className="text-end text-positive">{formatCurrency(row.totalIncome)}</td>
                        <td className="text-end">{formatCurrency(row.expenses)}</td>
                        <td className="text-end">{formatCurrency(row.payments)}</td>
                        <td className={`text-end text-strong ${row.net >= 0 ? 'text-positive' : 'text-negative'}`}>{formatCurrency(row.net)}</td>
                        <td className="text-end text-muted">{formatPercent(row.profitMargin)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Toplam</td>
                      <td className="text-end">{formatCurrency(summary.registerTotal)}</td>
                      <td className="text-end">{formatCurrency(summary.otherIncome)}</td>
                      <td className="text-end text-positive">{formatCurrency(summary.totalIncome)}</td>
                      <td className="text-end">{formatCurrency(summary.expenses)}</td>
                      <td className="text-end">{formatCurrency(summary.payments)}</td>
                      <td className={`text-end ${summary.net >= 0 ? 'text-positive' : 'text-negative'}`}>{formatCurrency(summary.net)}</td>
                      <td className="text-end">{formatPercent(summary.profitMargin)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {showAllEntries && (
            <section className="card print-page-break">
              <h3>Tüm hareketler ({allEntries.length})</h3>
              {allEntries.length === 0 ? (
                <EmptyState>Kayıt yok.</EmptyState>
              ) : (
                <div className="table-scroll">
                  <table className="data-table data-table--compact data-table--wide">
                    <thead>
                      <tr>
                        <th>Tarih</th><th>Tür</th><th>Kategori</th><th>Firma / Kişi</th><th>Yöntem</th><th>Açıklama</th>
                        <th className="text-end">Giriş</th><th className="text-end">Çıkış</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allEntries.map((entry) => (
                        <tr key={entry.key || entry.id}>
                          <td>{formatDate(entry.date)}</td>
                          <td>
                            <span className={`badge badge--${entry.type === REGISTER_ENTRY_TYPE ? 'income' : entry.type}`}>
                              {entryTypeLabel(entry)}
                            </span>
                          </td>
                          <td>{entry.category || '—'}</td>
                          <td>{entry.counterparty || '—'}</td>
                          <td>{PAYMENT_METHOD_LABELS[entry.payment_method]}</td>
                          <td className="text-muted">{entry.description}</td>
                          <td className="text-end text-positive">{isInflow(entry) ? formatCurrency(entry.amount) : ''}</td>
                          <td className="text-end text-negative">{isInflow(entry) ? '' : formatCurrency(entry.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={6}>Toplam</td>
                        <td className="text-end text-positive">{formatCurrency(summary.totalIncome)}</td>
                        <td className="text-end text-negative">{formatCurrency(summary.totalOutflow)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
