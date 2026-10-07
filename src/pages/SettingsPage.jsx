import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { createCategory, deleteCategory, listCategories } from '../lib/api';
import { groupCategories, groupsForType } from '../lib/categories';
import { useAsync } from '../hooks/useAsync';
import { ErrorAlert, PageHeader } from '../components/ui';

const UNIQUE_VIOLATION = '23505';

export default function SettingsPage() {
  const { data, error, reload } = useAsync(listCategories, []);
  const categories = data || [];

  return (
    <>
      <PageHeader
        title="Ayarlar"
        description="Gelir ve gider kategorileri ana grup → alt kalem şeklindedir. Gider kategorileri ödemelerde de kullanılır."
      />
      <ErrorAlert error={error} />
      <div className="layout-grid layout-grid--top">
        <CategoryManager type="income" title="Gelir kategorileri" categories={categories} onChange={reload} />
        <CategoryManager type="expense" title="Gider / Ödeme kategorileri" categories={categories} onChange={reload} />
      </div>
    </>
  );
}

function CategoryManager({ type, title, categories, onChange }) {
  const groups = groupCategories(categories, type);
  const groupNameOptions = [...new Set([...groupsForType(type), ...groups.map((group) => group.groupName)])];
  const [name, setName] = useState('');
  const [groupName, setGroupName] = useState(groupNameOptions[0]);
  const [error, setError] = useState(null);

  async function handleCreate(event) {
    event.preventDefault();
    if (!name.trim() || !groupName.trim()) return;
    setError(null);
    try {
      await createCategory({ name, type, groupName });
      setName('');
      onChange();
    } catch (createError) {
      setError(createError.code === UNIQUE_VIOLATION ? new Error('Bu kategori zaten var.') : createError);
    }
  }

  async function handleDelete(category) {
    if (!window.confirm(`"${category.name}" kategorisi silinsin mi? (Geçmiş kayıtlardaki kategori adı korunur.)`)) return;
    try {
      await deleteCategory(category.id);
      onChange();
    } catch (deleteError) {
      setError(deleteError);
    }
  }

  const groupListId = `group-options-${type}`;

  return (
    <section className="card">
      <h3>{title}</h3>
      <form className="inline-form" onSubmit={handleCreate}>
        <input
          type="text"
          list={groupListId}
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="Ana grup"
          aria-label="Ana grup"
        />
        <datalist id={groupListId}>
          {groupNameOptions.map((option) => <option key={option} value={option} />)}
        </datalist>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Yeni alt kalem adı"
          aria-label="Alt kalem adı"
        />
        <button className="btn btn--primary"><Plus size={16} />Ekle</button>
      </form>
      <ErrorAlert error={error} />

      {groups.map((group) => (
        <div key={group.groupName} className="category-group">
          <div className="group-title">
            {group.groupName} <span className="text-muted">({group.categories.length})</span>
          </div>
          <ul className="chip-list">
            {group.categories.map((category) => (
              <li key={category.id} className="chip">
                {category.name}
                <button
                  type="button"
                  className="chip__remove"
                  onClick={() => handleDelete(category)}
                  aria-label={`${category.name} sil`}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
