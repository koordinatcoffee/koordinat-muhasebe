const tlFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatTL = (n) => tlFormatter.format(Number(n) || 0);
export const formatNumber = (n) => numberFormatter.format(Number(n) || 0);
export const formatPercent = (n) =>
  Number.isFinite(n) ? `%${n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '—';

/**
 * Türkçe yazılmış tutarı sayıya çevirir.
 * "10.000" → 10000, "10.000,50" → 10000.5, "1500,5" → 1500.5, "1500.5" → 1500.5
 * Geçersiz girişte NaN, boş girişte 0 döner.
 */
export function parseMoney(input) {
  if (typeof input === 'number') return input;
  let s = String(input ?? '').trim().replace(/\s|₺|TL/gi, '');
  if (!s) return 0;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/** Sayıyı form alanında düzenlenebilir hale getirir: 10000.5 → "10000,50" */
export const toInputMoney = (n) =>
  n === null || n === undefined || n === '' ? '' : String(Number(n).toFixed(2)).replace('.', ',');

const pad = (n) => String(n).padStart(2, '0');

export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const today = () => toISODate(new Date());

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export const AYLAR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

/** month: 1-12 */
export function monthRange(year, month) {
  return {
    start: `${year}-${pad(month)}-01`,
    end: toISODate(new Date(year, month, 0)),
  };
}

export function yearRange(year) {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export const ODEME_YONTEMLERI = {
  nakit: 'Nakit',
  kredi_karti: 'Kredi Kartı',
  havale: 'Havale / EFT',
  diger: 'Diğer',
};

export const TUR_ETIKET = {
  gelir: 'Gelir',
  gider: 'Gider',
  odeme: 'Ödeme',
};
