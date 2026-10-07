import { supabase } from './supabase';

const PAGE_SIZE = 1000;

/** Supabase tek seferde en fazla 1000 satır döndürür; yıllık raporlar için sayfa sayfa çeker. */
async function fetchAll(buildQuery) {
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

// ------------------------------------------------------------------ Kasa

export const listKasa = (start, end) =>
  fetchAll(() =>
    supabase
      .from('kasa_gunluk')
      .select('*')
      .gte('tarih', start)
      .lte('tarih', end)
      .order('tarih', { ascending: false }),
  );

export async function getKasa(tarih) {
  return unwrap(await supabase.from('kasa_gunluk').select('*').eq('tarih', tarih).maybeSingle());
}

export async function saveKasa({ tarih, nakit, kredi_karti, dagilim, aciklama }) {
  return unwrap(
    await supabase
      .from('kasa_gunluk')
      .upsert({ tarih, nakit, kredi_karti, dagilim: dagilim || {}, aciklama: aciklama || null }, { onConflict: 'tarih' })
      .select()
      .single(),
  );
}

export async function deleteKasa(id) {
  unwrap(await supabase.from('kasa_gunluk').delete().eq('id', id));
}

// ------------------------------------------------------------- Hareketler

export const listHareketler = (start, end, turler) =>
  fetchAll(() => {
    let q = supabase
      .from('hareketler')
      .select('*')
      .gte('tarih', start)
      .lte('tarih', end)
      .order('tarih', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id');
    if (turler?.length) q = q.in('tur', turler);
    return q;
  });

export async function listSonHareketler(limit = 10) {
  return unwrap(
    await supabase
      .from('hareketler')
      .select('*')
      .order('tarih', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit),
  );
}

export async function saveHareket({ id, ...fields }) {
  const row = {
    tarih: fields.tarih,
    tur: fields.tur,
    kategori: fields.kategori || null,
    cari: fields.cari?.trim() || null,
    odeme_yontemi: fields.odeme_yontemi,
    tutar: fields.tutar,
    aciklama: fields.aciklama?.trim() || null,
  };
  const query = id
    ? supabase.from('hareketler').update(row).eq('id', id)
    : supabase.from('hareketler').insert(row);
  return unwrap(await query.select().single());
}

export async function deleteHareket(id) {
  unwrap(await supabase.from('hareketler').delete().eq('id', id));
}

/** Daha önce girilmiş firma / kişi adları (otomatik tamamlama için) */
export async function listCariler() {
  const rows = unwrap(
    await supabase
      .from('hareketler')
      .select('cari')
      .not('cari', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000),
  );
  return [...new Set(rows.map((r) => r.cari))].sort((a, b) => a.localeCompare(b, 'tr'));
}

// ------------------------------------------------------------ Kategoriler

export async function listKategoriler() {
  return unwrap(await supabase.from('kategoriler').select('*').order('sira').order('ad'));
}

export async function addKategori(ad, tur, grup) {
  return unwrap(
    await supabase.from('kategoriler').insert({ ad: ad.trim(), tur, grup: grup.trim() }).select().single(),
  );
}

export async function deleteKategori(id) {
  unwrap(await supabase.from('kategoriler').delete().eq('id', id));
}
