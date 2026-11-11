export type PreviewBooking = {
  id: string; date: string; time: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'late_cancelled';
  journal?: string;
};
export type BookingState = { bookings: PreviewBooking[]; remaining: number; nextId: number };
export type BookingCommand = { type: 'create'; date: string; time: string } | { type: 'move'; id: string; date: string; time: string } | { type: 'cancel'; id: string };
export type BookingResult = { ok: true; state: BookingState; booking: PreviewBooking } | { ok: false; message: string };
export const previewNow = '2026-11-12T10:00:00+09:00';
export const passExpiresOn = '2026-12-30';
export const publishedTimes = ['09:00', '11:00', '13:00', '14:00', '15:30', '17:00', '18:00'] as const;

export function initialBookingState(): BookingState {
  return { remaining: 8, nextId: 1, bookings: [
    { id: 'existing-1', date: '2026-11-14', time: '14:00', status: 'scheduled' },
    { id: 'existing-2', date: '2026-11-18', time: '18:00', status: 'scheduled' },
    { id: 'past-1', date: '2026-11-10', time: '11:00', status: 'completed', journal: '기본 스쿼트 동작과 호흡을 함께 연습했어요. 다음 수업에는 오늘 익힌 동작을 다시 확인할 예정이에요.' },
    { id: 'past-2', date: '2026-11-05', time: '14:00', status: 'completed' },
  ] };
}
export function heldCredits(state: BookingState): number { return state.bookings.filter(b => b.status === 'scheduled' || b.status === 'late_cancelled').length; }
export function availableCredits(state: BookingState): number { return state.remaining - heldCredits(state); }
export function startsAt(booking: Pick<PreviewBooking, 'date' | 'time'>): number { return Date.parse(`${booking.date}T${booking.time}:00+09:00`); }
export function endTime(time: string): string { return `${String(Number(time.slice(0, 2)) + 1).padStart(2, '0')}:${time.slice(3)}`; }
export function dateLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}.${String(day).padStart(2, '0')}(${weekday})`;
}
export function canChange(booking: PreviewBooking, now = previewNow): boolean { return booking.status === 'scheduled' && startsAt(booking) - Date.parse(now) >= 24 * 60 * 60 * 1000; }
export function cancellationKind(booking: PreviewBooking, now = previewNow): 'on_time' | 'late' | 'unavailable' {
  if (booking.status !== 'scheduled' || startsAt(booking) <= Date.parse(now)) return 'unavailable';
  return canChange(booking, now) ? 'on_time' : 'late';
}
export function hasPublishedTimes(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && parsed.getUTCDay() !== 0;
}
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
