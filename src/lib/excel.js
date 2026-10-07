import { formatDate, todayISO } from './format.js';

/**
 * Excel (.xlsx) export with a consistent, print-ready layout.
 *
 * sheet = {
 *   name:     worksheet tab name (max 31 chars),
 *   title:    heading shown above the table,
 *   subtitle: period / filter line (optional),
 *   columns:  [{ header, key, type: 'text' | 'currency' | 'date' | 'number' | 'percent', width }],
 *   rows:     [{ [key]: value, _style?: 'group' | 'total' | 'muted' | 'positive' | 'negative', _types?: { [key]: type } }],
 *             _types overrides a column's type for that row (e.g. a percent row in an amount column),
 *   totals:   { [key]: value } — bold footer row (optional),
 *   note:     line printed under the table (optional),
 * }
 * Amounts are plain numbers; dates are ISO strings ("2026-10-07"); percents are 0-100 (as shown in the app).
 */

const BRAND = 'Koordinat Coffee Factory';
const COLORS = {
  primary: 'FF046E62',
  primarySoft: 'FFE4F2EF',
  border: 'FFCDD6D3',
  muted: 'FF6B7A76',
  positive: 'FF13804A',
  negative: 'FFD03A2F',
  groupFill: 'FFF1F5F4',
  totalFill: 'FFE4F2EF',
};

const NUMBER_FORMATS = {
  currency: '#,##0.00 "₺";-#,##0.00 "₺";"-"',
  number: '#,##0',
  percent: '0.0%',
  date: 'dd.mm.yyyy',
};

const DEFAULT_WIDTHS = { text: 24, currency: 16, date: 12, number: 10, percent: 10 };
const HEADER_ROW = 5;
const INVALID_SHEET_CHARS = /[\\/*?:[\]]/g;

/** "2026-10-07" → Date at UTC midnight, so Excel shows the same day in every time zone */
function toExcelDate(isoDate) {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toCellValue(value, type) {
  if (value === null || value === undefined || value === '') return null;
  switch (type) {
    case 'currency':
    case 'number': {
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }
    case 'percent': {
      const number = Number(value);
      return Number.isFinite(number) ? number / 100 : null;
    }
    case 'date':
      return /^\d{4}-\d{2}-\d{2}/.test(value) ? toExcelDate(value) : String(value);
    default:
      return String(value);
  }
}

const thinBorder = (color = COLORS.border) => ({ style: 'thin', color: { argb: color } });

function addSheet(workbook, sheet, usedNames) {
  let name = (sheet.name || 'Sayfa').replace(INVALID_SHEET_CHARS, ' ').slice(0, 31).trim();
  for (let suffix = 2; usedNames.has(name.toLocaleLowerCase('tr')); suffix += 1) {
    name = `${name.slice(0, 27)} (${suffix})`;
  }
  usedNames.add(name.toLocaleLowerCase('tr'));

  const { columns } = sheet;
  const lastColumn = Math.max(columns.length, 2);
  const worksheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: HEADER_ROW, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: columns.length > 5 ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
      printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`,
    },
    headerFooter: { oddFooter: `&L${BRAND}&RSayfa &P / &N` },
  });

  worksheet.columns = columns.map((column) => ({
    key: column.key,
    width: column.width || DEFAULT_WIDTHS[column.type || 'text'],
  }));

  // Title block
  const titleRows = [
    [BRAND, { bold: true, size: 14, color: { argb: COLORS.primary } }],
    [sheet.title, { bold: true, size: 12 }],
    [
      [sheet.subtitle, `Oluşturma: ${formatDate(todayISO())}`].filter(Boolean).join('   ·   '),
      { size: 10, color: { argb: COLORS.muted } },
    ],
  ];
  titleRows.forEach(([text, font], index) => {
    const row = worksheet.getRow(index + 1);
    row.getCell(1).value = text;
    row.getCell(1).font = font;
    worksheet.mergeCells(index + 1, 1, index + 1, lastColumn);
  });
  worksheet.getRow(1).height = 22;

  // Table header
  const headerRow = worksheet.getRow(HEADER_ROW);
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primary } };
    cell.alignment = { vertical: 'middle', horizontal: column.type && column.type !== 'text' ? 'right' : 'left', wrapText: true };
    cell.border = { top: thinBorder(COLORS.primary), bottom: thinBorder(COLORS.primary) };
  });
  headerRow.height = 20;

  const writeRow = (rowNumber, values, style) => {
    const row = worksheet.getRow(rowNumber);
    columns.forEach((column, index) => {
      const type = values._types?.[column.key] || column.type || 'text';
      const cell = row.getCell(index + 1);
      cell.value = toCellValue(values[column.key], type);
      if (NUMBER_FORMATS[type]) cell.numFmt = NUMBER_FORMATS[type];
      cell.alignment = { vertical: 'top', horizontal: type === 'text' ? 'left' : 'right', wrapText: type === 'text' };
      cell.border = { bottom: thinBorder() };

      const font = {};
      if (style === 'group' || style === 'total') font.bold = true;
      if (style === 'muted') font.color = { argb: COLORS.muted };
      if (style === 'positive' && type !== 'text') font.color = { argb: COLORS.positive };
      if (style === 'negative' && type !== 'text') font.color = { argb: COLORS.negative };
      if (Object.keys(font).length) cell.font = font;

      if (style === 'group') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.groupFill } };
      if (style === 'total') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.totalFill } };
        cell.border = { top: thinBorder(COLORS.primary), bottom: { style: 'double', color: { argb: COLORS.primary } } };
      }
    });
  };

  let rowNumber = HEADER_ROW + 1;
  if (sheet.rows.length === 0) {
    worksheet.getRow(rowNumber).getCell(1).value = 'Bu dönem için kayıt yok.';
    worksheet.getRow(rowNumber).getCell(1).font = { italic: true, color: { argb: COLORS.muted } };
    rowNumber += 1;
  }
  for (const values of sheet.rows) {
    writeRow(rowNumber, values, values._style);
    rowNumber += 1;
  }

  if (sheet.rows.length > 0 && !sheet.rows.some((values) => values._style === 'group')) {
    worksheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: rowNumber - 1, column: columns.length } };
  }

  if (sheet.totals) {
    writeRow(rowNumber, sheet.totals, sheet.totals._style || 'total');
    rowNumber += 1;
  }

  if (sheet.note) {
    const noteRow = worksheet.getRow(rowNumber + 1);
    noteRow.getCell(1).value = sheet.note;
    noteRow.getCell(1).font = { italic: true, size: 9, color: { argb: COLORS.muted } };
    worksheet.mergeCells(rowNumber + 1, 1, rowNumber + 1, lastColumn);
  }
}

export async function buildWorkbook(sheets) {
  // Loaded on demand: the Excel library is only needed when exporting
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = BRAND;
  workbook.created = new Date();

  const usedNames = new Set();
  for (const sheet of sheets) addSheet(workbook, sheet, usedNames);
  return workbook;
}

/** Builds the workbook and downloads it as fileName (.xlsx) */
export async function downloadWorkbook(fileName, sheets) {
  const workbook = await buildWorkbook(sheets);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
