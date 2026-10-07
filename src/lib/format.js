const LOCALE = 'tr-TR';

const currencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);

export const formatPercent = (value) =>
  Number.isFinite(value) ? `%${value.toLocaleString(LOCALE, { maximumFractionDigits: 1 })}` : '—';

/**
 * Parses an amount typed in Turkish notation.
 * "10.000" → 10000, "10.000,50" → 10000.5, "1500,5" → 1500.5, "1500.5" → 1500.5
 * Returns 0 for empty input and NaN for invalid input.
 */
export function parseAmount(input) {
  if (typeof input === 'number') return input;
  let normalized = String(input ?? '').trim().replace(/\s|₺|TL/gi, '');
  if (!normalized) return 0;
  if (normalized.includes(',')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, '');
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : NaN;
}

/** Converts a stored number into an editable input value: 10000.5 → "10000,50" */
export const toAmountInput = (value) =>
  value === null || value === undefined || value === '' ? '' : Number(value).toFixed(2).replace('.', ',');

export const roundAmount = (value) => Math.round(value * 100) / 100;

const pad = (n) => String(n).padStart(2, '0');

export const toISODate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const todayISO = () => toISODate(new Date());

/** "2026-10-01" → "01.10.2026" */
export function formatDate(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}.${month}.${year}`;
}

export const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

/** month is 1-based */
export const monthRange = (year, month) => ({
  start: `${year}-${pad(month)}-01`,
  end: toISODate(new Date(year, month, 0)),
});

export const yearRange = (year) => ({ start: `${year}-01-01`, end: `${year}-12-31` });

export const PAYMENT_METHOD_LABELS = {
  cash: 'Nakit',
  card: 'Kredi Kartı',
  bank_transfer: 'Havale / EFT',
  other: 'Diğer',
};

export const TRANSACTION_TYPE_LABELS = {
  income: 'Gelir',
  expense: 'Gider',
  payment: 'Ödeme',
};
