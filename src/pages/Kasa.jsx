import { useEffect, useState } from 'react';
import { deleteKasa, getKasa, listKasa, listKategoriler, saveKasa } from '../lib/api';
import { formatDate, formatTL, monthRange, parseMoney, toInputMoney, today } from '../lib/format';
import { groupKategoriler } from '../lib/kategoriler';
import { useData } from '../lib/useData';
import { Empty, ErrorBox, MoneyInput, MonthPicker, PageHeader } from '../components/ui';

// Kasadan geçmeyen gelir grupları dağılımda gösterilmez (ayrıca Gelir olarak girilir)
const KASA_DISI_GRUPLAR = ['Kanal ve Kurumsal Satış', 'Diğer Gelirler'];

const emptyForm = (tarih) => ({ tarih, nakit: '', kredi_karti: '', dagilim: {}, aciklama: '' });

function dagilimFromRow(dagilim) {
  return Object.fromEntries(Object.entries(dagilim || {}).map(([k, v]) => [k, toInputMoney(v)]));
}

export default function Kasa() {
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [form, setForm] = useState(emptyForm(today()));
  const [existing, setExisting] = useState(null);
  const [dagilimAcik, setDagilimAcik] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const range = monthRange(period.year, period.month);
  const list = useData(() => listKasa(range.start, range.end), [range.start]);
  const kategoriler = useData(listKategoriler, []);
  const satisGruplari = groupKategoriler(kategoriler.data || [], 'gelir').filter(
    (g) => !KASA_DISI_GRUPLAR.includes(g.grup),
  );

  // Seçilen tarihte kayıt varsa forma getir (aynı güne ikinci kayıt açılmaz, güncellenir)
  useEffect(() => {
    let cancelled = false;
    setExisting(null);
    if (!form.tarih) return;
    getKasa(form.tarih)
      .then((row) => {
        if (cancelled) return;
        setExisting(row);
        setForm((f) =>
          row
            ? {
                tarih: f.tarih,
                nakit: toInputMoney(row.nakit),
                kredi_karti: toInputMoney(row.kredi_karti),
                dagilim: dagilimFromRow(row.dagilim),
                aciklama: row.aciklama || '',
              }
            : { ...emptyForm(f.tarih) },
        );
        if (row && Object.keys(row.dagilim || {}).length) setDagilimAcik(true);
      })
      .catch((e) => !cancelled && setMessage({ type: 'error', text: e.message }));
    return () => {
      cancelled = true;
    };
  }, [form.tarih]);

  const nakit = parseMoney(form.nakit);
  const kart = parseMoney(form.kredi_karti);
  const toplam = (nakit || 0) + (kart || 0);

  const dagilim = Object.fromEntries(
    Object.entries(form.dagilim)
      .map(([k, v]) => [k, parseMoney(v)])
      .filter(([, v]) => v !== 0),
  );
  const dagilimGecersiz = Object.values(dagilim).some((v) => Number.isNaN(v) || v < 0);
  const dagitilan = Object.values(dagilim).reduce((t, v) => t + (Number.isNaN(v) ? 0 : v), 0);
  const kalan = Math.round((toplam - dagitilan) * 100) / 100;
  const dagilimFazla = kalan < 0;

  const valid =
    form.tarih && !Number.isNaN(nakit) && !Number.isNaN(kart) && nakit >= 0 && kart >= 0 && toplam > 0 &&
    !dagilimGecersiz && !dagilimFazla;

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setMessage(null);
    try {
      const row = await saveKasa({ tarih: form.tarih, nakit, kredi_karti: kart, dagilim, aciklama: form.aciklama.trim() });
      setExisting(row);
      setMessage({ type: 'success', text: `${formatDate(form.tarih)} kasası kaydedildi: ${formatTL(row.toplam)}` });
      list.reload();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function remove(row) {
    if (!confirm(`${formatDate(row.tarih)} tarihli kasa kaydı silinsin mi?`)) return;
    try {
      await deleteKasa(row.id);
      if (row.tarih === form.tarih) {
        setExisting(null);
        setForm(emptyForm(form.tarih));
      }
      list.reload();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  const rows = list.data || [];
  const totals = rows.reduce(
    (t, r) => ({ nakit: t.nakit + Number(r.nakit), kart: t.kart + Number(r.kredi_karti) }),
    { nakit: 0, kart: 0 },
  );

  return (
    <>
      <PageHeader
        title="Günlük Kasa"
        subtitle="Gün sonunda kasadaki nakit ve kredi kartı (POS / Z raporu) satış toplamlarını girin."
      />

      <form className="card form-card" onSubmit={submit}>
        <div className="card-head">
          <h3>{existing ? 'Kasa kaydını güncelle' : 'Yeni kasa kaydı'}</h3>
          {existing && <span className="badge info">Bu tarih için kayıt var — güncellenecek</span>}
        </div>
        <div className="form-grid kasa-grid">
          <label className="field">
            <span>Tarih</span>
            <input type="date" value={form.tarih} onChange={(e) => setForm({ ...form, tarih: e.target.value })} required />
          </label>
          <label className="field">
            <span>Nakit</span>
            <MoneyInput value={form.nakit} onChange={(v) => setForm({ ...form, nakit: v })} autoFocus />
          </label>
          <label className="field">
            <span>Kredi Kartı</span>
            <MoneyInput value={form.kredi_karti} onChange={(v) => setForm({ ...form, kredi_karti: v })} />
          </label>
          <div className="field">
            <span>Toplam</span>
            <div className="total-box">{formatTL(toplam)}</div>
          </div>
          <label className="field span-3">
            <span>Not (isteğe bağlı)</span>
            <input type="text" value={form.aciklama} onChange={(e) => setForm({ ...form, aciklama: e.target.value })} placeholder="Örn: Hafta sonu yoğunluk" />
          </label>
          <div className="field form-submit">
            <button className="btn btn-primary btn-block" disabled={!valid || saving}>
              {saving ? 'Kaydediliyor…' : existing ? 'Güncelle' : 'Kaydet'}
            </button>
          </div>
        </div>

        <div className="dagilim">
          <button type="button" className="dagilim-toggle" onClick={() => setDagilimAcik(!dagilimAcik)}>
            <span>{dagilimAcik ? '▾' : '▸'}</span>
            Satış dağılımı — ürün grubuna göre <span className="muted">(isteğe bağlı)</span>
          </button>
          {dagilimAcik && (
            <>
              <p className="muted small">
                POS / adisyon raporundaki ürün grubu tutarlarını girerseniz raporlarda "ne sattık" dökümü çıkar.
                Dağıtılmayan kısım "Kasa Satışı (dağıtılmamış)" olarak kalır. Toplam, kasa toplamını geçemez.
              </p>
              <ErrorBox error={kategoriler.error} />
              {satisGruplari.map((g) => (
                <div key={g.grup} className="dagilim-grup">
                  <div className="dagilim-grup-ad">{g.grup}</div>
                  <div className="dagilim-grid">
                    {g.items.map((k) => (
                      <label key={k.id} className="field">
                        <span>{k.ad}</span>
                        <MoneyInput
                          value={form.dagilim[k.ad] ?? ''}
                          onChange={(v) => setForm({ ...form, dagilim: { ...form.dagilim, [k.ad]: v } })}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div className={`dagilim-ozet ${dagilimFazla ? 'neg' : ''}`}>
                Dağıtılan: <b>{formatTL(dagitilan)}</b>
                <span>·</span>
                {dagilimFazla ? (
                  <>Kasa toplamını <b>{formatTL(-kalan)}</b> aşıyor</>
                ) : (
                  <>Dağıtılmamış: <b>{formatTL(kalan)}</b></>
                )}
              </div>
            </>
          )}
        </div>
        {message && <div className={`alert ${message.type}`}>{message.text}</div>}
      </form>

      <div className="card">
        <div className="card-head">
          <h3>Aylık kasa listesi</h3>
          <MonthPicker year={period.year} month={period.month} onChange={(year, month) => setPeriod({ year, month })} />
        </div>
        <ErrorBox error={list.error} />
        {list.loading ? (
          <p className="muted">Yükleniyor…</p>
        ) : rows.length === 0 ? (
          <Empty>Bu ay için kasa kaydı yok.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Tarih</th><th className="num">Nakit</th><th className="num">Kredi Kartı</th><th className="num">Toplam</th><th>Not</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.tarih === form.tarih ? 'selected' : ''}>
                  <td>
                    {formatDate(r.tarih)}
                    {Object.keys(r.dagilim || {}).length > 0 && <span className="badge info dagilim-badge" title="Ürün grubu dağılımı girilmiş">dağılım</span>}
                  </td>
                  <td className="num">{formatTL(r.nakit)}</td>
                  <td className="num">{formatTL(r.kredi_karti)}</td>
                  <td className="num strong">{formatTL(r.toplam)}</td>
                  <td className="muted">{r.aciklama}</td>
                  <td className="row-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, tarih: r.tarih })}>Düzenle</button>
                    <button className="btn btn-ghost btn-sm danger" onClick={() => remove(r)}>Sil</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Ay toplamı ({rows.length} gün)</td>
                <td className="num">{formatTL(totals.nakit)}</td>
                <td className="num">{formatTL(totals.kart)}</td>
                <td className="num">{formatTL(totals.nakit + totals.kart)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}
