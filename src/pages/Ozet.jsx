import { Link } from 'react-router-dom';
import { listHareketler, listKasa, listSonHareketler } from '../lib/api';
import { AYLAR, formatDate, formatPercent, formatTL, monthRange, ODEME_YONTEMLERI, today, TUR_ETIKET } from '../lib/format';
import { summarize } from '../lib/summary';
import { useData } from '../lib/useData';
import { Empty, ErrorBox, PageHeader, StatCard } from '../components/ui';

export default function Ozet() {
  const bugun = today();
  const now = new Date();
  const ay = monthRange(now.getFullYear(), now.getMonth() + 1);

  const { data, loading, error } = useData(async () => {
    const [kasa, hareketler, son] = await Promise.all([
      listKasa(ay.start, ay.end),
      listHareketler(ay.start, ay.end),
      listSonHareketler(8),
    ]);
    return {
      gun: summarize(kasa.filter((k) => k.tarih === bugun), hareketler.filter((h) => h.tarih === bugun)),
      ay: summarize(kasa, hareketler),
      bugunKasaGirildi: kasa.some((k) => k.tarih === bugun),
      son,
    };
  }, []);

  return (
    <>
      <PageHeader title="Özet" subtitle={`Bugün ${formatDate(bugun)}`}>
        <Link className="btn btn-primary" to="/kasa">+ Günlük kasa gir</Link>
        <Link className="btn" to="/defter">+ Gelir / Gider</Link>
        <Link className="btn" to="/odemeler">+ Ödeme</Link>
      </PageHeader>
      <ErrorBox error={error} />
      {loading && <p className="muted">Yükleniyor…</p>}
      {data && (
        <>
          {!data.bugunKasaGirildi && (
            <div className="alert warn">
              Bugünün kasası henüz girilmedi. <Link to="/kasa">Şimdi gir →</Link>
            </div>
          )}

          <h2 className="section-title">Bugün</h2>
          <div className="stats">
            <StatCard label="Kasa · Nakit" value={data.gun.kasaNakit} />
            <StatCard label="Kasa · Kredi Kartı" value={data.gun.kasaKart} />
            <StatCard label="Toplam Gelir" value={data.gun.toplamGelir} tone="pos" hint="Kasa + diğer gelirler" />
            <StatCard label="Toplam Gider + Ödeme" value={data.gun.toplamCikis} tone="neg" />
            <StatCard label="Günün Neti" value={data.gun.net} tone={data.gun.net >= 0 ? 'pos strong' : 'neg strong'} />
          </div>

          <h2 className="section-title">{AYLAR[now.getMonth()]} {now.getFullYear()}</h2>
          <div className="stats">
            <StatCard label="Kasa Toplamı" value={data.ay.kasaToplam} hint={`Nakit ${formatTL(data.ay.kasaNakit)} · Kart ${formatTL(data.ay.kasaKart)}`} />
            <StatCard label="Toplam Gelir" value={data.ay.toplamGelir} tone="pos" />
            <StatCard label="Giderler" value={data.ay.gider} tone="neg" />
            <StatCard label="Yapılan Ödemeler" value={data.ay.odeme} tone="neg" />
            <StatCard
              label={data.ay.net >= 0 ? 'Aylık Kâr' : 'Aylık Zarar'}
              value={data.ay.net}
              tone={data.ay.net >= 0 ? 'pos strong' : 'neg strong'}
              hint={`Kâr marjı ${formatPercent(data.ay.karMarji)}`}
            />
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Son hareketler</h3>
              <Link to="/defter" className="link">Tümünü gör →</Link>
            </div>
            {data.son.length === 0 ? (
              <Empty>Henüz hareket girilmedi.</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Tarih</th><th>Tür</th><th>Kategori</th><th>Firma / Kişi</th><th>Yöntem</th><th className="num">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {data.son.map((h) => (
                    <tr key={h.id}>
                      <td>{formatDate(h.tarih)}</td>
                      <td><span className={`badge ${h.tur}`}>{TUR_ETIKET[h.tur]}</span></td>
                      <td>{h.kategori || '—'}</td>
                      <td>{h.cari || '—'}</td>
                      <td>{ODEME_YONTEMLERI[h.odeme_yontemi]}</td>
                      <td className={`num ${h.tur === 'gelir' ? 'pos' : 'neg'}`}>
                        {h.tur === 'gelir' ? '+' : '−'}{formatTL(h.tutar)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}
