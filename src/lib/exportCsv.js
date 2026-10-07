/**
 * Excel'in Türkçe ayarlarıyla doğrudan açılabilen CSV üretir
 * (UTF-8 BOM + noktalı virgül ayırıcı + virgüllü ondalık).
 */
export function downloadCsv(filename, rows) {
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? v.toFixed(2).replace('.', ',') : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + rows.map((r) => r.map(escape).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
