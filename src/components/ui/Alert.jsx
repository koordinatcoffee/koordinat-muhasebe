/** variant: 'error' | 'success' | 'warning' | 'info' */
export default function Alert({ variant = 'info', children }) {
  if (!children) return null;
  return (
    <div className={`alert alert--${variant}`} role={variant === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

const NETWORK_ERROR_PATTERN = /failed to fetch|networkerror|load failed|network request failed/i;

export function toUserMessage(error) {
  const message = error?.message || String(error);
  return NETWORK_ERROR_PATTERN.test(message)
    ? 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.'
    : message;
}

export function ErrorAlert({ error }) {
  if (!error) return null;
  return <Alert variant="error">Hata: {toUserMessage(error)}</Alert>;
}
