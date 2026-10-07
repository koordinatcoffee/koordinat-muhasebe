import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { listDailyRegisters, listPendingPlannedPayments, listRecentTransactions, listTransactions } from '../lib/api';
import {
  formatCurrency, formatDate, formatPercent, monthRange, MONTH_NAMES, PAYMENT_METHOD_LABELS, todayISO,
  TRANSACTION_TYPE_LABELS,
} from '../lib/format';
import { daysBetween, dueStatus, summarizePlanned, UPCOMING_DAYS } from '../lib/plannedPayments';
import { summarize } from '../lib/summary';
import { useAsync } from '../hooks/useAsync';
import { ROUTES } from '../config/navigation';
import { Alert, EmptyState, ErrorAlert, PageHeader, StatCard } from '../components/ui';

const RECENT_TRANSACTION_LIMIT = 8;
const UPCOMING_PAYMENT_LIMIT = 8;

export default function DashboardPage() {
  const today = todayISO();
  const now = new Date();
  const currentMonth = monthRange(now.getFullYear(), now.getMonth() + 1);

  const { data, isLoading, error } = useAsync(async () => {
    const [registers, transactions, recentTransactions, plannedPayments] = await Promise.all([
      listDailyRegisters(currentMonth.start, currentMonth.end),
      listTransactions(currentMonth.start, currentMonth.end),
      listRecentTransactions(RECENT_TRANSACTION_LIMIT),
      listPendingPlannedPayments(),
    ]);
    // Overdue and due within UPCOMING_DAYS (the list is sorted by due date)
    const upcomingPayments = plannedPayments.filter((payment) => daysBetween(today, payment.due_date) <= UPCOMING_DAYS);
    return {
      todaySummary: summarize(
        registers.filter((r) => r.date === today),
        transactions.filter((t) => t.date === today),
      ),
      monthSummary: summarize(registers, transactions),
      isTodayRegisterMissing: !registers.some((r) => r.date === today),
      recentTransactions,
      plannedSummary: summarizePlanned(upcomingPayments, today),
      upcomingPayments: upcomingPayments.slice(0, UPCOMING_PAYMENT_LIMIT),
    };
  }, []);

  return (
    <>
      <PageHeader
        title="Özet"
        description={`Bugün ${formatDate(today)}`}
        actions={
          <>
            <Link className="btn btn--primary" to={ROUTES.dailyRegister}><Plus size={16} />Günlük kasa</Link>
            <Link className="btn" to={ROUTES.payments}><Plus size={16} />Yapılan ödeme</Link>
            <Link className="btn" to={ROUTES.plannedPayments}><Plus size={16} />Yapılacak ödeme</Link>
          </>
        }
      />
      <ErrorAlert error={error} />
      {isLoading && <p className="text-muted">Yükleniyor…</p>}

      {data && (
        <>
          {data.isTodayRegisterMissing && (
            <Alert variant="warning">
              Bugünün kasası henüz girilmedi. <Link to={ROUTES.dailyRegister}>Şimdi gir →</Link>
            </Alert>
          )}
          {data.plannedSummary.overdue.count > 0 && (
            <Alert variant="error">
              Vadesi geçmiş {data.plannedSummary.overdue.count} ödeme var:{' '}
              <b>{formatCurrency(data.plannedSummary.overdue.amount)}</b>.{' '}
              <Link to={ROUTES.plannedPayments}>Yapılacak ödemeler →</Link>
            </Alert>
          )}

          <h2 className="section-title">Bugün</h2>
          <div className="stat-grid">
            <StatCard label="Kasa · Nakit" value={data.todaySummary.registerCash} />
            <StatCard label="Kasa · Kredi Kartı" value={data.todaySummary.registerCard} />
            <StatCard label="Toplam Gelir" value={data.todaySummary.totalIncome} tone="positive" hint="Kasa + diğer gelirler" />
            <StatCard label="Gider + Ödeme" value={data.todaySummary.totalOutflow} tone="negative" />
            <StatCard
              label="Günün Neti"
              value={data.todaySummary.net}
              tone={data.todaySummary.net >= 0 ? 'positive' : 'negative'}
              emphasized
            />
          </div>

          <h2 className="section-title">{MONTH_NAMES[now.getMonth()]} {now.getFullYear()}</h2>
          <div className="stat-grid">
            <StatCard
              label="Kasa Toplamı"
              value={data.monthSummary.registerTotal}
              hint={`Nakit ${formatCurrency(data.monthSummary.registerCash)} · Kart ${formatCurrency(data.monthSummary.registerCard)}`}
            />
            <StatCard label="Toplam Gelir" value={data.monthSummary.totalIncome} tone="positive" />
            <StatCard label="Giderler" value={data.monthSummary.expenses} tone="negative" />
            <StatCard label="Yapılan Ödemeler" value={data.monthSummary.payments} tone="negative" />
            <StatCard
              label={data.monthSummary.net >= 0 ? 'Aylık Kâr' : 'Aylık Zarar'}
              value={data.monthSummary.net}
              tone={data.monthSummary.net >= 0 ? 'positive' : 'negative'}
              hint={`Kâr marjı ${formatPercent(data.monthSummary.profitMargin)}`}
              emphasized
            />
          </div>

          <section className="card">
            <div className="card__header">
              <h3>Yaklaşan ödemeler (önümüzdeki {UPCOMING_DAYS} gün)</h3>
              <Link to={ROUTES.plannedPayments} className="link">Tümünü gör →</Link>
            </div>
            {data.upcomingPayments.length === 0 ? (
              <EmptyState>Yaklaşan ödeme yok.</EmptyState>
            ) : (
              <div className="table-scroll">
                <table className="data-table data-table--stack">
                  <thead>
                    <tr>
                      <th>Ödeme tarihi</th><th>Durum</th><th>Kime</th><th>Kategori</th>
                      <th className="text-end">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.upcomingPayments.map((payment) => {
                      const status = dueStatus(payment.due_date, today);
                      return (
                        <tr key={payment.id}>
                          <td data-label="Ödeme tarihi">{formatDate(payment.due_date)}</td>
                          <td data-label="Durum"><span className={`badge badge--${status.tone}`}>{status.label}</span></td>
                          <td data-label="Kime">{payment.counterparty}</td>
                          <td data-label="Kategori">{payment.category || '—'}</td>
                          <td data-label="Tutar" className="text-end text-strong">{formatCurrency(payment.amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="totals-bar">
              <span>
                Toplam ({data.plannedSummary.total.count} ödeme):{' '}
                <b className="text-negative">{formatCurrency(data.plannedSummary.total.amount)}</b>
              </span>
            </div>
          </section>

          <section className="card">
            <div className="card__header">
              <h3>Son hareketler</h3>
              <Link to={ROUTES.payments} className="link">Tümünü gör →</Link>
            </div>
            {data.recentTransactions.length === 0 ? (
              <EmptyState>Henüz hareket girilmedi.</EmptyState>
            ) : (
              <div className="table-scroll">
                <table className="data-table data-table--stack">
                  <thead>
                    <tr>
                      <th>Tarih</th><th>Tür</th><th>Kategori</th><th>Firma / Kişi</th><th>Yöntem</th>
                      <th className="text-end">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentTransactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td data-label="Tarih">{formatDate(transaction.date)}</td>
                        <td data-label="Tür">
                          <span className={`badge badge--${transaction.type}`}>{TRANSACTION_TYPE_LABELS[transaction.type]}</span>
                        </td>
                        <td data-label="Kategori">{transaction.category || '—'}</td>
                        <td data-label="Firma / Kişi">{transaction.counterparty || '—'}</td>
                        <td data-label="Yöntem">{PAYMENT_METHOD_LABELS[transaction.payment_method]}</td>
                        <td data-label="Tutar" className={`text-end ${transaction.type === 'income' ? 'text-positive' : 'text-negative'}`}>
                          {transaction.type === 'income' ? '+' : '−'}{formatCurrency(transaction.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
