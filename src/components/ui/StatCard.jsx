import { formatCurrency } from '../../lib/format';

/** tone: 'positive' | 'negative'; emphasized adds a tinted background */
export default function StatCard({ label, value, hint, tone, emphasized = false }) {
  const classes = ['stat-card', tone && `stat-card--${tone}`, emphasized && 'stat-card--emphasized']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes}>
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{typeof value === 'number' ? formatCurrency(value) : value}</div>
      {hint && <div className="stat-card__hint">{hint}</div>}
    </div>
  );
}
