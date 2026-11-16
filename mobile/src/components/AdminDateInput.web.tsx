// [목적] 웹의 날짜 선택기를 사용해 날짜 형식을 직접 입력하는 부담을 줄입니다.
import type { AdminDateInputProps } from './AdminDateInput';
import { colors, fonts } from '../theme/warmWellness';
export function AdminDateInput({ label, value, onChange, disabled }: AdminDateInputProps) {
  return <input type="date" aria-label={label} value={value} onChange={event => onChange(event.target.value)} disabled={disabled} min="1900-01-01" max="2100-12-31" style={{ minHeight: 46, boxSizing: 'border-box', width: '100%', border: `1px solid ${colors.border}`, borderRadius: 10, padding: '10px 12px', color: colors.ink, fontFamily: fonts.regular, backgroundColor: colors.card, fontSize: 14 }} />;
}
