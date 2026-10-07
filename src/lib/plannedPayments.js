import { MONTH_NAMES, roundAmount } from './format.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const UPCOMING_DAYS = 7;

/** Whole days from fromDate to toDate (ISO dates); negative when toDate is earlier */
export const daysBetween = (fromDate, toDate) =>
  Math.round((new Date(`${toDate}T00:00:00`) - new Date(`${fromDate}T00:00:00`)) / DAY_MS);

/** Due status of a pending payment relative to today: { label, tone } — tone is a badge modifier */
export function dueStatus(dueDate, today) {
  const days = daysBetween(today, dueDate);
  if (days < 0) return { label: `${-days} gün gecikti`, tone: 'expense' };
  if (days === 0) return { label: 'Bugün', tone: 'payment' };
  if (days === 1) return { label: 'Yarın', tone: 'payment' };
  return { label: `${days} gün kaldı`, tone: days <= UPCOMING_DAYS ? 'payment' : 'info' };
}

/**
 * Totals of pending payments as of today:
 *   overdue  → due before today
 *   upcoming → due today or within UPCOMING_DAYS
 *   byMonth  → [{ key, label, amount, count }] by due month, overdue ones first in their own row
 */
export function summarizePlanned(payments, today) {
  const totals = {
    overdue: { amount: 0, count: 0 },
    upcoming: { amount: 0, count: 0 },
    total: { amount: 0, count: 0 },
  };
  const months = new Map();
  const add = (bucket, amount) => {
    bucket.amount += amount;
    bucket.count += 1;
  };

  for (const payment of payments) {
    const amount = Number(payment.amount) || 0;
    const days = daysBetween(today, payment.due_date);
    add(totals.total, amount);
    if (days < 0) add(totals.overdue, amount);
    else if (days <= UPCOMING_DAYS) add(totals.upcoming, amount);

    const key = days < 0 ? 'overdue' : payment.due_date.slice(0, 7);
    if (!months.has(key)) {
      const label = key === 'overdue' ? 'Gecikmiş' : `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
      months.set(key, { key, label, amount: 0, count: 0 });
    }
    add(months.get(key), amount);
  }

  const round = (bucket) => ({ ...bucket, amount: roundAmount(bucket.amount) });
  return {
    overdue: round(totals.overdue),
    upcoming: round(totals.upcoming),
    total: round(totals.total),
    // Payments are listed by due date, so months are already in order with "overdue" first
    byMonth: [...months.values()].map(round),
  };
}
