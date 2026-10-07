import { roundAmount } from './format.js';

/**
 * Staff month-end balances.
 *   balance = carried over + salary earned − advances − salary payments
 *   balance > 0 → the employee is owed money (personel alacaklı)
 *   balance < 0 → the employee owes the business (biz alacaklıyız)
 * Salary is earned per calendar month; the first and last month of employment are
 * prorated by the days worked.
 */

const pad = (n) => String(n).padStart(2, '0');
const monthKey = (year, month) => `${year}-${pad(month)}-01`;
const daysInMonth = (year, month) => new Date(year, month, 0).getDate();
const BALANCE_TOLERANCE = 0.004;

export const ENTRY_KIND_LABELS = { advance: 'Avans', salary_payment: 'Maaş ödemesi' };

/** Net salary valid in the month: the latest salary row starting on or before it */
export function salaryForMonth(salaries, employeeId, year, month) {
  const key = monthKey(year, month);
  let amount = 0;
  let validFrom = '';
  for (const salary of salaries) {
    if (salary.employee_id !== employeeId || salary.valid_from > key || salary.valid_from < validFrom) continue;
    validFrom = salary.valid_from;
    amount = Number(salary.amount) || 0;
  }
  return amount;
}

/** Salary earned in a month, prorated by the days employed in it */
export function earnedInMonth(employee, salaries, year, month) {
  const salary = salaryForMonth(salaries, employee.id, year, month);
  const totalDays = daysInMonth(year, month);
  const first = monthKey(year, month);
  const last = `${year}-${pad(month)}-${pad(totalDays)}`;
  if (salary === 0 || employee.start_date > last || (employee.end_date && employee.end_date < first)) return 0;

  const startDay = employee.start_date > first ? Number(employee.start_date.slice(8, 10)) : 1;
  const endDay = employee.end_date && employee.end_date < last ? Number(employee.end_date.slice(8, 10)) : totalDays;
  return roundAmount((salary * (endDay - startDay + 1)) / totalDays);
}

export const isEmployedInMonth = (employee, year, month) =>
  employee.start_date <= `${year}-${pad(month)}-${pad(daysInMonth(year, month))}` &&
  (!employee.end_date || employee.end_date >= monthKey(year, month));

/**
 * One row per employee for the month (year, month 1-based):
 * { employee, monthlySalary, carriedOver, earned, advances, salaryPayments, balance, isEmployed, entryCount }
 * entries must include everything up to the end of the month.
 * Former employees are listed only while they still have an open balance or entries in the month.
 */
export function monthlyBalances(employees, salaries, entries, year, month) {
  const currentMonth = monthKey(year, month);
  const nextMonth = month === 12 ? monthKey(year + 1, 1) : monthKey(year, month + 1);

  return employees
    .map((employee) => {
      let carriedOver = 0;
      const [startYear, startMonth] = employee.start_date.split('-').map(Number);
      for (let y = startYear, m = startMonth; monthKey(y, m) < currentMonth; m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
        carriedOver += earnedInMonth(employee, salaries, y, m);
      }

      let advances = 0;
      let salaryPayments = 0;
      let entryCount = 0;
      for (const entry of entries) {
        if (entry.employee_id !== employee.id || entry.date >= nextMonth) continue;
        const amount = Number(entry.amount) || 0;
        if (entry.date < currentMonth) {
          carriedOver -= amount;
        } else {
          entryCount += 1;
          if (entry.kind === 'advance') advances += amount;
          else salaryPayments += amount;
        }
      }

      const earned = earnedInMonth(employee, salaries, year, month);
      const balance = roundAmount(carriedOver + earned - advances - salaryPayments);
      return {
        employee,
        monthlySalary: salaryForMonth(salaries, employee.id, year, month),
        carriedOver: roundAmount(carriedOver),
        earned,
        advances: roundAmount(advances),
        salaryPayments: roundAmount(salaryPayments),
        balance: Math.abs(balance) < BALANCE_TOLERANCE ? 0 : balance,
        isEmployed: isEmployedInMonth(employee, year, month),
        entryCount,
      };
    })
    .filter((row) => row.isEmployed || row.balance !== 0 || row.entryCount > 0)
    .sort((a, b) => a.employee.full_name.localeCompare(b.employee.full_name, 'tr'));
}

/** "Personel alacaklı" / "Biz alacaklıyız" / "Hesap kapalı" with a badge tone */
export function balanceStatus(balance) {
  if (balance > 0) return { label: 'Personel alacaklı', tone: 'payment' };
  if (balance < 0) return { label: 'Biz alacaklıyız', tone: 'income' };
  return { label: 'Hesap kapalı', tone: 'info' };
}
