import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { listDailyRegisters, listRecentTransactions, listTransactions } from '../lib/api';
import {
  formatCurrency, formatDate, formatPercent, monthRange, MONTH_NAMES, PAYMENT_METHOD_LABELS, todayISO,
  TRANSACTION_TYPE_LABELS,
} from '../lib/format';
import { summarize } from '../lib/summary';
import { useAsync } from '../hooks/useAsync';
import { ROUTES } from '../config/navigation';
import { Alert, EmptyState, ErrorAlert, PageHeader, StatCard } from '../components/ui';

const RECENT_TRANSACTION_LIMIT = 8;

export default function DashboardPage() {
  const today = todayISO();
  const now = new Date();
  const currentMonth = monthRange(now.getFullYear(), now.getMonth() + 1);

  const { data, isLoading, error } = useAsync(async () => {
    const [registers, transactions, recentTransactions] = await Promise.all([
      listDailyRegisters(currentMonth.start, currentMonth.end),
      listTransactions(currentMonth.start, currentMonth.end),
      listRecentTransactions(RECENT_TRANSACTION_LIMIT),
    ]);
    return {
      todaySummary: summarize(
        registers.filter((r) => r.date === today),
        transactions.filter((t) => t.date === today),
      ),
      monthSummary: summarize(registers, transactions),
      isTodayRegisterMissing: !registers.some((r) => r.date === today),
      recentTransactions,
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
            <Link className="btn" to={ROUTES.ledger}><Plus size={16} />Gelir / Gider</Link>
            <Link className="btn" to={ROUTES.payments}><Plus size={16} />Ödeme</Link>
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
              <h3>Son hareketler</h3>
              <Link to={ROUTES.ledger} className="link">Tümünü gör →</Link>
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
