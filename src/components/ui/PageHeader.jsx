export default function PageHeader({ title, description, actions }) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1>{title}</h1>
        {description && <p className="text-muted">{description}</p>}
      </div>
      {actions && <div className="page-header__actions no-print">{actions}</div>}
    </header>
  );
}
