import { useState } from 'react';
import { addKategori, deleteKategori, listKategoriler } from '../lib/api';
import { groupKategoriler, gruplarFor } from '../lib/kategoriler';
import { useData } from '../lib/useData';
import { ErrorBox, PageHeader } from '../components/ui';

export default function Ayarlar() {
  const { data, error, reload } = useData(listKategoriler, []);
  return (
    <>
      <PageHeader
        title="Ayarlar"
        subtitle="Gelir ve gider kategorileri ana grup → alt kalem şeklindedir. Gider kategorileri ödemelerde de kullanılır."
      />
      <ErrorBox error={error} />
      <div className="grid-2 align-start">
        <KategoriListe tur="gelir" baslik="Gelir kategorileri" kategoriler={data || []} onChange={reload} />
        <KategoriListe tur="gider" baslik="Gider / Ödeme kategorileri" kategoriler={data || []} onChange={reload} />
      </div>
    </>
  );
}

function KategoriListe({ tur, baslik, kategoriler, onChange }) {
  const gruplar = groupKategoriler(kategoriler, tur);
  const grupAdlari = [...new Set([...gruplarFor(tur), ...gruplar.map((g) => g.grup)])];
  const [ad, setAd] = useState('');
  const [grup, setGrup] = useState(grupAdlari[0]);
  const [error, setError] = useState(null);

  async function add(e) {
    e.preventDefault();
    if (!ad.trim() || !grup.trim()) return;
    setError(null);
    try {
      await addKategori(ad, tur, grup);
      setAd('');
      onChange();
    } catch (err) {
      setError(err.code === '23505' ? new Error('Bu kategori zaten var.') : err);
    }
  }

  async function remove(k) {
    if (!confirm(`"${k.ad}" kategorisi silinsin mi? (Geçmiş kayıtlardaki kategori adı korunur.)`)) return;
    try {
      await deleteKategori(k.id);
      onChange();
    } catch (err) {
      setError(err);
    }
  }

  const listId = `gruplar-${tur}`;
  return (
    <div className="card">
      <h3>{baslik}</h3>
      <form className="inline-form" onSubmit={add}>
        <input type="text" list={listId} value={grup} onChange={(e) => setGrup(e.target.value)} placeholder="Ana grup" />
        <datalist id={listId}>
          {grupAdlari.map((g) => <option key={g} value={g} />)}
        </datalist>
        <input type="text" value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Yeni alt kalem adı" />
        <button className="btn btn-primary">Ekle</button>
      </form>
      <ErrorBox error={error} />
      {gruplar.map((g) => (
        <div key={g.grup} className="kategori-grup">
          <div className="kategori-grup-ad">{g.grup} <span className="muted">({g.items.length})</span></div>
          <ul className="tag-list">
            {g.items.map((k) => (
              <li key={k.id}>
                {k.ad}
                <button className="tag-remove" onClick={() => remove(k)} aria-label={`${k.ad} sil`}>×</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
