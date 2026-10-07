/** variant: 'error' | 'success' | 'warning' | 'info' */
export default function Alert({ variant = 'info', children }) {
  if (!children) return null;
  return (
    <div className={`alert alert--${variant}`} role={variant === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function ErrorAlert({ error }) {
  if (!error) return null;
  return <Alert variant="error">Hata: {error.message || String(error)}</Alert>;
}
