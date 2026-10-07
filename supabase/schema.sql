-- Koordinat Accounting — Supabase schema
-- Run in Supabase: SQL Editor → New query → paste this whole file → Run.
-- Idempotent: safe to run multiple times; existing records are preserved.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- categories: two-level (group_name → name). Expense categories are also used
-- for payments.
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('income', 'expense')),
  group_name text not null default 'Diğer',
  sort_order integer not null default 10000,
  created_at timestamptz not null default now(),
  unique (name, type)
);

-- ---------------------------------------------------------------------------
-- daily_registers: one row per day with cash + card sales.
--   sales_breakdown: optional split by income category, e.g. {"Sıcak Kahveler": 8000}
-- ---------------------------------------------------------------------------
create table if not exists public.daily_registers (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  cash numeric(14, 2) not null default 0 check (cash >= 0),
  card numeric(14, 2) not null default 0 check (card >= 0),
  total numeric(14, 2) generated always as (cash + card) stored,
  sales_breakdown jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- transactions
--   income  → revenue outside the register (wholesale, online platforms, catering…)
--   expense → purchases and costs (cups, milk, electricity…)
--   payment → payments made to a supplier / person (who was paid what)
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  type text not null check (type in ('income', 'expense', 'payment')),
  category text,
  counterparty text,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'card', 'bank_transfer', 'other')),
  amount numeric(14, 2) not null check (amount > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_date_idx on public.transactions (date);
create index if not exists transactions_type_date_idx on public.transactions (type, date);

-- ---------------------------------------------------------------------------
-- planned_payments: payments to be made (who, how much, when).
--   transaction_id is set when the payment is made; it points to the "payment"
--   transaction created for it. Deleting that transaction makes it pending again.
-- ---------------------------------------------------------------------------
create table if not exists public.planned_payments (
  id uuid primary key default gen_random_uuid(),
  due_date date not null,
  category text,
  counterparty text not null,
  payment_method text not null default 'bank_transfer'
    check (payment_method in ('cash', 'card', 'bank_transfer', 'other')),
  amount numeric(14, 2) not null check (amount > 0),
  description text,
  transaction_id uuid unique references public.transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planned_payments_due_date_idx on public.planned_payments (due_date);

-- ---------------------------------------------------------------------------
-- Invoice details on payments. A payment can cover an invoice partly:
--   invoice_amount is the invoice total; the remaining debt of an invoice is
--   invoice_amount − sum of the payments with the same counterparty + invoice_no.
-- ---------------------------------------------------------------------------
alter table public.transactions add column if not exists invoice_no text;
alter table public.transactions add column if not exists invoice_amount numeric(14, 2);
alter table public.planned_payments add column if not exists invoice_no text;
alter table public.planned_payments add column if not exists invoice_amount numeric(14, 2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_invoice_amount_check') then
    alter table public.transactions
      add constraint transactions_invoice_amount_check check (invoice_amount > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'planned_payments_invoice_amount_check') then
    alter table public.planned_payments
      add constraint planned_payments_invoice_amount_check check (invoice_amount > 0);
  end if;
end;
$$;

create index if not exists transactions_invoice_idx on public.transactions (counterparty, invoice_no)
  where invoice_no is not null;

-- invoice_balances: paid and remaining amount of each invoice (made payments only)
create or replace view public.invoice_balances with (security_invoker = true) as
select counterparty,
       invoice_no,
       max(invoice_amount) as invoice_amount,
       sum(amount) as paid_amount,
       max(invoice_amount) - sum(amount) as remaining_amount,
       max(date) as last_payment_date
from public.transactions
where type = 'payment' and counterparty is not null and invoice_no is not null
group by counterparty, invoice_no;

-- ---------------------------------------------------------------------------
-- counterparties: contact details of the suppliers / people that are paid.
-- Matched to payments by name (transactions.counterparty, planned_payments.counterparty).
-- ---------------------------------------------------------------------------
create table if not exists public.counterparties (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  iban text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Staff, salaries and advances
--   employees         → staff; salary is earned from start_date until end_date
--   employee_salaries → monthly net salary history; a row applies from valid_from
--                       (first day of a month) until the next row
--   employee_entries  → money given to staff: advance or salary payment. Each entry
--                       is mirrored as a "payment" transaction (see the sync trigger),
--                       so it shows up in made payments and reports.
-- Month-end balance = carried over + salary earned − advances − salary payments
--   > 0 → the employee is owed money, < 0 → the employee owes the business
-- ---------------------------------------------------------------------------
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null unique,
  position text,
  phone text,
  iban text,
  start_date date not null default current_date,
  end_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table if not exists public.employee_salaries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  valid_from date not null check (extract(day from valid_from) = 1),
  amount numeric(14, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (employee_id, valid_from)
);

create table if not exists public.employee_entries (
  id uuid primary key default gen_random_uuid(),
  -- restrict: an employee with entries cannot be deleted (set end_date instead)
  employee_id uuid not null references public.employees (id) on delete restrict,
  date date not null default current_date,
  kind text not null check (kind in ('advance', 'salary_payment')),
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'card', 'bank_transfer', 'other')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_entries_employee_date_idx on public.employee_entries (employee_id, date);

-- The payment transaction mirroring an employee entry (deleted together with it)
alter table public.transactions
  add column if not exists employee_entry_id uuid unique references public.employee_entries (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists daily_registers_set_updated_at on public.daily_registers;
create trigger daily_registers_set_updated_at before update on public.daily_registers
  for each row execute function public.set_updated_at();

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

drop trigger if exists planned_payments_set_updated_at on public.planned_payments;
create trigger planned_payments_set_updated_at before update on public.planned_payments
  for each row execute function public.set_updated_at();

drop trigger if exists counterparties_set_updated_at on public.counterparties;
create trigger counterparties_set_updated_at before update on public.counterparties
  for each row execute function public.set_updated_at();

drop trigger if exists employees_set_updated_at on public.employees;
create trigger employees_set_updated_at before update on public.employees
  for each row execute function public.set_updated_at();

drop trigger if exists employee_entries_set_updated_at on public.employee_entries;
create trigger employee_entries_set_updated_at before update on public.employee_entries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- app_users: who may use the panel and which pages they can open.
--   is_admin      → every page + user management
--   is_active     → false blocks sign-in (auth.users.banned_until) and all data access
--   allowed_pages → page keys (see PAGE_PERMISSIONS in src/config/navigation.js)
-- Users are created and changed only through the admin_* functions below.
-- ---------------------------------------------------------------------------
create table if not exists public.app_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  allowed_pages text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at before update on public.app_users
  for each row execute function public.set_updated_at();

create or replace function public.all_page_keys()
returns text[] language sql immutable as $$
  select array['dashboard', 'daily-register', 'payments', 'planned-payments', 'employees', 'reports', 'categories'];
$$;

-- Permission helpers used by row level security (security definer: they read app_users
-- regardless of its own policies)
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_users where user_id = auth.uid() and is_active);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_users where user_id = auth.uid() and is_active and is_admin);
$$;

create or replace function public.has_page_access(page text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_users
    where user_id = auth.uid() and is_active and (is_admin or page = any (allowed_pages))
  );
$$;

-- Existing accounts keep full access: on the first run every existing user becomes an admin
insert into public.app_users (user_id, email, is_admin, is_active, allowed_pages)
select id, coalesce(email, ''), true, true, public.all_page_keys()
from auth.users
where not exists (select 1 from public.app_users);

-- Accounts created outside the panel (e.g. Supabase dashboard) start inactive without pages,
-- except the very first account, which becomes the admin
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  is_first boolean := not exists (select 1 from public.app_users where is_admin and is_active);
begin
  insert into public.app_users (user_id, email, is_admin, is_active, allowed_pages)
  values (new.id, coalesce(new.email, ''), is_first, is_first,
          case when is_first then public.all_page_keys() else '{}' end)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ------------------------------------------------------------ admin functions

create or replace function public.assert_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Bu işlem için yönetici yetkisi gerekir.';
  end if;
end;
$$;

create or replace function public.assert_valid_password(password text)
returns void language plpgsql immutable as $$
begin
  if length(coalesce(password, '')) < 8 then
    raise exception 'Şifre en az 8 karakter olmalı.';
  end if;
end;
$$;

create or replace function public.clean_page_keys(pages text[])
returns text[] language sql immutable as $$
  select coalesce(array_agg(page order by page), '{}')
  from (select distinct unnest(pages) as page) requested
  where page = any (public.all_page_keys());
$$;

create or replace function public.admin_list_users()
returns table (
  user_id uuid, email text, full_name text, is_admin boolean, is_active boolean,
  allowed_pages text[], created_at timestamptz, last_sign_in_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
    select u.user_id, u.email, u.full_name, u.is_admin, u.is_active, u.allowed_pages, u.created_at,
           a.last_sign_in_at
    from public.app_users u
    left join auth.users a on a.id = u.user_id
    order by u.is_admin desc, u.is_active desc, lower(u.email);
end;
$$;

create or replace function public.admin_create_user(
  new_email text, new_password text, new_full_name text, new_is_admin boolean, new_allowed_pages text[]
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid := gen_random_uuid();
  normalized_email text := lower(trim(new_email));
begin
  perform public.assert_admin();
  if normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Geçerli bir e-posta adresi girin.';
  end if;
  perform public.assert_valid_password(new_password);
  if exists (select 1 from auth.users where lower(email) = normalized_email) then
    raise exception 'Bu e-posta ile kayıtlı bir kullanıcı zaten var.';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated', normalized_email,
    extensions.crypt(new_password, extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('full_name', nullif(trim(new_full_name), '')), now(), now(),
    '', '', '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), new_id, new_id::text,
    jsonb_build_object('sub', new_id::text, 'email', normalized_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.app_users (user_id, email, full_name, is_admin, is_active, allowed_pages)
  values (new_id, normalized_email, nullif(trim(new_full_name), ''), new_is_admin, true,
          public.clean_page_keys(new_allowed_pages))
  on conflict (user_id) do update
    set full_name = excluded.full_name, is_admin = excluded.is_admin, is_active = true,
        allowed_pages = excluded.allowed_pages;

  return new_id;
end;
$$;

create or replace function public.admin_update_user(
  target_user_id uuid, new_full_name text, new_is_admin boolean, new_is_active boolean, new_allowed_pages text[]
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  if target_user_id = auth.uid() and (not new_is_active or not new_is_admin) then
    raise exception 'Kendi hesabınızı pasif yapamaz veya yönetici yetkinizi kaldıramazsınız.';
  end if;

  update public.app_users
  set full_name = nullif(trim(new_full_name), ''),
      is_admin = new_is_admin,
      is_active = new_is_active,
      allowed_pages = public.clean_page_keys(new_allowed_pages)
  where user_id = target_user_id;
  if not found then
    raise exception 'Kullanıcı bulunamadı.';
  end if;

  -- Inactive accounts cannot sign in, and their open sessions are ended
  update auth.users
  set banned_until = case when new_is_active then null else now() + interval '100 years' end,
      updated_at = now()
  where id = target_user_id;
  if not new_is_active then
    delete from auth.sessions where user_id = target_user_id;
  end if;
end;
$$;

create or replace function public.admin_set_user_password(target_user_id uuid, new_password text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  perform public.assert_valid_password(new_password);
  update auth.users
  set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')), updated_at = now()
  where id = target_user_id;
  if not found then
    raise exception 'Kullanıcı bulunamadı.';
  end if;
end;
$$;

-- Only signed-in users may call these; each function checks the caller's rights itself
revoke execute on function
  public.admin_list_users(), public.admin_create_user(text, text, text, boolean, text[]),
  public.admin_update_user(uuid, text, boolean, boolean, text[]), public.admin_set_user_password(uuid, text),
  public.handle_new_auth_user()
from public, anon;
grant execute on function
  public.admin_list_users(), public.admin_create_user(text, text, text, boolean, text[]),
  public.admin_update_user(uuid, text, boolean, boolean, text[]), public.admin_set_user_password(uuid, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- pay_planned_payment: records a planned payment as a made payment in one step
-- (creates the "payment" transaction and links it). Allowed with access to the
-- planned payments page, without needing write access to made payments.
-- ---------------------------------------------------------------------------
create or replace function public.pay_planned_payment(planned_id uuid, paid_on date)
returns public.transactions
language plpgsql security definer set search_path = '' as $$
declare
  planned public.planned_payments;
  payment public.transactions;
begin
  if not public.has_page_access('planned-payments') then
    raise exception 'Bu işlem için "Yapılacak Ödemeler" yetkisi gerekir.';
  end if;

  select * into planned from public.planned_payments where id = planned_id for update;
  if not found then
    raise exception 'Yapılacak ödeme bulunamadı.';
  end if;
  if planned.transaction_id is not null then
    raise exception 'Bu ödeme zaten yapılmış.';
  end if;

  insert into public.transactions
    (date, type, category, counterparty, payment_method, amount, description, invoice_no, invoice_amount)
  values (paid_on, 'payment', planned.category, planned.counterparty, planned.payment_method,
          planned.amount, planned.description, planned.invoice_no, planned.invoice_amount)
  returning * into payment;

  update public.planned_payments set transaction_id = payment.id where id = planned_id;
  return payment;
end;
$$;

revoke execute on function public.pay_planned_payment(uuid, date) from public, anon;
grant execute on function public.pay_planned_payment(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Employee entries → payment transactions (category "Avans" / "Net Maaşlar").
-- Security definer: staff page users need no write access to made payments.
-- ---------------------------------------------------------------------------
create or replace function public.sync_employee_entry_transaction()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  employee_name text;
  category_name text := case new.kind when 'advance' then 'Avans' else 'Net Maaşlar' end;
  default_description text := case new.kind when 'advance' then 'Personel avansı' else 'Maaş ödemesi' end;
begin
  select full_name into employee_name from public.employees where id = new.employee_id;

  if tg_op = 'INSERT' then
    insert into public.transactions
      (date, type, category, counterparty, payment_method, amount, description, employee_entry_id)
    values (new.date, 'payment', category_name, employee_name, new.payment_method, new.amount,
            coalesce(nullif(trim(new.note), ''), default_description), new.id);
  else
    update public.transactions
    set date = new.date, category = category_name, counterparty = employee_name,
        payment_method = new.payment_method, amount = new.amount,
        description = coalesce(nullif(trim(new.note), ''), default_description)
    where employee_entry_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists employee_entries_sync_transaction on public.employee_entries;
create trigger employee_entries_sync_transaction after insert or update on public.employee_entries
  for each row execute function public.sync_employee_entry_transaction();

-- Renaming an employee renames the counterparty of their mirrored payments
create or replace function public.sync_employee_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.transactions t
  set counterparty = new.full_name
  from public.employee_entries e
  where e.employee_id = new.id and t.employee_entry_id = e.id;
  return new;
end;
$$;

drop trigger if exists employees_sync_name on public.employees;
create trigger employees_sync_name after update of full_name on public.employees
  for each row execute function public.sync_employee_name();

-- Mirrored payments are changed only through their employee entry
-- (depth 1 = a direct statement; the sync trigger and the cascade delete run deeper)
create or replace function public.protect_employee_transactions()
returns trigger language plpgsql as $$
begin
  if old.employee_entry_id is not null and pg_trigger_depth() = 1 then
    raise exception 'Bu ödeme "Personel Avansları" sayfasından yönetilir.';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

drop trigger if exists transactions_protect_employee_entries on public.transactions;
create trigger transactions_protect_employee_entries before update or delete on public.transactions
  for each row execute function public.protect_employee_transactions();

revoke execute on function public.sync_employee_entry_transaction(), public.sync_employee_name() from public, anon;

-- ---------------------------------------------------------------------------
-- Row level security
--   read  → any active user (the dashboard and reports combine all tables);
--           staff data only with access to the staff page
--   write → users with access to the page where that data is entered
-- ---------------------------------------------------------------------------
alter table public.app_users enable row level security;
drop policy if exists "own_row_or_admin_read" on public.app_users;
create policy "own_row_or_admin_read" on public.app_users
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

do $$
declare
  rule record;
begin
  for rule in
    select * from (values
      ('categories', 'public.is_active_user()', $c$public.has_page_access('categories')$c$),
      ('daily_registers', 'public.is_active_user()', $c$public.has_page_access('daily-register')$c$),
      ('transactions', 'public.is_active_user()', $c$public.has_page_access('payments')$c$),
      ('planned_payments', 'public.is_active_user()', $c$public.has_page_access('planned-payments')$c$),
      ('counterparties', 'public.is_active_user()',
       $c$public.has_page_access('payments') or public.has_page_access('planned-payments')$c$),
      ('employees', $c$public.has_page_access('employees')$c$, $c$public.has_page_access('employees')$c$),
      ('employee_salaries', $c$public.has_page_access('employees')$c$, $c$public.has_page_access('employees')$c$),
      ('employee_entries', $c$public.has_page_access('employees')$c$, $c$public.has_page_access('employees')$c$)
    ) as rules (table_name, read_check, write_check)
  loop
    execute format('alter table public.%I enable row level security', rule.table_name);
    execute format('drop policy if exists "authenticated_full_access" on public.%I', rule.table_name);
    execute format('drop policy if exists "active_users_read" on public.%I', rule.table_name);
    execute format('drop policy if exists "read_access" on public.%I', rule.table_name);
    execute format(
      'create policy "read_access" on public.%I for select to authenticated using (%s)',
      rule.table_name, rule.read_check);
    execute format('drop policy if exists "page_access_write" on public.%I', rule.table_name);
    execute format(
      'create policy "page_access_write" on public.%I for all to authenticated using (%s) with check (%s)',
      rule.table_name, rule.write_check, rule.write_check);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Legacy migration: copies data from the first (Turkish-named) schema
-- (kasa_gunluk, hareketler, kategoriler) into the new tables, then drops them.
-- Does nothing if the legacy tables do not exist.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.kasa_gunluk') is not null then
    insert into public.daily_registers (date, cash, card, sales_breakdown, note, created_at, updated_at)
    select (j ->> 'tarih')::date,
           (j ->> 'nakit')::numeric,
           (j ->> 'kredi_karti')::numeric,
           coalesce(j -> 'dagilim', '{}'::jsonb),
           j ->> 'aciklama',
           (j ->> 'created_at')::timestamptz,
           (j ->> 'updated_at')::timestamptz
    from (select to_jsonb(k) as j from public.kasa_gunluk k) legacy
    on conflict (date) do nothing;
    drop table public.kasa_gunluk;
  end if;

  if to_regclass('public.hareketler') is not null then
    insert into public.transactions
      (id, date, type, category, counterparty, payment_method, amount, description, created_at, updated_at)
    select h.id, h.tarih,
           case h.tur when 'gelir' then 'income' when 'gider' then 'expense' else 'payment' end,
           h.kategori, h.cari,
           case h.odeme_yontemi when 'nakit' then 'cash' when 'kredi_karti' then 'card'
                                when 'havale' then 'bank_transfer' else 'other' end,
           h.tutar, h.aciklama, h.created_at, h.updated_at
    from public.hareketler h
    on conflict (id) do nothing;
    drop table public.hareketler;
  end if;

  if to_regclass('public.kategoriler') is not null then
    -- Only user-defined categories are carried over; defaults are seeded below.
    insert into public.categories (name, type, group_name)
    select j ->> 'ad',
           case j ->> 'tur' when 'gelir' then 'income' else 'expense' end,
           coalesce(j ->> 'grup', 'Diğer')
    from (select to_jsonb(k) as j from public.kategoriler k) legacy
    where (j ->> 'ad') not in (
      'Toptan Satış', 'Online Satış', 'Kahve Çekirdeği / Hammadde', 'Ambalaj / Bardak / Peçete',
      'Gıda / Tatlı / Yan Ürün', 'Elektrik / Su / Doğalgaz', 'İnternet / Telefon', 'Personel Maaş',
      'Vergi / SGK', 'Bakım / Onarım', 'Temizlik', 'Reklam / Pazarlama'
    )
    on conflict (name, type) do nothing;
    drop table public.kategoriler;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Default categories: [name, type, group_name] — array order becomes sort_order.
-- Names and groups are user-facing labels (Turkish).
-- ---------------------------------------------------------------------------
insert into public.categories (name, type, group_name, sort_order)
select item ->> 0, item ->> 1, item ->> 2, (position * 10)::int
from jsonb_array_elements($seed$[
  ["Sıcak Kahveler", "income", "Kafe Satışları"],
  ["Soğuk Kahveler", "income", "Kafe Satışları"],
  ["Soğuk İçecekler (Limonata, Frozen, Smoothie)", "income", "Kafe Satışları"],
  ["Çay ve Diğer Sıcak İçecekler", "income", "Kafe Satışları"],
  ["Tatlı ve Pasta", "income", "Kafe Satışları"],
  ["Kurabiye ve Atıştırmalık", "income", "Kafe Satışları"],
  ["Yiyecek (Sandviç, Tost, Kahvaltı)", "income", "Kafe Satışları"],
  ["Şişe Su ve Meşrubat", "income", "Kafe Satışları"],

  ["Paket Kahve / Çekirdek", "income", "Perakende Satış"],
  ["Demleme Ekipmanı ve Aksesuar", "income", "Perakende Satış"],
  ["Kupa, Termos ve Hediyelik", "income", "Perakende Satış"],

  ["Online Sipariş Platformları", "income", "Kanal ve Kurumsal Satış"],
  ["Toptan Kahve Satışı", "income", "Kanal ve Kurumsal Satış"],
  ["Kurumsal / Ofis Satışları", "income", "Kanal ve Kurumsal Satış"],
  ["Etkinlik ve Catering", "income", "Kanal ve Kurumsal Satış"],
  ["Barista Eğitimi / Atölye", "income", "Kanal ve Kurumsal Satış"],

  ["Bahşiş", "income", "Diğer Gelirler"],
  ["Faiz ve Finansal Gelir", "income", "Diğer Gelirler"],
  ["Demirbaş Satışı", "income", "Diğer Gelirler"],
  ["Diğer Gelir", "income", "Diğer Gelirler"],

  ["Kahve Çekirdeği", "expense", "Ürün Maliyeti (Hammadde)"],
  ["Süt ve Süt Ürünleri", "expense", "Ürün Maliyeti (Hammadde)"],
  ["Bitki Bazlı Sütler", "expense", "Ürün Maliyeti (Hammadde)"],
  ["Şurup ve Sos", "expense", "Ürün Maliyeti (Hammadde)"],
  ["Toz İçecekler (Çikolata, Matcha, Frappe)", "expense", "Ürün Maliyeti (Hammadde)"],
  ["Çay ve Bitki Çayları", "expense", "Ürün Maliyeti (Hammadde)"],
  ["Meyve, Püre ve Konsantre", "expense", "Ürün Maliyeti (Hammadde)"],
  ["Buz", "expense", "Ürün Maliyeti (Hammadde)"],
  ["Şişe Su ve Meşrubat Alımı", "expense", "Ürün Maliyeti (Hammadde)"],
  ["Tatlı ve Pasta Alımı", "expense", "Ürün Maliyeti (Hammadde)"],
  ["Yiyecek Hammaddesi", "expense", "Ürün Maliyeti (Hammadde)"],
  ["Şeker ve Tatlandırıcı", "expense", "Ürün Maliyeti (Hammadde)"],
  ["Perakende Ürün Alımı", "expense", "Ürün Maliyeti (Hammadde)"],

  ["Karton Bardak (Sıcak)", "expense", "Ambalaj ve Sarf Malzeme"],
  ["Plastik / PET Bardak (Soğuk)", "expense", "Ambalaj ve Sarf Malzeme"],
  ["Bardak Kapağı", "expense", "Ambalaj ve Sarf Malzeme"],
  ["Pipet", "expense", "Ambalaj ve Sarf Malzeme"],
  ["Peçete", "expense", "Ambalaj ve Sarf Malzeme"],
  ["Karıştırıcı ve Şeker Stick", "expense", "Ambalaj ve Sarf Malzeme"],
  ["Bardak Taşıyıcı ve Manşon", "expense", "Ambalaj ve Sarf Malzeme"],
  ["Paket Servis Poşeti ve Kutu", "expense", "Ambalaj ve Sarf Malzeme"],
  ["Kahve Paketleme Ambalajı", "expense", "Ambalaj ve Sarf Malzeme"],
  ["Etiket ve Sticker", "expense", "Ambalaj ve Sarf Malzeme"],
  ["Rulo, Streç ve Folyo", "expense", "Ambalaj ve Sarf Malzeme"],

  ["Net Maaşlar", "expense", "Personel"],
  ["SGK Primleri", "expense", "Personel"],
  ["Avans", "expense", "Personel"],
  ["Prim ve İkramiye", "expense", "Personel"],
  ["Fazla Mesai", "expense", "Personel"],
  ["Personel Yemek", "expense", "Personel"],
  ["Personel Yol", "expense", "Personel"],
  ["İş Kıyafeti ve Önlük", "expense", "Personel"],
  ["Kıdem / İhbar Tazminatı", "expense", "Personel"],
  ["Personel Eğitimi", "expense", "Personel"],

  ["Kira", "expense", "Kira ve Mekân"],
  ["Aidat", "expense", "Kira ve Mekân"],
  ["İşyeri Sigortası", "expense", "Kira ve Mekân"],
  ["Güvenlik ve Alarm", "expense", "Kira ve Mekân"],
  ["Dekorasyon ve Tadilat", "expense", "Kira ve Mekân"],

  ["Elektrik", "expense", "Faturalar"],
  ["Su", "expense", "Faturalar"],
  ["Doğalgaz", "expense", "Faturalar"],
  ["İnternet", "expense", "Faturalar"],
  ["Telefon / GSM", "expense", "Faturalar"],

  ["KDV", "expense", "Vergi, Resmi ve Muhasebe"],
  ["Gelir / Kurumlar Vergisi", "expense", "Vergi, Resmi ve Muhasebe"],
  ["Muhtasar ve Stopaj", "expense", "Vergi, Resmi ve Muhasebe"],
  ["Damga Vergisi", "expense", "Vergi, Resmi ve Muhasebe"],
  ["Belediye Harç ve Ruhsat", "expense", "Vergi, Resmi ve Muhasebe"],
  ["Mali Müşavir", "expense", "Vergi, Resmi ve Muhasebe"],
  ["Noter ve Resmi Giderler", "expense", "Vergi, Resmi ve Muhasebe"],
  ["Vergi / Trafik Cezası", "expense", "Vergi, Resmi ve Muhasebe"],

  ["Espresso Makinesi Bakım", "expense", "Bakım, Onarım ve Ekipman"],
  ["Değirmen Bakım", "expense", "Bakım, Onarım ve Ekipman"],
  ["Su Arıtma Filtresi", "expense", "Bakım, Onarım ve Ekipman"],
  ["Soğutucu ve Buzdolabı Bakım", "expense", "Bakım, Onarım ve Ekipman"],
  ["Tamirat", "expense", "Bakım, Onarım ve Ekipman"],
  ["Küçük Ekipman ve Mutfak Gereci", "expense", "Bakım, Onarım ve Ekipman"],
  ["Demirbaş / Makine Alımı", "expense", "Bakım, Onarım ve Ekipman"],

  ["Temizlik Malzemesi", "expense", "Temizlik ve Hijyen"],
  ["Makine Temizlik Kimyasalı", "expense", "Temizlik ve Hijyen"],
  ["İlaçlama", "expense", "Temizlik ve Hijyen"],
  ["Çöp ve Atık", "expense", "Temizlik ve Hijyen"],
  ["Bez, Eldiven ve Hijyen Ürünleri", "expense", "Temizlik ve Hijyen"],

  ["Sosyal Medya Reklamı", "expense", "Pazarlama ve Reklam"],
  ["Menü ve Basılı Materyal", "expense", "Pazarlama ve Reklam"],
  ["Promosyon ve İkram", "expense", "Pazarlama ve Reklam"],
  ["Fotoğraf ve Tasarım", "expense", "Pazarlama ve Reklam"],
  ["Tabela ve Reklam Malzemesi", "expense", "Pazarlama ve Reklam"],

  ["POS / Banka Komisyonu", "expense", "Finansal Giderler ve Komisyonlar"],
  ["Online Platform Komisyonu", "expense", "Finansal Giderler ve Komisyonlar"],
  ["Yemek Kartı Komisyonu", "expense", "Finansal Giderler ve Komisyonlar"],
  ["Kredi Taksiti", "expense", "Finansal Giderler ve Komisyonlar"],
  ["Kredi / Kart Faizi", "expense", "Finansal Giderler ve Komisyonlar"],
  ["Banka Masrafları", "expense", "Finansal Giderler ve Komisyonlar"],

  ["Kargo", "expense", "Lojistik ve Ulaşım"],
  ["Kurye", "expense", "Lojistik ve Ulaşım"],
  ["Yakıt", "expense", "Lojistik ve Ulaşım"],
  ["Araç Bakım ve Sigorta", "expense", "Lojistik ve Ulaşım"],
  ["Otopark ve Köprü / Otoyol", "expense", "Lojistik ve Ulaşım"],

  ["POS / Adisyon Yazılımı", "expense", "Yazılım ve Abonelikler"],
  ["Müzik Lisansı", "expense", "Yazılım ve Abonelikler"],
  ["Web Sitesi ve Alan Adı", "expense", "Yazılım ve Abonelikler"],
  ["Diğer Abonelikler", "expense", "Yazılım ve Abonelikler"],

  ["Kırtasiye ve Ofis", "expense", "Diğer Giderler"],
  ["Bağış ve Yardım", "expense", "Diğer Giderler"],
  ["Diğer Gider", "expense", "Diğer Giderler"]
]$seed$::jsonb) with ordinality as seed(item, position)
on conflict (name, type) do update
  set group_name = excluded.group_name, sort_order = excluded.sort_order;
