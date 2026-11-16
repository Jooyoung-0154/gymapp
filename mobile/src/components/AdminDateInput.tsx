// [목적] 네이티브 환경에서 날짜를 입력받습니다. 웹에서는 달력 입력을 제공합니다.
import { TextInput } from 'react-native';
import { colors, fonts } from '../theme/warmWellness';
import { formatAdminDateInput } from '../utils/adminNavigation';
export type AdminDateInputProps = { label: string; value: string; onChange: (value: string) => void; disabled: boolean };
export function AdminDateInput({ label, value, onChange, disabled }: AdminDateInputProps) {
  return <TextInput accessibilityLabel={label} value={value} onChangeText={text => onChange(formatAdminDateInput(text))} editable={!disabled} placeholder="YYYY-MM-DD" maxLength={10} keyboardType="number-pad" autoCapitalize="none" style={{ minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, color: colors.ink, fontFamily: fonts.regular, fontSize: 16, backgroundColor: colors.card }} />;
}
