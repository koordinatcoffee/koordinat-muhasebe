const FIRST_YEAR = 2024;

/** Selectable years, newest first; always includes the selected year and next year */
export function getYearOptions(selectedYear) {
  const currentYear = new Date().getFullYear();
  const from = Math.min(FIRST_YEAR, selectedYear);
  const to = Math.max(currentYear + 1, selectedYear);
  return Array.from({ length: to - from + 1 }, (_, index) => to - index);
}
