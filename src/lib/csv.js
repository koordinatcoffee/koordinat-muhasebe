/**
 * Downloads rows as a CSV that opens directly in Excel with Turkish locale
 * (UTF-8 BOM, semicolon delimiter, comma decimal separator).
 */
export function downloadCsv(fileName, rows) {
  const escapeCell = (value) => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'number' ? value.toFixed(2).replace('.', ',') : String(value);
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const content = '﻿' + rows.map((row) => row.map(escapeCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
