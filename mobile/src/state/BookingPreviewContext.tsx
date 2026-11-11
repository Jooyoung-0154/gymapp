import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { applyBookingCommand, initialBookingState, type BookingCommand, type BookingResult, type BookingState } from '../utils/bookingPreview';

type PreviewContext = { state: BookingState; change: (command: BookingCommand) => BookingResult };
const Context = createContext<PreviewContext | null>(null);
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
export function useBookingPreview() {
  const value = useContext(Context);
  if (!value) throw new Error('Booking preview provider is missing');
  return value;
}
