import { useMemo, useState } from 'react';
import { deleteHareket, listCariler, listHareketler, listKategoriler, saveHareket } from '../lib/api';
import { formatDate, formatTL, monthRange, ODEME_YONTEMLERI, parseMoney, toInputMoney, today, TUR_ETIKET } from '../lib/format';
import { useData } from '../lib/useData';
import { Empty, ErrorBox, KategoriSelect, MoneyInput, MonthPicker, PageHeader } from '../components/ui';

const MODES = {
  defter: {
    title: 'Gelir - Gider Defteri',
    subtitle:
      'Kasa dışı gelirler (online platform, toptan kahve, catering…) ve harcamalar (bardak, süt, elektrik…). Örn: 30.000 ₺ peçete alındı → Gider.',
    turler: ['gelir', 'gider'],
    cariLabel: 'Firma / Kişi',
    cariRequired: false,
  },
  odeme: {
    title: 'Yapılan Ödemeler',
    subtitle: 'Kime, ne kadar, hangi yöntemle ödeme yaptığınızı girin (tedarikçi, kira, maaş, vergi…).',
    turler: ['odeme'],
    cariLabel: 'Kime ödendi',
    cariRequired: true,
  },
};

const emptyForm = (tur) => ({
  id: null,
  tarih: today(),
  tur,
  kategori: '',
  cari: '',
  odeme_yontemi: 'nakit',
  tutar: '',
  aciklama: '',
});

export default function Hareketler({ mode }) {
  // Sayfa değişince durum sıfırlansın diye key ile yeniden oluşturulur
  return <HareketlerSayfa key={mode} mode={mode} />;
}

