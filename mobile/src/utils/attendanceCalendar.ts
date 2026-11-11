export type CalendarMonth = { year: number; month: number };
export type CalendarCell = { key: string; day: number | null; date: string | null };

function validateMonth(value: CalendarMonth) {
  if (!Number.isInteger(value.year) || value.year < 1900 || value.year > 2100 ||
      !Number.isInteger(value.month) || value.month < 1 || value.month > 12) {
    throw new RangeError('Invalid calendar month');
  }
}

export function monthKey(value: CalendarMonth): string {
  validateMonth(value);
  return `${value.year}-${String(value.month).padStart(2, '0')}`;
}

export function shiftMonth(value: CalendarMonth, offset: number): CalendarMonth {
  validateMonth(value);
  if (!Number.isInteger(offset)) throw new RangeError('Invalid month offset');
  const total = value.year * 12 + value.month - 1 + offset;
  const result = { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 + 1 };
  validateMonth(result);
  return result;
}

/** UTC is used only for date geometry; device time zones cannot shift weekdays. */
export function calendarCells(value: CalendarMonth): CalendarCell[] {
  const prefix = monthKey(value);
  const weekday = new Date(Date.UTC(value.year, value.month - 1, 1)).getUTCDay();
  const length = new Date(Date.UTC(value.year, value.month, 0)).getUTCDate();
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - weekday + 1;
    if (day < 1 || day > length) return { key: `${prefix}-blank-${index}`, day: null, date: null };
    const date = `${prefix}-${String(day).padStart(2, '0')}`;
    return { key: date, day, date };
  });
}

/** One calendar date counts once, regardless of duplicate visits. */
export function attendanceCount(dates: readonly string[], value: CalendarMonth): number {
  const validDates = new Set(calendarCells(value).map(cell => cell.date).filter(date => date !== null));
  return new Set(dates.filter(date => validDates.has(date))).size;
}
