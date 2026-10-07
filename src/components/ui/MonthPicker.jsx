import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTH_NAMES } from '../../lib/format';
import { getYearOptions } from './yearOptions';

/** month is 1-based */
export default function MonthPicker({ year, month, onChange }) {
  const shiftMonth = (offset) => {
    const date = new Date(year, month - 1 + offset, 1);
    onChange({ year: date.getFullYear(), month: date.getMonth() + 1 });
  };

  return (
    <div className="month-picker">
      <button type="button" className="btn btn--ghost btn--icon" onClick={() => shiftMonth(-1)} aria-label="Önceki ay">
        <ChevronLeft size={18} />
      </button>
      <select value={month} onChange={(event) => onChange({ year, month: Number(event.target.value) })} aria-label="Ay">
        {MONTH_NAMES.map((name, index) => (
          <option key={name} value={index + 1}>{name}</option>
        ))}
      </select>
      <select value={year} onChange={(event) => onChange({ year: Number(event.target.value), month })} aria-label="Yıl">
        {getYearOptions(year).map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      <button type="button" className="btn btn--ghost btn--icon" onClick={() => shiftMonth(1)} aria-label="Sonraki ay">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
