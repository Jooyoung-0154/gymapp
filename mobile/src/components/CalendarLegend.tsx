// [목적] CalendarLegend.tsx 파일: 달력의 오늘·출석 표시 의미와 공통 표시 스타일을 정의합니다.
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme/warmWellness';

export function CalendarLegend() {
  return <View style={marks.legend}>
    <View style={marks.item}><View style={marks.symbol} /><Text style={marks.label}>출석</Text></View>
    <View style={marks.item}><View style={[marks.symbol, marks.filledSymbol]} /><Text style={marks.label}>오늘</Text></View>
  </View>;
}
// [구성] marks 변수: 화면 요소의 색상·크기·간격을 정의합니다. 컴포넌트의 style 속성에서 이름으로 참조합니다.
export const marks = StyleSheet.create({
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 18, alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  item: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  symbol: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.primary },
  filledSymbol: { backgroundColor: '#FF2020', borderColor: '#FF2020' },
  label: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 18, color: colors.readableMuted },
  attended: { borderWidth: 2, borderColor: colors.primary, backgroundColor: 'transparent' },
  today: { borderWidth: 2, borderColor: '#FF2020', backgroundColor: '#FF2020' },
  todayNumber: { color: colors.onPrimary },
});
