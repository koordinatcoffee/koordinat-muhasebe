const MAX_SEGMENTED_BRANCHES = 4;

/** Branch switcher: buttons for a few branches, a dropdown for many */
export default function BranchPicker({ branches, value, onChange }) {
  if (branches.length <= MAX_SEGMENTED_BRANCHES) {
    return (
      <div className="segmented" role="group" aria-label="Şube">
        {branches.map((branch) => (
          <button
            key={branch.id}
            type="button"
            className={`segmented__option ${branch.id === value ? 'is-active' : ''}`}
            aria-pressed={branch.id === value}
            onClick={() => onChange(branch.id)}
          >
            {branch.name}
          </button>
        ))}
      </div>
    );
  }
  return (
    <select className="branch-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Şube">
      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
    </select>
  );
}
