/**
 * Shimmering placeholders shown while data loads, shaped like the content they stand in for.
 * They are hidden from screen readers; the wrapping element announces "Yükleniyor".
 */

/** One shimmering block; width / height accept any CSS length */
export function Skeleton({ width = '100%', height = 14, radius, className = '' }) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

/** Placeholder for a data table: a header row and `rows` body rows */
export function SkeletonTable({ rows = 5, columns = 5 }) {
  const widths = ['70%', '90%', '60%', '80%', '50%', '75%'];
  return (
    <div className="skeleton-table" role="status" aria-label="Yükleniyor">
      <div className="skeleton-table__row skeleton-table__row--head" style={{ '--skeleton-columns': columns }}>
        {Array.from({ length: columns }, (_, column) => <Skeleton key={column} width="55%" height={11} />)}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="skeleton-table__row" style={{ '--skeleton-columns': columns }}>
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} width={widths[(row + column) % widths.length]} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a row of stat cards */
export function SkeletonStatGrid({ count = 4 }) {
  return (
    <div className="stat-grid" role="status" aria-label="Yükleniyor">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="stat-card">
          <Skeleton width="45%" height={11} />
          <Skeleton width="70%" height={24} className="skeleton--spaced" />
          <Skeleton width="55%" height={10} />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a whole page: title, stat cards and a table card (page loads, sign-in check) */
export function PageSkeleton({ stats = 4, rows = 6 }) {
  return (
    <div className="page-skeleton" role="status" aria-label="Yükleniyor">
      <div className="page-header">
        <div className="page-header__text">
          <Skeleton width={220} height={26} />
          <Skeleton width={360} height={13} className="skeleton--spaced" />
        </div>
      </div>
      {stats > 0 && <SkeletonStatGrid count={stats} />}
      <section className="card">
        <Skeleton width={180} height={16} className="skeleton--title" />
        <SkeletonTable rows={rows} />
      </section>
    </div>
  );
}
