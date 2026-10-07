import { AYLAR } from './format.js';
import { DIGER_GRUP, grupMap, KASA_DAGITILMAMIS } from './kategoriler.js';

const num = (v) => Number(v) || 0;
const round = (v) => Math.round(v * 100) / 100;

function addTo(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount);
}

const sortedEntries = (map) =>
  [...map.entries()].map(([ad, tutar]) => ({ ad, tutar: round(tutar) })).sort((a, b) => b.tutar - a.tutar);

/** Alt kalemleri ana gruplarda toplar: [{ ad, tutar, kalemler: [{ ad, tutar }] }] */
function groupEntries(entries, grupOf) {
  const groups = new Map();
  for (const e of entries) {
    const g = grupOf(e.ad);
    if (!groups.has(g)) groups.set(g, { ad: g, tutar: 0, kalemler: [] });
    const grp = groups.get(g);
    grp.tutar += e.tutar;
    grp.kalemler.push(e);
  }
  return [...groups.values()].map((g) => ({ ...g, tutar: round(g.tutar) })).sort((a, b) => b.tutar - a.tutar);
}

/**
 * Kasa kayıtları ve hareketlerden dönem özeti çıkarır.
 *   Toplam Gelir = Kasa (nakit + kredi kartı) + diğer gelirler
 *   Toplam Çıkış = Giderler + Yapılan ödemeler
 *   Net          = Toplam Gelir - Toplam Çıkış
 * Kasanın ürün grubu dağılımı (dagilim) gelir kategorilerine eklenir;
 * dağıtılmayan kısım "Kasa Satışı (dağıtılmamış)" olarak görünür.
 */
export function summarize(kasa = [], hareketler = [], kategoriler = []) {
  let kasaNakit = 0;
  let kasaKart = 0;
  let digerGelir = 0;
  let gider = 0;
  let odeme = 0;

  const gelirKategori = new Map();
  const giderKategori = new Map();
  const odemeCari = new Map();
  const odemeCariAdet = new Map();
  const yontem = {
    nakit: { giris: 0, cikis: 0 },
    kredi_karti: { giris: 0, cikis: 0 },
    havale: { giris: 0, cikis: 0 },
    diger: { giris: 0, cikis: 0 },
  };

  for (const k of kasa) {
    kasaNakit += num(k.nakit);
    kasaKart += num(k.kredi_karti);
    let dagitilan = 0;
    for (const [kat, tutar] of Object.entries(k.dagilim || {})) {
      if (num(tutar) <= 0) continue;
      addTo(gelirKategori, kat, num(tutar));
      dagitilan += num(tutar);
    }
    const kalan = num(k.nakit) + num(k.kredi_karti) - dagitilan;
    if (kalan > 0.004) addTo(gelirKategori, KASA_DAGITILMAMIS, kalan);
  }
  yontem.nakit.giris += kasaNakit;
  yontem.kredi_karti.giris += kasaKart;

  for (const h of hareketler) {
    const t = num(h.tutar);
    const y = yontem[h.odeme_yontemi] || yontem.diger;
    if (h.tur === 'gelir') {
      digerGelir += t;
      y.giris += t;
      addTo(gelirKategori, h.kategori || 'Kategorisiz', t);
    } else {
      if (h.tur === 'gider') gider += t;
      else {
        odeme += t;
        addTo(odemeCari, h.cari || 'Belirtilmemiş', t);
        addTo(odemeCariAdet, h.cari || 'Belirtilmemiş', 1);
      }
      y.cikis += t;
      addTo(giderKategori, h.kategori || 'Kategorisiz', t);
    }
  }

  const kasaToplam = kasaNakit + kasaKart;
  const toplamGelir = kasaToplam + digerGelir;
  const toplamCikis = gider + odeme;
  const net = toplamGelir - toplamCikis;

  const gruplar = grupMap(kategoriler);
  const gelirGrupOf = (ad) =>
    ad === KASA_DAGITILMAMIS ? 'Kafe Satışları' : gruplar.gelir.get(ad) || DIGER_GRUP.gelir;
  const giderGrupOf = (ad) => gruplar.gider.get(ad) || DIGER_GRUP.gider;
  const gelirKalemleri = sortedEntries(gelirKategori);
  const giderKalemleri = sortedEntries(giderKategori);

  return {
    kasaNakit: round(kasaNakit),
    kasaKart: round(kasaKart),
    kasaToplam: round(kasaToplam),
    digerGelir: round(digerGelir),
    toplamGelir: round(toplamGelir),
    gider: round(gider),
    odeme: round(odeme),
    toplamCikis: round(toplamCikis),
    net: round(net),
    karMarji: toplamGelir > 0 ? (net / toplamGelir) * 100 : NaN,
    giderOrani: toplamGelir > 0 ? (toplamCikis / toplamGelir) * 100 : NaN,
    gelirKategori: gelirKalemleri,
    giderKategori: giderKalemleri,
    gelirGrup: groupEntries(gelirKalemleri, gelirGrupOf),
    giderGrup: groupEntries(giderKalemleri, giderGrupOf),
    odemeCari: sortedEntries(odemeCari).map((r) => ({ ...r, adet: odemeCariAdet.get(r.ad) })),
    yontem,
  };
}

/** Kayıtları gruplayıp her grup için özet çıkarır (aylık ya da günlük döküm). */
function breakdown(kasa, hareketler, keyOf, keys, labelOf) {
  const groups = new Map(keys.map((k) => [k, { kasa: [], hareketler: [] }]));
  for (const k of kasa) groups.get(keyOf(k.tarih))?.kasa.push(k);
  for (const h of hareketler) groups.get(keyOf(h.tarih))?.hareketler.push(h);
  return keys.map((key) => {
    const g = groups.get(key);
    return { key, label: labelOf(key), bos: !g.kasa.length && !g.hareketler.length, ...summarize(g.kasa, g.hareketler) };
  });
}

export function monthlyBreakdown(year, kasa, hareketler) {
  const keys = AYLAR.map((_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  return breakdown(kasa, hareketler, (t) => t.slice(0, 7), keys, (k) => AYLAR[Number(k.slice(5, 7)) - 1]);
}

export function dailyBreakdown(start, end, kasa, hareketler) {
  const keys = [];
  const d = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (d <= last && keys.length < 400) {
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return breakdown(kasa, hareketler, (t) => t.slice(0, 10), keys, (k) => `${k.slice(8, 10)}.${k.slice(5, 7)}.${k.slice(0, 4)}`);
}
