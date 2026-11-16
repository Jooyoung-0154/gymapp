// [목적] StreakProgress.tsx 파일: 전달받은 연속 출석일 수를 진행 표시로 보여 주는 공통 컴포넌트입니다.
import { StyleSheet, Text, View } from 'react-native';
import { fonts } from '../theme/warmWellness';

export function StreakProgress({ days }: { days: number }) {
  const color = days <= 2 ? '#3169B6' : days <= 5 ? '#34824C' : days <= 7 ? '#9B7400' : '#C34236';
  return <View style={styles.container} accessibilityLabel={`연속 출석 ${days >= 10 ? '보상 획득' : `${days}일`}`}>
    <Text style={[styles.current, { color }]}>{days >= 10 ? '보상 획득' : `${days}일`}</Text>

  </View>;
}
// [구성] styles 변수: 화면 요소의 색상·크기·간격을 정의합니다. 컴포넌트의 style 속성에서 이름으로 참조합니다.
const styles = StyleSheet.create({
  container: { gap: 10 }, current: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 38 },
});
