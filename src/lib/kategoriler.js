/** Ana grupların görüntülenme sırası (supabase/schema.sql ile aynı) */
export const GELIR_GRUPLARI = [
  'Kafe Satışları',
  'Perakende Satış',
  'Kanal ve Kurumsal Satış',
  'Diğer Gelirler',
];

export const GIDER_GRUPLARI = [
  'Ürün Maliyeti (Hammadde)',
  'Ambalaj ve Sarf Malzeme',
  'Personel',
  'Kira ve Mekân',
  'Faturalar',
  'Vergi, Resmi ve Muhasebe',
  'Bakım, Onarım ve Ekipman',
  'Temizlik ve Hijyen',
  'Pazarlama ve Reklam',
  'Finansal Giderler ve Komisyonlar',
  'Lojistik ve Ulaşım',
  'Yazılım ve Abonelikler',
  'Diğer Giderler',
];

export const DIGER_GRUP = { gelir: 'Diğer Gelirler', gider: 'Diğer Giderler' };

/** Kasada dağıtılmamış satış tutarının raporlardaki adı */
export const KASA_DAGITILMAMIS = 'Kasa Satışı (dağıtılmamış)';

/** Kafe sektöründe takip edilen başlıca maliyet oranları (gelire oranla) */
export const MALIYET_ORANLARI = [
  { grup: 'Ürün Maliyeti (Hammadde)', etiket: 'Ürün maliyeti', hedef: 'Genelde %25-35' },
  { grup: 'Personel', etiket: 'Personel', hedef: 'Genelde %25-35' },
  { grup: 'Kira ve Mekân', etiket: 'Kira ve mekân', hedef: 'Genelde %10-15' },
  { grup: 'Ambalaj ve Sarf Malzeme', etiket: 'Ambalaj ve sarf', hedef: 'Genelde %3-8' },
];

export const gruplarFor = (tur) => (tur === 'gelir' ? GELIR_GRUPLARI : GIDER_GRUPLARI);

function grupSirasi(tur, grup) {
  const i = gruplarFor(tur).indexOf(grup);
  return i === -1 ? 999 : i;
}

/** Kategorileri ana gruplara ayırır: [{ grup, items: [...] }] */
export function groupKategoriler(kategoriler, tur) {
  const map = new Map();
  for (const k of kategoriler.filter((x) => x.tur === tur)) {
    const g = k.grup || DIGER_GRUP[tur];
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(k);
  }
  return [...map.entries()]
    .sort(([a], [b]) => grupSirasi(tur, a) - grupSirasi(tur, b) || a.localeCompare(b, 'tr'))
    .map(([grup, items]) => ({
      grup,
      items: items.sort((a, b) => (a.sira ?? 0) - (b.sira ?? 0) || a.ad.localeCompare(b.ad, 'tr')),
    }));
}

/** Kategori adı → ana grup eşlemesi */
export function grupMap(kategoriler) {
  const m = { gelir: new Map(), gider: new Map() };
  for (const k of kategoriler) m[k.tur]?.set(k.ad, k.grup || DIGER_GRUP[k.tur]);
  return m;
}
