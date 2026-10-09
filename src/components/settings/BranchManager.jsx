import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { createBranch, deleteBranch, listBranches, renameBranch } from '../../lib/api';
import { useAsync } from '../../hooks/useAsync';
import { ErrorAlert, SkeletonTable } from '../ui';

const UNIQUE_VIOLATION = '23505';
const RESTRICT_VIOLATION = '23503';

function toBranchError(error) {
  if (error?.code === UNIQUE_VIOLATION) return new Error('Bu isimde bir şube zaten var.');
  if (error?.code === RESTRICT_VIOLATION) {
    return new Error('Kasa kaydı olan şube silinemez. Önce o şubenin kasa kayıtlarını silin.');
  }
  return error;
}

/** Admin only: adds, renames and deletes branches. Each branch keeps its own daily register. */
export default function BranchManager() {
  const branches = useAsync(listBranches, []);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  async function run(action) {
    setError(null);
    try {
      await action();
      branches.reload();
      return true;
    } catch (actionError) {
      setError(toBranchError(actionError));
      return false;
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!newName.trim()) return;
    if (await run(() => createBranch(newName))) setNewName('');
  }

  async function handleRename(event) {
    event.preventDefault();
    if (!editing.name.trim()) return;
    if (await run(() => renameBranch(editing.id, editing.name))) setEditing(null);
  }

  async function handleDelete(branch) {
    if (branches.data.length <= 1) {
      setError(new Error('En az bir şube olmalı.'));
      return;
    }
    if (!window.confirm(`"${branch.name}" şubesi silinsin mi?`)) return;
    await run(() => deleteBranch(branch.id));
  }

  return (
    <section className="card">
      <h3>Şubeler</h3>
      <p className="text-muted text-small">
        Her şubenin günlük kasası ayrı tutulur. Ödemeler, yapılacak ödemeler, personel ve kategoriler tüm şubeler için
        ortaktır; Özet ve Raporlar tüm şubelerin toplamını gösterir.
      </p>

      <form className="inline-form" onSubmit={handleCreate}>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Yeni şube adı (örn: Kadıköy)"
          aria-label="Yeni şube adı"
        />
        <button className="btn btn--primary" disabled={!newName.trim()}><Plus size={16} />Ekle</button>
      </form>
      <ErrorAlert error={error || branches.error} />

      {branches.isLoading ? (
        <SkeletonTable rows={2} columns={2} />
      ) : (
        <ul className="branch-list">
          {(branches.data || []).map((branch) => (
            <li key={branch.id} className="branch-list__item">
              {editing?.id === branch.id ? (
                <form className="inline-form inline-form--compact" onSubmit={handleRename}>
                  <input
                    type="text"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    aria-label="Şube adı"
                    autoFocus
                  />
                  <button className="btn btn--primary btn--sm" aria-label="Kaydet"><Check size={16} /></button>
                  <button type="button" className="btn btn--ghost btn--sm" aria-label="Vazgeç" onClick={() => setEditing(null)}>
                    <X size={16} />
                  </button>
                </form>
              ) : (
                <>
                  <span className="text-strong">{branch.name}</span>
                  <span className="row-actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setEditing({ id: branch.id, name: branch.name })}
                    >
                      <Pencil size={14} />Yeniden adlandır
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm text-negative" onClick={() => handleDelete(branch)}>
                      <Trash2 size={14} />Sil
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
