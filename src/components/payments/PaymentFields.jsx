import { formatCurrency, formatIban, isValidIban, parseAmount, roundAmount } from '../../lib/format';
import { MoneyInput } from '../ui';

/** Empty values of the counterparty and invoice fields in a payment form */
export const EMPTY_PAYMENT_FIELDS = {
  counterparty: '',
  recipientName: '',
  iban: '',
  phone: '',
  invoiceNo: '',
  invoiceAmountInput: '',
};

/** Saved contact details of a counterparty as form values */
export const contactToFormFields = (contact) => ({
  recipientName: contact?.recipient_name || '',
  iban: contact?.iban ? formatIban(contact.iban) : '',
  phone: contact?.phone || '',
});

/** Validates the counterparty and invoice fields: { invoiceAmount, ibanError, isValid } */
export function validatePaymentFields(form) {
  const invoiceAmount = form.invoiceAmountInput ? parseAmount(form.invoiceAmountInput) : null;
  const ibanError = form.iban.trim() && !isValidIban(form.iban) ? 'IBAN hatalı (TR ile başlayan 26 karakter olmalı).' : null;
  return {
    invoiceAmount,
    ibanError,
    isValid: Boolean(form.counterparty.trim()) && !ibanError && (invoiceAmount === null || invoiceAmount > 0),
  };
}

/** Name (with autocomplete), recipient name, IBAN and phone of the person / company being paid */
export function CounterpartyFields({ form, updateForm, counterparties, label, ibanError }) {
  function handleNameChange(name) {
    const known = counterparties.find((counterparty) => counterparty.name === name.trim());
    // Picking a known name fills in its saved contact details
    updateForm(
      known && (known.recipient_name || known.iban || known.phone)
        ? { counterparty: name, ...contactToFormFields(known) }
        : { counterparty: name },
    );
  }

  return (
    <>
      <label className="field">
        <span className="field__label">{label} *</span>
        <input
          type="text"
          list="counterparty-options"
          value={form.counterparty}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Örn: ABC Ambalaj"
          required
        />
        <datalist id="counterparty-options">
          {counterparties.map((counterparty) => <option key={counterparty.name} value={counterparty.name} />)}
        </datalist>
      </label>
      <label className="field">
        <span className="field__label">Alıcı adı</span>
        <input
          type="text"
          value={form.recipientName}
          onChange={(e) => updateForm({ recipientName: e.target.value })}
          placeholder="IBAN sahibinin adı / ünvanı"
          autoComplete="off"
        />
      </label>
      <label className="field form-grid__half">
        <span className="field__label">IBAN</span>
        <input
          type="text"
          className="mono"
          value={form.iban}
          onChange={(e) => updateForm({ iban: e.target.value })}
          onBlur={() => form.iban.trim() && updateForm({ iban: formatIban(form.iban) })}
          placeholder="TR00 0000 0000 0000 0000 0000 00"
          aria-invalid={Boolean(ibanError)}
          autoComplete="off"
          spellCheck={false}
        />
        {ibanError && <span className="field__error">{ibanError}</span>}
      </label>
      <label className="field">
        <span className="field__label">Telefon</span>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => updateForm({ phone: e.target.value })}
          placeholder="Örn: 0532 000 00 00"
        />
      </label>
    </>
  );
}

/** Invoice number and invoice total */
export function InvoiceFields({ form, updateForm }) {
  return (
    <>
      <label className="field">
        <span className="field__label">Fatura no</span>
        <input type="text" value={form.invoiceNo} onChange={(e) => updateForm({ invoiceNo: e.target.value })} placeholder="Örn: ABC2026000123" />
      </label>
      <label className="field">
        <span className="field__label">Fatura tutarı</span>
        <MoneyInput value={form.invoiceAmountInput} onChange={(invoiceAmountInput) => updateForm({ invoiceAmountInput })} />
      </label>
    </>
  );
}

/**
 * Remaining debt of the invoice after this payment.
 *   balance:        invoice_balances row of the invoice (payments already made), or null
 *   invoiceAmount:  invoice total typed in the form (falls back to the stored one)
 *   amount:         amount of this payment
 *   alreadyCounted: part of the balance that is this same payment (editing a made payment)
 */
export function InvoiceDebtHint({ balance, invoiceAmount, amount, alreadyCounted = 0 }) {
  const total = Number(invoiceAmount ?? balance?.invoice_amount);
  if (!Number.isFinite(total) || total <= 0) return null;
  const paid = Number(balance?.paid_amount || 0) - alreadyCounted;
  const afterThis = roundAmount(total - paid - (Number.isFinite(amount) ? amount : 0));

  return (
    <div className="field form-grid__wide text-small">
      <span>
        Fatura tutarı <b>{formatCurrency(total)}</b> · daha önce ödenen <b>{formatCurrency(paid)}</b> · bu ödemeden sonra kalan borç{' '}
        <b className={afterThis > 0 ? 'text-negative' : 'text-positive'}>{formatCurrency(Math.max(afterThis, 0))}</b>
        {afterThis < 0 && <span className="text-negative"> (fatura tutarını {formatCurrency(-afterThis)} aşıyor)</span>}
      </span>
    </div>
  );
}
