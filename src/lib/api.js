import { supabase } from './supabaseClient';
import { normalizeIban } from './format';

const PAGE_SIZE = 1000;

/** Supabase returns at most 1000 rows per request; fetches page by page for yearly reports. */
async function fetchAllPages(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// --------------------------------------------------------------- Daily registers

export const listDailyRegisters = (startDate, endDate) =>
  fetchAllPages(() =>
    supabase
      .from('daily_registers')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false }),
  );

export async function getDailyRegister(date) {
  return unwrap(await supabase.from('daily_registers').select('*').eq('date', date).maybeSingle());
}

export async function saveDailyRegister({ date, cash, card, salesBreakdown, note }) {
  return unwrap(
    await supabase
      .from('daily_registers')
      .upsert(
        { date, cash, card, sales_breakdown: salesBreakdown || {}, note: note || null },
        { onConflict: 'date' },
      )
      .select()
      .single(),
  );
}

export async function deleteDailyRegister(id) {
  unwrap(await supabase.from('daily_registers').delete().eq('id', id));
}

// ------------------------------------------------------------------ Transactions

export const listTransactions = (startDate, endDate, types) =>
  fetchAllPages(() => {
    let query = supabase
      .from('transactions')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id');
    if (types?.length) query = query.in('type', types);
    return query;
  });

export async function listRecentTransactions(limit = 10) {
  return unwrap(
    await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit),
  );
}

/** Invoice fields shared by payments and planned payments */
const toInvoiceColumns = (fields) => ({
  invoice_no: fields.invoiceNo?.trim() || null,
  invoice_amount: fields.invoiceAmount || null,
});

export async function saveTransaction({ id, ...fields }) {
  const row = {
    date: fields.date,
    type: fields.type,
    category: fields.category || null,
    counterparty: fields.counterparty?.trim() || null,
    payment_method: fields.paymentMethod,
    amount: fields.amount,
    description: fields.description?.trim() || null,
    ...toInvoiceColumns(fields),
  };
  const query = id
    ? supabase.from('transactions').update(row).eq('id', id)
    : supabase.from('transactions').insert(row);
  const saved = unwrap(await query.select().single());
  await saveCounterpartyDetails(fields);
  return saved;
}

export async function deleteTransaction(id) {
  unwrap(await supabase.from('transactions').delete().eq('id', id));
}

/** Paid and remaining amount per invoice: [{ counterparty, invoice_no, invoice_amount, paid_amount, remaining_amount }] */
export const listInvoiceBalances = () =>
  fetchAllPages(() =>
    supabase.from('invoice_balances').select('*').order('counterparty').order('invoice_no'),
  );

// ---------------------------------------------------------------- Counterparties

/**
 * Previously used suppliers / people with their contact details, for autocomplete:
 * [{ name, iban, phone }] sorted by name
 */
