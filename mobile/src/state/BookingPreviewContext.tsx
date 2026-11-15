// [목적] BookingPreviewContext.tsx 파일: 홈·예약·마이페이지가 같은 예시 예약 상태를 공유하게 합니다. 메모리에만 저장하므로 앱을 다시 실행하면 초기 예시로 돌아갑니다.
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { applyBookingCommand, initialBookingState, type BookingCommand, type BookingResult, type BookingState } from '../utils/bookingPreview';

// [정의] PreviewContext는 예시 예약 컨텍스트가 제공할 값의 타입입니다.
// [구성] state는 BookingState, change는 BookingCommand를 받아 BookingResult를 반환하는 함수입니다.
// [목적] 예약 화면과 마이페이지는 같은 PreviewContext의 상태를 참조합니다.
type PreviewContext = { state: BookingState; change: (command: BookingCommand) => BookingResult };
const Context = createContext<PreviewContext | null>(null);
// [기능] BookingPreviewProvider 함수: 최신 예약 예시는 ref에, 화면에 표시할 값은 state에 유지합니다. 명령 성공 때만 둘을 갱신합니다.
export function BookingPreviewProvider({ children }: { children: ReactNode }) {
  const current = useRef<BookingState>(initialBookingState());
  const [state, setState] = useState(current.current);
  const change = (command: BookingCommand): BookingResult => {
    const result = applyBookingCommand(current.current, command);
    if (result.ok) { current.current = result.state; setState(result.state); }
    return result;
  };
  return <Context.Provider value={{ state, change }}>{children}</Context.Provider>;
}
// [기능] useBookingPreview 함수: 화면에서 공통 예약 예시 상태와 변경 함수를 가져옵니다.
export function useBookingPreview() {
  const value = useContext(Context);
  if (!value) throw new Error('Booking preview provider is missing');
  return value;
}
