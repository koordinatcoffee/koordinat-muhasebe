/** Compact icon-only button for table rows; the label is the tooltip and the screen reader name */
export default function IconButton({ label, tone, onClick, children }) {
  return (
    <button
      type="button"
      className={`btn btn--ghost btn--sm btn--icon-sm ${tone === 'negative' ? 'text-negative' : ''}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