export async function listCounterparties() {
  const [details, paidNames, plannedNames] = await Promise.all([
    supabase.from('counterparties').select('name, iban, phone').limit(PAGE_SIZE).then(unwrap),
    supabase
      .from('transactions')
      .select('counterparty')
      .not('counterparty', 'is', null)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
      .then(unwrap),
    supabase.from('planned_payments').select('counterparty').limit(PAGE_SIZE).then(unwrap),
  ]);
  const byName = new Map(details.map((row) => [row.name, row]));
  for (const { counterparty } of [...paidNames, ...plannedNames]) {
    if (!byName.has(counterparty)) byName.set(counterparty, { name: counterparty, iban: null, phone: null });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

/** Stores the IBAN / phone of a counterparty (matched by name) */
async function saveCounterpartyDetails({ counterparty, iban, phone }) {
  const name = counterparty?.trim();
  if (!name) return;
  const row = { name, iban: normalizeIban(iban) || null, phone: phone?.trim() || null };
  const { data: existing } = await supabase.from('counterparties').select('id').eq('name', name).maybeSingle();
  // Do not create empty contact cards; existing cards are kept in sync (also when cleared)
  if (!existing && !row.iban && !row.phone) return;
  unwrap(await supabase.from('counterparties').upsert(row, { onConflict: 'name' }));
}

// -------------------------------------------------------------- Planned payments

/** Payments not made yet, earliest due date first */
export const listPendingPlannedPayments = () =>
  fetchAllPages(() =>
    supabase
      .from('planned_payments')
      .select('*')
      .is('transaction_id', null)
      .order('due_date')
      .order('created_at')
      .order('id'),
  );

export async function savePlannedPayment({ id, ...fields }) {
  const row = {
    due_date: fields.dueDate,
    category: fields.category || null,
    counterparty: fields.counterparty.trim(),
    payment_method: fields.paymentMethod,
    amount: fields.amount,
    description: fields.description?.trim() || null,
    ...toInvoiceColumns(fields),
  };
  const query = id
    ? supabase.from('planned_payments').update(row).eq('id', id)
    : supabase.from('planned_payments').insert(row);
  const saved = unwrap(await query.select().single());
  await saveCounterpartyDetails(fields);
  return saved;
}

export async function deletePlannedPayment(id) {
  unwrap(await supabase.from('planned_payments').delete().eq('id', id));
}

/** Marks a pending planned payment as not paid ("Ödenmedi"), or clears the mark */
export async function setPlannedPaymentUnpaid(id, isUnpaid) {
  unwrap(
    await supabase
      .from('planned_payments')
      .update({ marked_unpaid_at: isUnpaid ? new Date().toISOString() : null })
      .eq('id', id),
  );
}

/** Records the planned payment as made on paidOn; returns the created payment transaction */
export async function payPlannedPayment(id, paidOn) {
  return unwrap(await supabase.rpc('pay_planned_payment', { planned_id: id, paid_on: paidOn }));
}

// -------------------------------------------------------------------- Categories

export async function listCategories() {
  return unwrap(await supabase.from('categories').select('*').order('sort_order').order('name'));
}

export async function createCategory({ name, type, groupName }) {
  return unwrap(
    await supabase
      .from('categories')
      .insert({ name: name.trim(), type, group_name: groupName.trim() })
      .select()
      .single(),
  );
}

export async function deleteCategory(id) {
  unwrap(await supabase.from('categories').delete().eq('id', id));
}

// ------------------------------------------------------------ Users and access

/** The signed-in user's access row: { is_admin, is_active, allowed_pages, … } or null */
export async function getMyProfile(userId) {
  return unwrap(await supabase.from('app_users').select('*').eq('user_id', userId).maybeSingle());
}

/** Admin only: every panel user with their last sign-in time */
export async function listAppUsers() {
  return unwrap(await supabase.rpc('admin_list_users'));
}

export async function createAppUser({ email, password, fullName, isAdmin, allowedPages }) {
  return unwrap(
    await supabase.rpc('admin_create_user', {
      new_email: email,
      new_password: password,
      new_full_name: fullName,
      new_is_admin: isAdmin,
      new_allowed_pages: allowedPages,
    }),
  );
}

export async function updateAppUser({ userId, fullName, isAdmin, isActive, allowedPages }) {
  unwrap(
    await supabase.rpc('admin_update_user', {
      target_user_id: userId,
      new_full_name: fullName,
      new_is_admin: isAdmin,
      new_is_active: isActive,
      new_allowed_pages: allowedPages,
    }),
  );
}

export async function setAppUserPassword(userId, password) {
  unwrap(await supabase.rpc('admin_set_user_password', { target_user_id: userId, new_password: password }));
}

/** Changes the signed-in user's password after checking the current one */
export async function changeOwnPassword(email, currentPassword, newPassword) {
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (signInError) throw new Error('Mevcut şifre hatalı.');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error?.code === 'same_password') throw new Error('Yeni şifre mevcut şifreyle aynı olamaz.');
  if (error?.code === 'weak_password') throw new Error('Yeni şifre çok zayıf; daha uzun ve karışık bir şifre seçin.');
  if (error) throw error;
}

// ------------------------------------------------------------- Staff and advances

export async function listEmployees() {
  return unwrap(await supabase.from('employees').select('*').order('full_name'));
}

export async function listEmployeeSalaries() {
  return unwrap(await supabase.from('employee_salaries').select('*').order('valid_from'));
}

/** Advances and salary payments up to endDate (earlier months are needed for the carried-over balance) */
export const listEmployeeEntries = (endDate) =>
  fetchAllPages(() =>
    supabase
      .from('employee_entries')
      .select('*')
      .lte('date', endDate)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id'),
  );

/**
 * Saves an employee; salary (when given) is stored as their net salary from salaryValidFrom
 * (first day of a month) onwards, replacing a salary already set for that month.
 */
export async function saveEmployee({ id, salary, salaryValidFrom, ...fields }) {
  const row = {
    full_name: fields.fullName.trim(),
    position: fields.position?.trim() || null,
    phone: fields.phone?.trim() || null,
    iban: normalizeIban(fields.iban) || null,
    start_date: fields.startDate,
    end_date: fields.endDate || null,
    note: fields.note?.trim() || null,
  };
  const query = id
    ? supabase.from('employees').update(row).eq('id', id)
    : supabase.from('employees').insert(row);
  const saved = unwrap(await query.select().single());
  if (salary !== null && salary !== undefined) {
    unwrap(
      await supabase
        .from('employee_salaries')
        .upsert({ employee_id: saved.id, valid_from: salaryValidFrom, amount: salary }, { onConflict: 'employee_id,valid_from' }),
    );
  }
  return saved;
}

export async function deleteEmployee(id) {
  unwrap(await supabase.from('employees').delete().eq('id', id));
}

export async function saveEmployeeEntry({ id, ...fields }) {
  const row = {
    employee_id: fields.employeeId,
    date: fields.date,
    kind: fields.kind,
    amount: fields.amount,
    payment_method: fields.paymentMethod,
    note: fields.note?.trim() || null,
  };
  const query = id
    ? supabase.from('employee_entries').update(row).eq('id', id)
    : supabase.from('employee_entries').insert(row);
  return unwrap(await query.select().single());
}

export async function deleteEmployeeEntry(id) {
  unwrap(await supabase.from('employee_entries').delete().eq('id', id));
}
