-- Koordinat Muhasebe - Supabase şeması
-- Supabase panelinde: SQL Editor → New query → bu dosyanın tamamını yapıştırıp "Run".
-- Tekrar çalıştırılabilir (idempotent); mevcut kayıtlar silinmez.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Kategoriler: ana grup → alt kalem
-- (gider kategorileri ödemeler için de kullanılır)
-- ---------------------------------------------------------------
create table if not exists public.kategoriler (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  tur text not null check (tur in ('gelir', 'gider')),
  grup text not null default 'Diğer',
  sira integer not null default 10000,
  created_at timestamptz not null default now(),
  unique (ad, tur)
);

-- Eski kurulumlar için sütun ekleme
alter table public.kategoriler add column if not exists grup text not null default 'Diğer';
alter table public.kategoriler add column if not exists sira integer not null default 10000;

-- ---------------------------------------------------------------
-- Günlük kasa: her gün için tek satır (nakit + kredi kartı satış)
--   dagilim: isteğe bağlı ürün grubu dağılımı {"Sıcak Kahveler": 8000, ...}
-- ---------------------------------------------------------------
create table if not exists public.kasa_gunluk (
  id uuid primary key default gen_random_uuid(),
  tarih date not null unique,
  nakit numeric(14, 2) not null default 0 check (nakit >= 0),
  kredi_karti numeric(14, 2) not null default 0 check (kredi_karti >= 0),
  toplam numeric(14, 2) generated always as (nakit + kredi_karti) stored,
  dagilim jsonb not null default '{}'::jsonb,
  aciklama text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kasa_gunluk add column if not exists dagilim jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------
-- Hareketler: gelir, gider ve yapılan ödemeler
--   gelir  → kasa dışı gelirler (toptan satış, online platform, catering…)
--   gider  → harcamalar (bardak, süt, elektrik…)
--   odeme  → bir firmaya / kişiye yapılan ödemeler (kime ne ödendi)
-- ---------------------------------------------------------------
create table if not exists public.hareketler (
  id uuid primary key default gen_random_uuid(),
  tarih date not null default current_date,
  tur text not null check (tur in ('gelir', 'gider', 'odeme')),
  kategori text,
  cari text,
  odeme_yontemi text not null default 'nakit'
    check (odeme_yontemi in ('nakit', 'kredi_karti', 'havale', 'diger')),
  tutar numeric(14, 2) not null check (tutar > 0),
  aciklama text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hareketler_tarih_idx on public.hareketler (tarih);
create index if not exists hareketler_tur_tarih_idx on public.hareketler (tur, tarih);

-- ---------------------------------------------------------------
-- updated_at otomatik güncelleme
-- ---------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kasa_gunluk_updated_at on public.kasa_gunluk;
create trigger kasa_gunluk_updated_at before update on public.kasa_gunluk
  for each row execute function public.set_updated_at();

drop trigger if exists hareketler_updated_at on public.hareketler;
create trigger hareketler_updated_at before update on public.hareketler
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Güvenlik: yalnızca giriş yapmış kullanıcılar okuyup yazabilir
-- ---------------------------------------------------------------
alter table public.kategoriler enable row level security;
alter table public.kasa_gunluk enable row level security;
alter table public.hareketler enable row level security;

drop policy if exists "giris_yapanlar_tam_erisim" on public.kategoriler;
create policy "giris_yapanlar_tam_erisim" on public.kategoriler
  for all to authenticated using (true) with check (true);

drop policy if exists "giris_yapanlar_tam_erisim" on public.kasa_gunluk;
create policy "giris_yapanlar_tam_erisim" on public.kasa_gunluk
  for all to authenticated using (true) with check (true);

drop policy if exists "giris_yapanlar_tam_erisim" on public.hareketler;
create policy "giris_yapanlar_tam_erisim" on public.hareketler
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------
-- İlk sürümün varsayılan kategorilerini kaldır (yerlerine detaylı liste geliyor).
-- Geçmiş kayıtlardaki kategori adları korunur, raporlarda "Diğer" grubunda görünür.
-- ---------------------------------------------------------------
delete from public.kategoriler where (ad, tur) in (
  ('Toptan Satış', 'gelir'), ('Online Satış', 'gelir'),
  ('Kahve Çekirdeği / Hammadde', 'gider'), ('Ambalaj / Bardak / Peçete', 'gider'),
  ('Gıda / Tatlı / Yan Ürün', 'gider'), ('Elektrik / Su / Doğalgaz', 'gider'),
  ('İnternet / Telefon', 'gider'), ('Personel Maaş', 'gider'), ('Vergi / SGK', 'gider'),
  ('Bakım / Onarım', 'gider'), ('Temizlik', 'gider'), ('Reklam / Pazarlama', 'gider')
);

-- ---------------------------------------------------------------
-- Varsayılan kategoriler: [alt kalem, tür, ana grup] — sıra korunur
-- ---------------------------------------------------------------
insert into public.kategoriler (ad, tur, grup, sira)
select e ->> 0, e ->> 1, e ->> 2, (ord * 10)::int
from jsonb_array_elements($json$[
  ["Sıcak Kahveler", "gelir", "Kafe Satışları"],
  ["Soğuk Kahveler", "gelir", "Kafe Satışları"],
  ["Soğuk İçecekler (Limonata, Frozen, Smoothie)", "gelir", "Kafe Satışları"],
  ["Çay ve Diğer Sıcak İçecekler", "gelir", "Kafe Satışları"],
  ["Tatlı ve Pasta", "gelir", "Kafe Satışları"],
  ["Kurabiye ve Atıştırmalık", "gelir", "Kafe Satışları"],
  ["Yiyecek (Sandviç, Tost, Kahvaltı)", "gelir", "Kafe Satışları"],
  ["Şişe Su ve Meşrubat", "gelir", "Kafe Satışları"],

  ["Paket Kahve / Çekirdek", "gelir", "Perakende Satış"],
  ["Demleme Ekipmanı ve Aksesuar", "gelir", "Perakende Satış"],
  ["Kupa, Termos ve Hediyelik", "gelir", "Perakende Satış"],

  ["Online Sipariş Platformları", "gelir", "Kanal ve Kurumsal Satış"],
  ["Toptan Kahve Satışı", "gelir", "Kanal ve Kurumsal Satış"],
  ["Kurumsal / Ofis Satışları", "gelir", "Kanal ve Kurumsal Satış"],
  ["Etkinlik ve Catering", "gelir", "Kanal ve Kurumsal Satış"],
  ["Barista Eğitimi / Atölye", "gelir", "Kanal ve Kurumsal Satış"],

  ["Bahşiş", "gelir", "Diğer Gelirler"],
  ["Faiz ve Finansal Gelir", "gelir", "Diğer Gelirler"],
  ["Demirbaş Satışı", "gelir", "Diğer Gelirler"],
  ["Diğer Gelir", "gelir", "Diğer Gelirler"],

  ["Kahve Çekirdeği", "gider", "Ürün Maliyeti (Hammadde)"],
  ["Süt ve Süt Ürünleri", "gider", "Ürün Maliyeti (Hammadde)"],
  ["Bitki Bazlı Sütler", "gider", "Ürün Maliyeti (Hammadde)"],
  ["Şurup ve Sos", "gider", "Ürün Maliyeti (Hammadde)"],
  ["Toz İçecekler (Çikolata, Matcha, Frappe)", "gider", "Ürün Maliyeti (Hammadde)"],
  ["Çay ve Bitki Çayları", "gider", "Ürün Maliyeti (Hammadde)"],
  ["Meyve, Püre ve Konsantre", "gider", "Ürün Maliyeti (Hammadde)"],
  ["Buz", "gider", "Ürün Maliyeti (Hammadde)"],
  ["Şişe Su ve Meşrubat Alımı", "gider", "Ürün Maliyeti (Hammadde)"],
  ["Tatlı ve Pasta Alımı", "gider", "Ürün Maliyeti (Hammadde)"],
  ["Yiyecek Hammaddesi", "gider", "Ürün Maliyeti (Hammadde)"],
  ["Şeker ve Tatlandırıcı", "gider", "Ürün Maliyeti (Hammadde)"],
  ["Perakende Ürün Alımı", "gider", "Ürün Maliyeti (Hammadde)"],

  ["Karton Bardak (Sıcak)", "gider", "Ambalaj ve Sarf Malzeme"],
  ["Plastik / PET Bardak (Soğuk)", "gider", "Ambalaj ve Sarf Malzeme"],
  ["Bardak Kapağı", "gider", "Ambalaj ve Sarf Malzeme"],
  ["Pipet", "gider", "Ambalaj ve Sarf Malzeme"],
  ["Peçete", "gider", "Ambalaj ve Sarf Malzeme"],
  ["Karıştırıcı ve Şeker Stick", "gider", "Ambalaj ve Sarf Malzeme"],
  ["Bardak Taşıyıcı ve Manşon", "gider", "Ambalaj ve Sarf Malzeme"],
  ["Paket Servis Poşeti ve Kutu", "gider", "Ambalaj ve Sarf Malzeme"],
  ["Kahve Paketleme Ambalajı", "gider", "Ambalaj ve Sarf Malzeme"],
  ["Etiket ve Sticker", "gider", "Ambalaj ve Sarf Malzeme"],
  ["Rulo, Streç ve Folyo", "gider", "Ambalaj ve Sarf Malzeme"],

  ["Net Maaşlar", "gider", "Personel"],
  ["SGK Primleri", "gider", "Personel"],
  ["Avans", "gider", "Personel"],
  ["Prim ve İkramiye", "gider", "Personel"],
  ["Fazla Mesai", "gider", "Personel"],
  ["Personel Yemek", "gider", "Personel"],
  ["Personel Yol", "gider", "Personel"],
  ["İş Kıyafeti ve Önlük", "gider", "Personel"],
  ["Kıdem / İhbar Tazminatı", "gider", "Personel"],
  ["Personel Eğitimi", "gider", "Personel"],

  ["Kira", "gider", "Kira ve Mekân"],
  ["Aidat", "gider", "Kira ve Mekân"],
  ["İşyeri Sigortası", "gider", "Kira ve Mekân"],
  ["Güvenlik ve Alarm", "gider", "Kira ve Mekân"],
  ["Dekorasyon ve Tadilat", "gider", "Kira ve Mekân"],

  ["Elektrik", "gider", "Faturalar"],
  ["Su", "gider", "Faturalar"],
  ["Doğalgaz", "gider", "Faturalar"],
  ["İnternet", "gider", "Faturalar"],
  ["Telefon / GSM", "gider", "Faturalar"],

  ["KDV", "gider", "Vergi, Resmi ve Muhasebe"],
  ["Gelir / Kurumlar Vergisi", "gider", "Vergi, Resmi ve Muhasebe"],
  ["Muhtasar ve Stopaj", "gider", "Vergi, Resmi ve Muhasebe"],
  ["Damga Vergisi", "gider", "Vergi, Resmi ve Muhasebe"],
  ["Belediye Harç ve Ruhsat", "gider", "Vergi, Resmi ve Muhasebe"],
  ["Mali Müşavir", "gider", "Vergi, Resmi ve Muhasebe"],
  ["Noter ve Resmi Giderler", "gider", "Vergi, Resmi ve Muhasebe"],
  ["Vergi / Trafik Cezası", "gider", "Vergi, Resmi ve Muhasebe"],

  ["Espresso Makinesi Bakım", "gider", "Bakım, Onarım ve Ekipman"],
  ["Değirmen Bakım", "gider", "Bakım, Onarım ve Ekipman"],
  ["Su Arıtma Filtresi", "gider", "Bakım, Onarım ve Ekipman"],
  ["Soğutucu ve Buzdolabı Bakım", "gider", "Bakım, Onarım ve Ekipman"],
  ["Tamirat", "gider", "Bakım, Onarım ve Ekipman"],
  ["Küçük Ekipman ve Mutfak Gereci", "gider", "Bakım, Onarım ve Ekipman"],
  ["Demirbaş / Makine Alımı", "gider", "Bakım, Onarım ve Ekipman"],

  ["Temizlik Malzemesi", "gider", "Temizlik ve Hijyen"],
  ["Makine Temizlik Kimyasalı", "gider", "Temizlik ve Hijyen"],
  ["İlaçlama", "gider", "Temizlik ve Hijyen"],
  ["Çöp ve Atık", "gider", "Temizlik ve Hijyen"],
  ["Bez, Eldiven ve Hijyen Ürünleri", "gider", "Temizlik ve Hijyen"],

  ["Sosyal Medya Reklamı", "gider", "Pazarlama ve Reklam"],
  ["Menü ve Basılı Materyal", "gider", "Pazarlama ve Reklam"],
  ["Promosyon ve İkram", "gider", "Pazarlama ve Reklam"],
  ["Fotoğraf ve Tasarım", "gider", "Pazarlama ve Reklam"],
  ["Tabela ve Reklam Malzemesi", "gider", "Pazarlama ve Reklam"],

  ["POS / Banka Komisyonu", "gider", "Finansal Giderler ve Komisyonlar"],
  ["Online Platform Komisyonu", "gider", "Finansal Giderler ve Komisyonlar"],
  ["Yemek Kartı Komisyonu", "gider", "Finansal Giderler ve Komisyonlar"],
  ["Kredi Taksiti", "gider", "Finansal Giderler ve Komisyonlar"],
  ["Kredi / Kart Faizi", "gider", "Finansal Giderler ve Komisyonlar"],
  ["Banka Masrafları", "gider", "Finansal Giderler ve Komisyonlar"],

  ["Kargo", "gider", "Lojistik ve Ulaşım"],
  ["Kurye", "gider", "Lojistik ve Ulaşım"],
  ["Yakıt", "gider", "Lojistik ve Ulaşım"],
  ["Araç Bakım ve Sigorta", "gider", "Lojistik ve Ulaşım"],
  ["Otopark ve Köprü / Otoyol", "gider", "Lojistik ve Ulaşım"],

  ["POS / Adisyon Yazılımı", "gider", "Yazılım ve Abonelikler"],
  ["Müzik Lisansı", "gider", "Yazılım ve Abonelikler"],
  ["Web Sitesi ve Alan Adı", "gider", "Yazılım ve Abonelikler"],
  ["Diğer Abonelikler", "gider", "Yazılım ve Abonelikler"],

  ["Kırtasiye ve Ofis", "gider", "Diğer Giderler"],
  ["Bağış ve Yardım", "gider", "Diğer Giderler"],
  ["Diğer Gider", "gider", "Diğer Giderler"]
]$json$::jsonb) with ordinality as t(e, ord)
on conflict (ad, tur) do update set grup = excluded.grup, sira = excluded.sira;