function HareketlerSayfa({ mode }) {
  const cfg = MODES[mode];
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [form, setForm] = useState(emptyForm(cfg.turler.includes('gider') ? 'gider' : cfg.turler[0]));
  const [filter, setFilter] = useState({ tur: 'hepsi', q: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const range = monthRange(period.year, period.month);
  const list = useData(() => listHareketler(range.start, range.end, cfg.turler), [range.start, mode]);
  const meta = useData(async () => {
    const [kategoriler, cariler] = await Promise.all([listKategoriler(), listCariler()]);
    return { kategoriler, cariler };
  }, []);

  const kategoriTur = form.tur === 'gelir' ? 'gelir' : 'gider';

  const tutar = parseMoney(form.tutar);
  const valid = form.tarih && tutar > 0 && (!cfg.cariRequired || form.cari.trim());

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveHareket({ ...form, tutar });
      setMessage({
        type: 'success',
        text: `${form.id ? 'Güncellendi' : 'Kaydedildi'}: ${TUR_ETIKET[form.tur]} ${formatTL(tutar)}${form.cari ? ` · ${form.cari}` : ''}`,
      });
      setForm({ ...emptyForm(form.tur), tarih: form.tarih, odeme_yontemi: form.odeme_yontemi });
      list.reload();
      if (form.cari && !meta.data?.cariler.includes(form.cari.trim())) meta.reload();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  function edit(h) {
    setForm({
      id: h.id,
      tarih: h.tarih,
      tur: h.tur,
      kategori: h.kategori || '',
      cari: h.cari || '',
      odeme_yontemi: h.odeme_yontemi,
      tutar: toInputMoney(h.tutar),
      aciklama: h.aciklama || '',
    });
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(h) {
    if (!confirm(`${formatDate(h.tarih)} · ${TUR_ETIKET[h.tur]} · ${formatTL(h.tutar)} silinsin mi?`)) return;
    try {
      await deleteHareket(h.id);
      if (form.id === h.id) setForm(emptyForm(form.tur));
      list.reload();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  const rows = useMemo(() => {
    const q = filter.q.trim().toLocaleLowerCase('tr');
    return (list.data || []).filter(
      (h) =>
        (filter.tur === 'hepsi' || h.tur === filter.tur) &&
        (!q || [h.kategori, h.cari, h.aciklama].some((v) => v?.toLocaleLowerCase('tr').includes(q))),
    );
  }, [list.data, filter]);

  const totals = rows.reduce(
    (t, h) => ({ ...t, [h.tur]: t[h.tur] + Number(h.tutar) }),
    { gelir: 0, gider: 0, odeme: 0 },
  );

  const cariOzet = useMemo(() => {
    if (mode !== 'odeme') return [];
    const m = new Map();
    for (const h of rows) {
      const k = h.cari || 'Belirtilmemiş';
      const cur = m.get(k) || { ad: k, tutar: 0, adet: 0 };
      cur.tutar += Number(h.tutar);
      cur.adet += 1;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.tutar - a.tutar);
  }, [rows, mode]);

  return (
    <>
      <PageHeader title={cfg.title} subtitle={cfg.subtitle} />

      <form className="card form-card" onSubmit={submit}>
        <div className="card-head">
          <h3>{form.id ? 'Kaydı düzenle' : 'Yeni kayıt'}</h3>
          {cfg.turler.length > 1 && (
            <div className="segmented">
              {cfg.turler.map((t) => (
                <button
                  type="button"
                  key={t}
                  className={`${form.tur === t ? 'active' : ''} ${t}`}
                  onClick={() => setForm({ ...form, tur: t, kategori: '' })}
                >
                  {TUR_ETIKET[t]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Tarih</span>
            <input type="date" value={form.tarih} onChange={(e) => setForm({ ...form, tarih: e.target.value })} required />
          </label>
          <label className="field">
            <span>Tutar</span>
            <MoneyInput value={form.tutar} onChange={(v) => setForm({ ...form, tutar: v })} autoFocus required />
          </label>
          <label className="field">
            <span>Kategori</span>
            <KategoriSelect
              kategoriler={meta.data?.kategoriler || []}
              tur={kategoriTur}
              value={form.kategori}
              onChange={(v) => setForm({ ...form, kategori: v })}
            />
          </label>
          <label className="field">
            <span>{cfg.cariLabel}{cfg.cariRequired && ' *'}</span>
            <input
              type="text"
              list="cariler"
              value={form.cari}
              onChange={(e) => setForm({ ...form, cari: e.target.value })}
              placeholder="Örn: ABC Ambalaj"
              required={cfg.cariRequired}
            />
            <datalist id="cariler">
              {(meta.data?.cariler || []).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Ödeme yöntemi</span>
            <select value={form.odeme_yontemi} onChange={(e) => setForm({ ...form, odeme_yontemi: e.target.value })}>
              {Object.entries(ODEME_YONTEMLERI).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="field span-2">
            <span>Açıklama</span>
            <input
              type="text"
              value={form.aciklama}
              onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
              placeholder={form.tur === 'gelir' ? 'Örn: Ofis için 5 kg çekirdek kahve' : 'Örn: 10 koli 12oz karton bardak'}
            />
          </label>
          <div className="field form-submit">
            <button className={`btn btn-block ${form.tur === 'gelir' ? 'btn-success' : 'btn-primary'}`} disabled={!valid || saving}>
              {saving ? 'Kaydediliyor…' : form.id ? 'Güncelle' : `${TUR_ETIKET[form.tur]} kaydet`}
            </button>
            {form.id && (
              <button type="button" className="btn btn-ghost btn-block" onClick={() => setForm(emptyForm(form.tur))}>
                Vazgeç
              </button>
            )}
          </div>
        </div>
        {message && <div className={`alert ${message.type}`}>{message.text}</div>}
      </form>

      <div className={mode === 'odeme' ? 'split' : ''}>
        <div className="card">
          <div className="card-head wrap">
            <h3>Kayıtlar</h3>
            <div className="toolbar">
              {cfg.turler.length > 1 && (
                <select value={filter.tur} onChange={(e) => setFilter({ ...filter, tur: e.target.value })}>
                  <option value="hepsi">Tümü</option>
                  {cfg.turler.map((t) => (
                    <option key={t} value={t}>{TUR_ETIKET[t]}</option>
                  ))}
                </select>
              )}
              <input type="search" placeholder="Ara…" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
              <MonthPicker year={period.year} month={period.month} onChange={(year, month) => setPeriod({ year, month })} />
            </div>
          </div>
          <ErrorBox error={list.error} />
          {list.loading ? (
            <p className="muted">Yükleniyor…</p>
          ) : rows.length === 0 ? (
            <Empty>Bu dönem için kayıt yok.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  {cfg.turler.length > 1 && <th>Tür</th>}
                  <th>Kategori</th>
                  <th>{cfg.cariLabel}</th>
                  <th>Açıklama</th>
                  <th>Yöntem</th>
                  <th className="num">Tutar</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.id} className={form.id === h.id ? 'selected' : ''}>
                    <td>{formatDate(h.tarih)}</td>
                    {cfg.turler.length > 1 && (
                      <td><span className={`badge ${h.tur}`}>{TUR_ETIKET[h.tur]}</span></td>
                    )}
                    <td>{h.kategori || '—'}</td>
                    <td>{h.cari || '—'}</td>
                    <td className="muted">{h.aciklama}</td>
                    <td>{ODEME_YONTEMLERI[h.odeme_yontemi]}</td>
                    <td className={`num ${h.tur === 'gelir' ? 'pos' : 'neg'}`}>{formatTL(h.tutar)}</td>
                    <td className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => edit(h)}>Düzenle</button>
                      <button className="btn btn-ghost btn-sm danger" onClick={() => remove(h)}>Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {rows.length > 0 && (
            <div className="totals-bar">
              {mode === 'defter' ? (
                <>
                  <span>Gelir: <b className="pos">{formatTL(totals.gelir)}</b></span>
                  <span>Gider: <b className="neg">{formatTL(totals.gider)}</b></span>
                  <span>Fark: <b className={totals.gelir - totals.gider >= 0 ? 'pos' : 'neg'}>{formatTL(totals.gelir - totals.gider)}</b></span>
                </>
              ) : (
                <span>Toplam ödeme ({rows.length} kayıt): <b className="neg">{formatTL(totals.odeme)}</b></span>
              )}
            </div>
          )}
        </div>

        {mode === 'odeme' && (
          <div className="card">
            <h3>Kime ne ödedik?</h3>
            {cariOzet.length === 0 ? (
              <Empty>Kayıt yok.</Empty>
            ) : (
              <table className="table compact">
                <tbody>
                  {cariOzet.map((c) => (
                    <tr key={c.ad}>
                      <td>{c.ad}<div className="muted small">{c.adet} ödeme</div></td>
                      <td className="num strong">{formatTL(c.tutar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </>
  );
}
