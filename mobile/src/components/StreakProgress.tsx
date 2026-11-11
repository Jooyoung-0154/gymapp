import { StyleSheet, Text, View } from 'react-native';
import { fonts } from '../theme/warmWellness';

export function StreakProgress({ days }: { days: number }) {
  const color = days <= 2 ? '#3169B6' : days <= 5 ? '#34824C' : days <= 7 ? '#9B7400' : '#C34236';
  return <View style={styles.container} accessibilityLabel={`연속 출석 ${days >= 10 ? '보상 획득' : `${days}일`}`}>
    <Text style={[styles.current, { color }]}>{days >= 10 ? '보상 획득' : `${days}일`}</Text>

  </View>;
}
const styles = StyleSheet.create({
  container: { gap: 10 }, current: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 38 },
});
