-- Koordinat Accounting — Supabase schema
-- Run in Supabase: SQL Editor → New query → paste this whole file → Run.
-- Idempotent: safe to run multiple times; existing records are preserved.

create extension if not exists pgcrypto;

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

-- ---------------------------------------------------------------------------
-- pay_planned_payment: records a planned payment as a made payment in one step
-- (creates the "payment" transaction and links it).
-- ---------------------------------------------------------------------------
create or replace function public.pay_planned_payment(planned_id uuid, paid_on date)
returns public.transactions
language plpgsql as $$
declare
  planned public.planned_payments;
  payment public.transactions;
begin
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

-- ---------------------------------------------------------------------------
-- Row level security: only signed-in users can read and write
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.daily_registers enable row level security;
alter table public.transactions enable row level security;
alter table public.planned_payments enable row level security;
alter table public.counterparties enable row level security;

drop policy if exists "authenticated_full_access" on public.categories;
create policy "authenticated_full_access" on public.categories
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_access" on public.daily_registers;
create policy "authenticated_full_access" on public.daily_registers
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_access" on public.transactions;
create policy "authenticated_full_access" on public.transactions
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_access" on public.planned_payments;
create policy "authenticated_full_access" on public.planned_payments
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_full_access" on public.counterparties;
create policy "authenticated_full_access" on public.counterparties
  for all to authenticated using (true) with check (true);

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
