import { useMemo, useState } from 'react';
import { listHareketler, listKasa, listKategoriler } from '../lib/api';
import { MALIYET_ORANLARI } from '../lib/kategoriler';
import { downloadCsv } from '../lib/exportCsv';
import {
  AYLAR, formatDate, formatPercent, formatTL, monthRange, ODEME_YONTEMLERI, today, TUR_ETIKET, yearRange,
} from '../lib/format';
import { dailyBreakdown, monthlyBreakdown, summarize } from '../lib/summary';
import { useData } from '../lib/useData';
import { Empty, ErrorBox, PageHeader, StatCard, yearOptions } from '../components/ui';

const pct = (part, total) => (total > 0 ? (part / total) * 100 : NaN);

export default function Raporlar() {
  const now = new Date();
  const [tip, setTip] = useState('ay');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [aralik, setAralik] = useState({ start: monthRange(now.getFullYear(), now.getMonth() + 1).start, end: today() });
  const [detay, setDetay] = useState(true);

  const range = tip === 'ay' ? monthRange(year, month) : tip === 'yil' ? yearRange(year) : aralik;
  const baslik =
    tip === 'ay' ? `${AYLAR[month - 1]} ${year}` : tip === 'yil' ? `${year} Yılı` : `${formatDate(range.start)} – ${formatDate(range.end)}`;
  const rangeValid = range.start && range.end && range.start <= range.end;

  const { data, loading, error } = useData(
    async () => {
      if (!rangeValid) return null;
      const [kasa, hareketler, kategoriler] = await Promise.all([
        listKasa(range.start, range.end),
        listHareketler(range.start, range.end),
        listKategoriler(),
      ]);
      return { kasa, hareketler, kategoriler };
    },
    [range.start, range.end],
  );

  const s = useMemo(() => data && summarize(data.kasa, data.hareketler, data.kategoriler), [data]);
  const dokum = useMemo(() => {
    if (!data) return [];
    return tip === 'yil'
      ? monthlyBreakdown(year, data.kasa, data.hareketler)
      : dailyBreakdown(range.start, range.end, data.kasa, data.hareketler).filter((r) => !r.bos);
  }, [data, tip, year, range.start, range.end]);

  const detayRows = useMemo(() => {
    if (!data) return [];
    const kasaRows = data.kasa.flatMap((k) => [
      Number(k.nakit) > 0 && { tarih: k.tarih, tur: 'kasa', kategori: 'Kasa Satış', cari: '', odeme_yontemi: 'nakit', aciklama: k.aciklama, tutar: Number(k.nakit) },
      Number(k.kredi_karti) > 0 && { tarih: k.tarih, tur: 'kasa', kategori: 'Kasa Satış', cari: '', odeme_yontemi: 'kredi_karti', aciklama: k.aciklama, tutar: Number(k.kredi_karti) },
    ]).filter(Boolean);
    return [...kasaRows, ...data.hareketler].sort((a, b) => a.tarih.localeCompare(b.tarih));
  }, [data]);

  function exportExcel() {
    const rows = [
      ['Koordinat Coffee Factory - Gelir / Gider Raporu'],
      ['Dönem', baslik],
      ['Oluşturma', formatDate(today())],
      [],
      ['ÖZET'],
      ['Kasa Nakit', s.kasaNakit],
      ['Kasa Kredi Kartı', s.kasaKart],
      ['Diğer Gelirler', s.digerGelir],
      ['TOPLAM GELİR', s.toplamGelir],
      ['Giderler', s.gider],
      ['Yapılan Ödemeler', s.odeme],
      ['TOPLAM GİDER', s.toplamCikis],
      [s.net >= 0 ? 'NET KÂR' : 'NET ZARAR', s.net],
      ['Kâr Marjı', formatPercent(s.karMarji)],
      [],
      ['MALİYET ORANLARI (Gelire göre)', 'Tutar', 'Oran'],
      ...MALIYET_ORANLARI.map((o) => {
        const t = s.giderGrup.find((g) => g.ad === o.grup)?.tutar || 0;
        return [o.etiket, t, formatPercent(pct(t, s.toplamGelir))];
      }),
      [],
      ['GELİR DAĞILIMI', 'Alt kalem', 'Tutar'],
      ...s.gelirGrup.flatMap((g) => [[g.ad, '', g.tutar], ...g.kalemler.map((k) => ['', k.ad, k.tutar])]),
      [],
      ['GİDER DAĞILIMI', 'Alt kalem', 'Tutar'],
      ...s.giderGrup.flatMap((g) => [[g.ad, '', g.tutar], ...g.kalemler.map((k) => ['', k.ad, k.tutar])]),
      [],
      ['ÖDEMELER (Kime)', 'Tutar', 'Adet'],
      ...s.odemeCari.map((o) => [o.ad, o.tutar, o.adet]),
      [],
      [tip === 'yil' ? 'AYLIK DÖKÜM' : 'GÜNLÜK DÖKÜM', 'Kasa', 'Diğer Gelir', 'Toplam Gelir', 'Gider', 'Ödeme', 'Net'],
      ...dokum.map((r) => [r.label, r.kasaToplam, r.digerGelir, r.toplamGelir, r.gider, r.odeme, r.net]),
      [],
      ['TÜM HAREKETLER'],
      ['Tarih', 'Tür', 'Kategori', 'Firma / Kişi', 'Ödeme Yöntemi', 'Açıklama', 'Giriş', 'Çıkış'],
      ...detayRows.map((h) => {
        const giris = h.tur === 'kasa' || h.tur === 'gelir';
        return [
          formatDate(h.tarih),
          h.tur === 'kasa' ? 'Kasa' : TUR_ETIKET[h.tur],
          h.kategori || '',
          h.cari || '',
          ODEME_YONTEMLERI[h.odeme_yontemi],
          h.aciklama || '',
          giris ? Number(h.tutar) : '',
          giris ? '' : Number(h.tutar),
        ];
      }),
    ];
    downloadCsv(`koordinat-rapor-${range.start}_${range.end}.csv`, rows);
  }

  return (
    <>
      <PageHeader title="Raporlar / Kâr - Zarar" subtitle="Ay sonu ve yıl sonu gelir-gider, kâr-zarar ve ödeme dökümü.">
        <button className="btn" onClick={exportExcel} disabled={!s}>Excel'e aktar</button>
        <button className="btn btn-primary" onClick={() => window.print()} disabled={!s}>Yazdır / PDF</button>
      </PageHeader>

      <div className="card no-print">
        <div className="toolbar">
          <div className="segmented">
            {[['ay', 'Aylık'], ['yil', 'Yıllık'], ['aralik', 'Tarih aralığı']].map(([k, v]) => (
              <button key={k} type="button" className={tip === k ? 'active' : ''} onClick={() => setTip(k)}>{v}</button>
            ))}
          </div>
          {tip === 'ay' && (
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {AYLAR.map((a, i) => <option key={a} value={i + 1}>{a}</option>)}
            </select>
          )}
          {tip !== 'aralik' && (
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions(year).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {tip === 'aralik' && (
            <>
              <input type="date" value={aralik.start} onChange={(e) => setAralik({ ...aralik, start: e.target.value })} />
              <span className="muted">→</span>
              <input type="date" value={aralik.end} onChange={(e) => setAralik({ ...aralik, end: e.target.value })} />
            </>
          )}
          <label className="checkbox">
            <input type="checkbox" checked={detay} onChange={(e) => setDetay(e.target.checked)} />
            Tüm hareketleri listele
          </label>
        </div>
        {!rangeValid && <div className="alert error">Başlangıç tarihi bitiş tarihinden sonra olamaz.</div>}
      </div>

      <div className="print-only print-header">
        <h1>Koordinat Coffee Factory</h1>
        <div>Gelir / Gider ve Kâr-Zarar Raporu — <b>{baslik}</b></div>
        <div className="small">Rapor tarihi: {formatDate(today())}</div>
      </div>

      <ErrorBox error={error} />
      {loading && <p className="muted">Yükleniyor…</p>}

      {s && !loading && (
        <>
          <h2 className="section-title no-print">{baslik}</h2>
          <div className="stats">
            <StatCard label="Toplam Gelir" value={s.toplamGelir} tone="pos" hint={`Kasa ${formatTL(s.kasaToplam)} + Diğer ${formatTL(s.digerGelir)}`} />
            <StatCard label="Toplam Gider" value={s.toplamCikis} tone="neg" hint={`Gider ${formatTL(s.gider)} + Ödeme ${formatTL(s.odeme)}`} />
            <StatCard label={s.net >= 0 ? 'Net Kâr' : 'Net Zarar'} value={s.net} tone={s.net >= 0 ? 'pos strong' : 'neg strong'} />
            <StatCard label="Kâr Marjı" value={formatPercent(s.karMarji)} hint={`Gider / Gelir oranı ${formatPercent(s.giderOrani)}`} />
          </div>

          <h2 className="section-title">Maliyet oranları (gelire göre)</h2>
          <div className="stats">
            {MALIYET_ORANLARI.map((o) => {
              const t = s.giderGrup.find((g) => g.ad === o.grup)?.tutar || 0;
              return (
                <StatCard key={o.grup} label={o.etiket} value={formatPercent(pct(t, s.toplamGelir))} hint={`${formatTL(t)} · ${o.hedef}`} />
              );
            })}
          </div>

          <div className="grid-2">
            <div className="card">
              <h3>Gelirler — ne sattık?</h3>
              <GrupTablosu gruplar={s.gelirGrup} toplam={s.toplamGelir} toplamEtiket="Toplam Gelir" tone="pos" bos="Gelir yok." />
              <p className="muted small">
                Kasa nakit {formatTL(s.kasaNakit)} · kredi kartı {formatTL(s.kasaKart)}. Ürün grubu dağılımı Günlük Kasa'dan girilir.
              </p>
            </div>

            <div className="card">
              <h3>Giderler — nereye harcadık?</h3>
              <GrupTablosu gruplar={s.giderGrup} toplam={s.toplamCikis} toplamEtiket="Toplam Gider" tone="neg" bos="Gider yok." />
            </div>

            <div className="card">
              <h3>Nereye ne ödeme yaptık?</h3>
              {s.odemeCari.length === 0 ? <Empty>Bu dönemde ödeme kaydı yok.</Empty> : (
                <table className="table compact">
                  <thead><tr><th>Kime</th><th className="num">Adet</th><th className="num">Tutar</th></tr></thead>
                  <tbody>
                    {s.odemeCari.map((o) => (
                      <tr key={o.ad}><td>{o.ad}</td><td className="num muted">{o.adet}</td><td className="num">{formatTL(o.tutar)}</td></tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td>Toplam</td><td></td><td className="num neg">{formatTL(s.odeme)}</td></tr></tfoot>
                </table>
              )}
            </div>

            <div className="card">
              <h3>Ödeme yöntemine göre (ne geldi, ne çıktı)</h3>
              <table className="table compact">
                <thead><tr><th>Yöntem</th><th className="num">Giriş</th><th className="num">Çıkış</th><th className="num">Net</th></tr></thead>
                <tbody>
                  {Object.entries(s.yontem).map(([k, v]) => (
                    <tr key={k}>
                      <td>{ODEME_YONTEMLERI[k]}</td>
                      <td className="num pos">{formatTL(v.giris)}</td>
                      <td className="num neg">{formatTL(v.cikis)}</td>
                      <td className={`num strong ${v.giris - v.cikis >= 0 ? 'pos' : 'neg'}`}>{formatTL(v.giris - v.cikis)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">"Nakit" satırının neti, dönem içinde nakit kasaya giren ile çıkan farkını gösterir.</p>
            </div>
          </div>

          <div className="card page-break-before">
            <h3>{tip === 'yil' ? 'Aylık döküm' : 'Günlük döküm'}</h3>
            {dokum.length === 0 ? <Empty>Bu dönemde kayıt yok.</Empty> : (
              <table className="table compact">
                <thead>
                  <tr>
                    <th>{tip === 'yil' ? 'Ay' : 'Gün'}</th>
                    <th className="num">Kasa (Nakit+Kart)</th>
                    <th className="num">Diğer Gelir</th>
                    <th className="num">Toplam Gelir</th>
                    <th className="num">Gider</th>
                    <th className="num">Ödeme</th>
                    <th className="num">Net</th>
                    <th className="num">Marj</th>
                  </tr>
                </thead>
                <tbody>
                  {dokum.map((r) => (
                    <tr key={r.key} className={r.bos ? 'muted' : ''}>
                      <td>{r.label}</td>
                      <td className="num">{formatTL(r.kasaToplam)}</td>
                      <td className="num">{formatTL(r.digerGelir)}</td>
                      <td className="num pos">{formatTL(r.toplamGelir)}</td>
                      <td className="num">{formatTL(r.gider)}</td>
                      <td className="num">{formatTL(r.odeme)}</td>
                      <td className={`num strong ${r.net >= 0 ? 'pos' : 'neg'}`}>{formatTL(r.net)}</td>
                      <td className="num muted">{formatPercent(r.karMarji)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Toplam</td>
                    <td className="num">{formatTL(s.kasaToplam)}</td>
                    <td className="num">{formatTL(s.digerGelir)}</td>
                    <td className="num pos">{formatTL(s.toplamGelir)}</td>
                    <td className="num">{formatTL(s.gider)}</td>
                    <td className="num">{formatTL(s.odeme)}</td>
                    <td className={`num ${s.net >= 0 ? 'pos' : 'neg'}`}>{formatTL(s.net)}</td>
                    <td className="num">{formatPercent(s.karMarji)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {detay && (
            <div className="card page-break-before">
              <h3>Tüm hareketler ({detayRows.length})</h3>
              {detayRows.length === 0 ? <Empty>Kayıt yok.</Empty> : (
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Tarih</th><th>Tür</th><th>Kategori</th><th>Firma / Kişi</th><th>Yöntem</th><th>Açıklama</th>
                      <th className="num">Giriş</th><th className="num">Çıkış</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detayRows.map((h, i) => {
                      const giris = h.tur === 'kasa' || h.tur === 'gelir';
                      return (
                        <tr key={h.id || `kasa-${i}`}>
                          <td>{formatDate(h.tarih)}</td>
                          <td><span className={`badge ${h.tur === 'kasa' ? 'gelir' : h.tur}`}>{h.tur === 'kasa' ? 'Kasa' : TUR_ETIKET[h.tur]}</span></td>
                          <td>{h.kategori || '—'}</td>
                          <td>{h.cari || '—'}</td>
                          <td>{ODEME_YONTEMLERI[h.odeme_yontemi]}</td>
                          <td className="muted">{h.aciklama}</td>
                          <td className="num pos">{giris ? formatTL(h.tutar) : ''}</td>
                          <td className="num neg">{giris ? '' : formatTL(h.tutar)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6}>Toplam</td>
                      <td className="num pos">{formatTL(s.toplamGelir)}</td>
                      <td className="num neg">{formatTL(s.toplamCikis)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

/** Ana grup satırı + altında girintili alt kalemler, paylar toplam içinde */
function GrupTablosu({ gruplar, toplam, toplamEtiket, tone, bos }) {
  if (gruplar.length === 0) return <Empty>{bos}</Empty>;
  return (
    <table className="table compact grup-tablo">
      <thead><tr><th>Grup / Kalem</th><th className="num">Tutar</th><th className="num">Pay</th></tr></thead>
      <tbody>
        {gruplar.map((g) => (
          <GrupSatirlari key={g.ad} grup={g} toplam={toplam} />
        ))}
      </tbody>
      <tfoot><tr><td>{toplamEtiket}</td><td className={`num ${tone}`}>{formatTL(toplam)}</td><td></td></tr></tfoot>
    </table>
  );
}

function GrupSatirlari({ grup, toplam }) {
  return (
    <>
      <tr className="grup-satir">
        <td>
          {grup.ad}
          <div className="bar"><span style={{ width: `${pct(grup.tutar, toplam) || 0}%` }} /></div>
        </td>
        <td className="num">{formatTL(grup.tutar)}</td>
        <td className="num">{formatPercent(pct(grup.tutar, toplam))}</td>
      </tr>
      {grup.kalemler.map((k) => (
        <tr key={k.ad} className="kalem-satir">
          <td>{k.ad}</td>
          <td className="num">{formatTL(k.tutar)}</td>
          <td className="num muted">{formatPercent(pct(k.tutar, toplam))}</td>
        </tr>
      ))}
    </>
  );
}
