import { MONTH_NAMES, roundAmount } from './format.js';
import {
  buildGroupLookup, FALLBACK_GROUP, REGISTER_SALES_GROUP, UNALLOCATED_REGISTER_SALES,
} from './categories.js';

const toNumber = (value) => Number(value) || 0;
const UNCATEGORIZED = 'Kategorisiz';
const UNSPECIFIED = 'Belirtilmemiş';

function increment(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount);
}

const toSortedRows = (map) =>
  [...map.entries()]
    .map(([name, amount]) => ({ name, amount: roundAmount(amount) }))
    .sort((a, b) => b.amount - a.amount);

/** Rolls category rows up into groups: [{ name, amount, items: [{ name, amount }] }] */
function rollUpByGroup(rows, groupOf) {
  const groups = new Map();
  for (const row of rows) {
    const groupName = groupOf(row.name);
    if (!groups.has(groupName)) groups.set(groupName, { name: groupName, amount: 0, items: [] });
    const group = groups.get(groupName);
    group.amount += row.amount;
    group.items.push(row);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, amount: roundAmount(group.amount) }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Builds a period summary from daily registers and transactions.
 *   Total income  = register (cash + card) + other income
 *   Total outflow = made payments (the old "expense" type is moved into payments by schema.sql
 *                   and is not counted separately, so the total always matches Yapılan Ödemeler)
 *   Net           = total income − total outflow
 * A register's sales_breakdown is added to income categories; the unallocated
 * remainder is reported as UNALLOCATED_REGISTER_SALES.
 */
export function summarize(registers = [], transactions = [], categories = []) {
  let registerCash = 0;
  let registerCard = 0;
  let otherIncome = 0;
  let payments = 0;

  const incomeByCategory = new Map();
  const expenseByCategory = new Map();
  const paymentTotals = new Map();
  const paymentCounts = new Map();
  const byPaymentMethod = {
    cash: { inflow: 0, outflow: 0 },
    card: { inflow: 0, outflow: 0 },
    bank_transfer: { inflow: 0, outflow: 0 },
    other: { inflow: 0, outflow: 0 },
  };

  for (const register of registers) {
    const cash = toNumber(register.cash);
    const card = toNumber(register.card);
    registerCash += cash;
    registerCard += card;

    let allocated = 0;
    for (const [category, value] of Object.entries(register.sales_breakdown || {})) {
      const amount = toNumber(value);
      if (amount <= 0) continue;
      increment(incomeByCategory, category, amount);
      allocated += amount;
    }
    const unallocated = cash + card - allocated;
    if (unallocated > 0.004) increment(incomeByCategory, UNALLOCATED_REGISTER_SALES, unallocated);
  }
  byPaymentMethod.cash.inflow += registerCash;
  byPaymentMethod.card.inflow += registerCard;

  for (const transaction of transactions) {
    const amount = toNumber(transaction.amount);
    const method = byPaymentMethod[transaction.payment_method] || byPaymentMethod.other;
    const category = transaction.category || UNCATEGORIZED;

    if (transaction.type === 'income') {
      otherIncome += amount;
      method.inflow += amount;
      increment(incomeByCategory, category, amount);
      continue;
    }

    if (transaction.type !== 'payment') continue;
    payments += amount;
    const counterparty = transaction.counterparty || UNSPECIFIED;
    increment(paymentTotals, counterparty, amount);
    increment(paymentCounts, counterparty, 1);
    method.outflow += amount;
    increment(expenseByCategory, category, amount);
  }

  const registerTotal = registerCash + registerCard;
  const totalIncome = registerTotal + otherIncome;
  const totalOutflow = payments;
  const net = totalIncome - totalOutflow;

  const groupLookup = buildGroupLookup(categories);
  const incomeGroupOf = (name) =>
    name === UNALLOCATED_REGISTER_SALES
      ? REGISTER_SALES_GROUP
      : groupLookup.income.get(name) || FALLBACK_GROUP.income;
  const expenseGroupOf = (name) => groupLookup.expense.get(name) || FALLBACK_GROUP.expense;

  const incomeRows = toSortedRows(incomeByCategory);
  const expenseRows = toSortedRows(expenseByCategory);

  return {
    registerCash: roundAmount(registerCash),
    registerCard: roundAmount(registerCard),
    registerTotal: roundAmount(registerTotal),
    otherIncome: roundAmount(otherIncome),
    totalIncome: roundAmount(totalIncome),
    payments: roundAmount(payments),
    totalOutflow: roundAmount(totalOutflow),
    net: roundAmount(net),
    profitMargin: totalIncome > 0 ? (net / totalIncome) * 100 : NaN,
    outflowRatio: totalIncome > 0 ? (totalOutflow / totalIncome) * 100 : NaN,
    incomeByCategory: incomeRows,
    expenseByCategory: expenseRows,
    incomeByGroup: rollUpByGroup(incomeRows, incomeGroupOf),
    expenseByGroup: rollUpByGroup(expenseRows, expenseGroupOf),
    paymentsByCounterparty: toSortedRows(paymentTotals).map((row) => ({
      ...row,
      count: paymentCounts.get(row.name),
    })),
    byPaymentMethod,
  };
}

/** Buckets records by key and summarizes each bucket (monthly or daily breakdown). */
function breakdown(registers, transactions, { keys, keyOf, labelOf }) {
  const buckets = new Map(keys.map((key) => [key, { registers: [], transactions: [] }]));
  for (const register of registers) buckets.get(keyOf(register.date))?.registers.push(register);
  for (const transaction of transactions) buckets.get(keyOf(transaction.date))?.transactions.push(transaction);

  return keys.map((key) => {
    const bucket = buckets.get(key);
    return {
      key,
      label: labelOf(key),
      isEmpty: !bucket.registers.length && !bucket.transactions.length,
      ...summarize(bucket.registers, bucket.transactions),
    };
  });
}

export function monthlyBreakdown(year, registers, transactions) {
  return breakdown(registers, transactions, {
    keys: MONTH_NAMES.map((_, index) => `${year}-${String(index + 1).padStart(2, '0')}`),
    keyOf: (date) => date.slice(0, 7),
    labelOf: (key) => MONTH_NAMES[Number(key.slice(5, 7)) - 1],
  });
}

const MAX_DAILY_BUCKETS = 400;

export function dailyBreakdown(startDate, endDate, registers, transactions) {
  const keys = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const last = new Date(`${endDate}T00:00:00`);
  while (cursor <= last && keys.length < MAX_DAILY_BUCKETS) {
    keys.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`,
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return breakdown(registers, transactions, {
    keys,
    keyOf: (date) => date.slice(0, 10),
    labelOf: (key) => `${key.slice(8, 10)}.${key.slice(5, 7)}.${key.slice(0, 4)}`,
  });
}
