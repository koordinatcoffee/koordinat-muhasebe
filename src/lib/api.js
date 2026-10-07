import { supabase } from './supabaseClient';

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

export async function saveTransaction({ id, ...fields }) {
  const row = {
    date: fields.date,
    type: fields.type,
    category: fields.category || null,
    counterparty: fields.counterparty?.trim() || null,
    payment_method: fields.paymentMethod,
    amount: fields.amount,
    description: fields.description?.trim() || null,
  };
  const query = id
    ? supabase.from('transactions').update(row).eq('id', id)
    : supabase.from('transactions').insert(row);
  return unwrap(await query.select().single());
}

export async function deleteTransaction(id) {
  unwrap(await supabase.from('transactions').delete().eq('id', id));
}

/** Previously used supplier / person names, for autocomplete */
export async function listCounterparties() {
  const rows = unwrap(
    await supabase
      .from('transactions')
      .select('counterparty')
      .not('counterparty', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000),
  );
  return [...new Set(rows.map((row) => row.counterparty))].sort((a, b) => a.localeCompare(b, 'tr'));
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
