// [목적] calendarToday.ts 파일: 기기 시간대가 달라도 한국 시간 기준의 오늘 날짜를 얻는 함수입니다.
/** Calendar dates use the gym's Korea time zone on every device. */
// [기능] calendarToday 함수: 한국 시간대로 오늘을 YYYY-MM-DD 형식으로 반환합니다.
export function calendarToday(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
