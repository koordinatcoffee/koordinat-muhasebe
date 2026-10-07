import { parseAmount } from '../../lib/format';

/** Text input for Turkish-formatted amounts ("10.000,50"); the raw string is kept in state. */
export default function MoneyInput({ value, onChange, ...inputProps }) {
  const isInvalid = value !== '' && Number.isNaN(parseAmount(value));
  return (
    <div className="money-input">
      <input
        type="text"
        inputMode="decimal"
        placeholder="0,00"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={isInvalid}
        className={isInvalid ? 'is-invalid' : undefined}
        {...inputProps}
      />
      <span className="money-input__suffix">₺</span>
    </div>
  );
}
