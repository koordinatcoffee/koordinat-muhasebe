import { groupCategories } from '../../lib/categories';

/** Category dropdown grouped by group_name; keeps showing a value that no longer exists */
export default function CategorySelect({ categories, type, value, onChange, id }) {
  const groups = groupCategories(categories, type);
  const isUnknownValue = value && !categories.some((c) => c.type === type && c.name === value);

  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">— Seçin —</option>
      {groups.map((group) => (
        <optgroup key={group.groupName} label={group.groupName}>
          {group.categories.map((category) => (
            <option key={category.id} value={category.name}>{category.name}</option>
          ))}
        </optgroup>
      ))}
      {isUnknownValue && <option value={value}>{value}</option>}
    </select>
  );
}
