// [목적] bookingPreview.ts 파일: 예약 예시의 규칙을 계산합니다. 기준 시각은 2026-11-12로 고정되며 실제 서버 예약·차감 처리를 수행하지 않습니다.
// [정의] PreviewBooking은 PT 예약 한 건을 표현하는 예시 데이터 타입입니다.
// [구성] id는 예약 ID, date는 예약 날짜, time은 시작 시간, status는 예약 상태, journal은 생략 가능한 수업 일지입니다.
// [목적] PreviewBooking.status는 scheduled·completed·cancelled·late_cancelled 중 하나입니다.
export type PreviewBooking = {
  id: string; date: string; time: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'late_cancelled';
  journal?: string;
};
// [정의] BookingState는 앱이 공유하는 전체 예시 예약 상태 타입입니다.
// [구성] bookings는 예약 배열, remaining은 잔여 PT 횟수, nextId는 새 예시 예약 ID를 만들 때 쓰는 순번입니다.
// [목적] BookingState.remaining에서 예약 확보 횟수를 빼면 추가 예약 가능한 횟수가 됩니다.
export type BookingState = { bookings: PreviewBooking[]; remaining: number; nextId: number };
// [정의] BookingCommand는 예시 예약을 변경할 명령을 정의하는 유니온 타입입니다.
// [구성] create 명령은 date·time, move 명령은 id·date·time, cancel 명령은 id를 가집니다.
// [목적] BookingCommand.type 값에 따라 필요한 필드가 달라져 잘못된 명령 조합을 타입 검사로 제한합니다.
export type BookingCommand = { type: 'create'; date: string; time: string } | { type: 'move'; id: string; date: string; time: string } | { type: 'cancel'; id: string };
// [정의] BookingResult는 예시 예약 명령의 성공 또는 실패 결과 타입입니다.
// [구성] ok가 true이면 state와 booking, false이면 message를 가집니다.
// [목적] 호출 화면은 BookingResult.ok로 성공 여부를 확인한 후 해당 결과의 필드에 접근합니다.
export type BookingResult = { ok: true; state: BookingState; booking: PreviewBooking } | { ok: false; message: string };
export const previewNow = '2026-11-12T10:00:00+09:00';
export const passExpiresOn = '2026-12-30';
export const publishedTimes = ['09:00', '11:00', '13:00', '14:00', '15:30', '17:00', '18:00'] as const;

