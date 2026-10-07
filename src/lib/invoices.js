const invoiceKey = (counterparty, invoiceNo) => `${counterparty?.trim()}\u0000${invoiceNo?.trim()}`;

/** Builds a lookup of invoice balances (rows of the invoice_balances view) by counterparty + invoice number */
export function buildInvoiceLookup(balances = []) {
  const lookup = new Map(balances.map((balance) => [invoiceKey(balance.counterparty, balance.invoice_no), balance]));
  return (counterparty, invoiceNo) =>
    counterparty?.trim() && invoiceNo?.trim() ? lookup.get(invoiceKey(counterparty, invoiceNo)) || null : null;
}

/**
 * Remaining debt of an invoice: the invoice total minus the payments made for it.
 * Returns null when the invoice total is unknown.
 */
export function remainingDebt(balance, invoiceAmount) {
  const total = Number(balance?.invoice_amount ?? invoiceAmount);
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.round((total - Number(balance?.paid_amount || 0)) * 100) / 100;
}
