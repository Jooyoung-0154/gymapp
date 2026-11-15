// [목적] attendanceCalendar.ts 파일: 월 이동·달력 칸 생성·월별 출석일 집계를 화면과 분리한 계산 함수입니다.
// [정의] CalendarMonth는 달력에서 표시할 연도와 월을 표현하는 타입입니다.
// [구성] year는 연도 숫자, month는 1~12월 숫자입니다.
// [목적] 달력 계산 함수는 CalendarMonth를 받아 월 이동과 날짜 칸 생성을 수행합니다.
export type CalendarMonth = { year: number; month: number };
// [정의] CalendarCell은 달력의 날짜 칸 또는 빈칸 한 개를 표현하는 타입입니다.
// [구성] key는 렌더링 식별자, day는 일 숫자 또는 null, date는 날짜 문자열 또는 null입니다.
// [목적] CalendarCell의 빈칸은 월 첫날 이전의 요일 위치를 맞추는 데 사용합니다.
export type CalendarCell = { key: string; day: number | null; date: string | null };

// [기능] validateMonth 함수: 연도와 월 입력이 달력 계산에 사용할 수 있는 범위인지 확인합니다.
function validateMonth(value: CalendarMonth) {
  if (!Number.isInteger(value.year) || value.year < 1900 || value.year > 2100 ||
      !Number.isInteger(value.month) || value.month < 1 || value.month > 12) {
    throw new RangeError('Invalid calendar month');
  }
}

// [기능] monthKey 함수: 연도·월을 YYYY-MM 문자열로 만들어 월 비교와 날짜 조합에 사용합니다.
export function monthKey(value: CalendarMonth): string {
  validateMonth(value);
  return `${value.year}-${String(value.month).padStart(2, '0')}`;
}

// [기능] shiftMonth 함수: 연말·연초 경계를 포함해 지정한 개월 수만큼 이동한 월을 계산합니다.
export function shiftMonth(value: CalendarMonth, offset: number): CalendarMonth {
  validateMonth(value);
  if (!Number.isInteger(offset)) throw new RangeError('Invalid month offset');
  const total = value.year * 12 + value.month - 1 + offset;
  const result = { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 + 1 };
  validateMonth(result);
  return result;
}

/** UTC is used only for date geometry; device time zones cannot shift weekdays. */
// [기능] calendarCells 함수: 월 첫날의 요일에 맞춰 앞쪽 빈칸과 실제 날짜 칸을 생성합니다. 날짜 배치는 UTC로 계산합니다.
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
// [기능] attendanceCount 함수: 지정한 월의 출석 날짜를 중복 없이 셉니다. 같은 날짜 여러 번 방문해도 하루로 계산합니다.
export function attendanceCount(dates: readonly string[], value: CalendarMonth): number {
  const validDates = new Set(calendarCells(value).map(cell => cell.date).filter(date => date !== null));
  return new Set(dates.filter(date => validDates.has(date))).size;
}
