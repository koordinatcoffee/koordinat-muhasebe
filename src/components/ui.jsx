import { AYLAR, formatTL, parseMoney } from '../lib/format';
import { groupKategoriler } from '../lib/kategoriler';

/** Ana gruplara ayrılmış kategori seçimi */
export function KategoriSelect({ kategoriler, tur, value, onChange }) {
  const gruplar = groupKategoriler(kategoriler, tur);
  const bilinmiyor = value && !kategoriler.some((k) => k.tur === tur && k.ad === value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Seçin —</option>
      {gruplar.map((g) => (
        <optgroup key={g.grup} label={g.grup}>
          {g.items.map((k) => (
            <option key={k.id} value={k.ad}>{k.ad}</option>
          ))}
        </optgroup>
      ))}
      {bilinmiyor && <option value={value}>{value}</option>}
    </select>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children && <div className="page-actions no-print">{children}</div>}
    </header>
  );
}

export function MoneyInput({ value, onChange, autoFocus, ...rest }) {
  const parsed = parseMoney(value);
  const invalid = value !== '' && Number.isNaN(parsed);
  return (
    <div className="money-input">
      <input
        type="text"
        inputMode="decimal"
        placeholder="0,00"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className={invalid ? 'invalid' : ''}
        {...rest}
      />
      <span className="money-suffix">₺</span>
    </div>
  );
}

export function StatCard({ label, value, tone, hint }) {
  return (
    <div className={`stat-card ${tone || ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{typeof value === 'number' ? formatTL(value) : value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function MonthPicker({ year, month, onChange }) {
  const years = yearOptions(year);
  const shift = (delta) => {
    const d = new Date(year, month - 1 + delta, 1);
    onChange(d.getFullYear(), d.getMonth() + 1);
  };
  return (
    <div className="month-picker">
      <button className="btn btn-ghost btn-sm" onClick={() => shift(-1)} aria-label="Önceki ay">‹</button>
      <select value={month} onChange={(e) => onChange(year, Number(e.target.value))}>
        {AYLAR.map((a, i) => (
          <option key={a} value={i + 1}>{a}</option>
        ))}
      </select>
      <select value={year} onChange={(e) => onChange(Number(e.target.value), month)}>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <button className="btn btn-ghost btn-sm" onClick={() => shift(1)} aria-label="Sonraki ay">›</button>
    </div>
  );
}

export function yearOptions(selected) {
  const now = new Date().getFullYear();
  const from = Math.min(2024, selected);
  const to = Math.max(now + 1, selected);
  const list = [];
  for (let y = to; y >= from; y--) list.push(y);
  return list;
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert error">Hata: {error.message || String(error)}</div>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}