// [기능] initialBookingState 함수: 예정·완료 예약과 잔여 횟수의 초기 예시를 새 객체로 만듭니다.
export function initialBookingState(): BookingState {
  return { remaining: 8, nextId: 1, bookings: [
    { id: 'existing-1', date: '2026-11-14', time: '14:00', status: 'scheduled' },
    { id: 'existing-2', date: '2026-11-18', time: '18:00', status: 'scheduled' },
    { id: 'past-1', date: '2026-11-10', time: '11:00', status: 'completed', journal: '기본 스쿼트 동작과 호흡을 함께 연습했어요. 다음 수업에는 오늘 익힌 동작을 다시 확인할 예정이에요.' },
    { id: 'past-2', date: '2026-11-05', time: '14:00', status: 'completed' },
  ] };
}
// [기능] heldCredits 함수: 예정 예약과 늦은 취소가 잡고 있는 횟수를 셉니다.
export function heldCredits(state: BookingState): number { return state.bookings.filter(b => b.status === 'scheduled' || b.status === 'late_cancelled').length; }
// [기능] availableCredits 함수: 실제 잔여 예시 횟수에서 예약으로 묶인 횟수를 빼 추가 예약 가능 횟수를 계산합니다.
export function availableCredits(state: BookingState): number { return state.remaining - heldCredits(state); }
// [기능] startsAt 함수: 예약 날짜와 시간을 한국 표준시로 해석해 비교용 밀리초로 변환합니다.
export function startsAt(booking: Pick<PreviewBooking, 'date' | 'time'>): number { return Date.parse(`${booking.date}T${booking.time}:00+09:00`); }
// [기능] endTime 함수: 예시 수업 길이 60분을 기준으로 종료 시각 문자열을 만듭니다.
export function endTime(time: string): string { return `${String(Number(time.slice(0, 2)) + 1).padStart(2, '0')}:${time.slice(3)}`; }
// [기능] dateLabel 함수: 날짜를 월.일(요일) 표시로 변환합니다.
export function dateLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}.${String(day).padStart(2, '0')}(${weekday})`;
}
// [기능] canChange 함수: 예약 상태가 예정이며 시작까지 24시간 이상 남았는지 확인합니다.
export function canChange(booking: PreviewBooking, now = previewNow): boolean { return booking.status === 'scheduled' && startsAt(booking) - Date.parse(now) >= 24 * 60 * 60 * 1000; }
// [기능] cancellationKind 함수: 취소 불가·기한 내 취소·늦은 취소를 기준 시각으로 구분합니다.
export function cancellationKind(booking: PreviewBooking, now = previewNow): 'on_time' | 'late' | 'unavailable' {
  if (booking.status !== 'scheduled' || startsAt(booking) <= Date.parse(now)) return 'unavailable';
  return canChange(booking, now) ? 'on_time' : 'late';
}
// [기능] hasPublishedTimes 함수: 유효한 날짜인지 검사하고 예시상 휴무인 일요일을 제외합니다.
export function hasPublishedTimes(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && parsed.getUTCDay() !== 0;
}
// [기능] slotState 함수: 과거·이용권 만료·휴무·마감·겹친 예약을 확인해 시간 선택 가능 상태를 반환합니다. 17시는 고정 마감 예시입니다.
export function slotState(state: BookingState, date: string, time: string, ignoreId?: string): 'available' | 'reserved' | 'full' | 'past' | 'expired' | 'closed' {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return 'closed';
  const start = startsAt({ date, time });
  if (!Number.isFinite(start) || start <= Date.parse(previewNow)) return 'past';
  if (date > passExpiresOn) return 'expired';
  if (!hasPublishedTimes(date) || !(publishedTimes as readonly string[]).includes(time)) return 'closed';
  if (time === '17:00') return 'full';
  if (state.bookings.some(b => b.id !== ignoreId && b.status === 'scheduled' && Math.abs(startsAt(b) - start) < 60 * 60 * 1000)) return 'reserved';
  return 'available';
}
// [기능] applyBookingCommand 함수: 취소·변경·신규 명령을 검증하고 성공한 경우 새 예약 상태를 반환합니다. 기존 입력 객체는 직접 수정하지 않습니다.
export function applyBookingCommand(state: BookingState, command: BookingCommand): BookingResult {
  if (command.type === 'cancel') {
    const booking = state.bookings.find(b => b.id === command.id);
    if (!booking || cancellationKind(booking) === 'unavailable') return { ok: false, message: '취소할 수 있는 예약을 확인해 주세요.' };
    const updated: PreviewBooking = { ...booking, status: cancellationKind(booking) === 'late' ? 'late_cancelled' : 'cancelled' };
    return { ok: true, booking: updated, state: { ...state, bookings: state.bookings.map(b => b.id === updated.id ? updated : b) } };
  }
  const original = command.type === 'move' ? state.bookings.find(b => b.id === command.id) : undefined;
  if (command.type === 'move' && (!original || !canChange(original))) return { ok: false, message: '일정 변경은 원래 수업 시작 24시간 전까지 가능해요.' };
  if (command.type === 'move' && original?.date === command.date && original.time === command.time) return { ok: false, message: '변경할 다른 시간을 선택해 주세요.' };
  if (command.date.slice(0, 7) < '2026-11' || command.date.slice(0, 7) > '2026-12' || slotState(state, command.date, command.time, original?.id) !== 'available') return { ok: false, message: '선택한 시간을 예약할 수 없어요. 다른 시간을 선택해 주세요.' };
  if (command.type === 'create' && availableCredits(state) < 1) return { ok: false, message: '추가 예약 가능한 횟수가 없어요.' };
  const booking: PreviewBooking = { id: original?.id ?? `preview-${state.nextId}`, date: command.date, time: command.time, status: 'scheduled' };
  return { ok: true, booking, state: { ...state, nextId: state.nextId + (original ? 0 : 1), bookings: original ? state.bookings.map(b => b.id === original.id ? booking : b) : [...state.bookings, booking] } };
}
