// [목적] FeatureScreen.tsx 파일: 아직 연결되지 않은 기능에 대해 화면별 안내 내용을 표시하는 컴포넌트입니다.
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, layout } from '../theme/warmWellness';

const content = {
  attendance: { title: '출석', subtitle: '나의 출석 현황', description: '출석 달력, 출석 통계와 보상 현황을 이곳에서 확인하게 됩니다.' },
  booking: { title: '예약', subtitle: 'PT 예약', description: '주간 PT 시간표와 예약 가능한 횟수를 이곳에서 확인하게 됩니다.' },
  my: { title: '마이페이지', subtitle: '회원정보', description: '회원정보와 이용권, 설정을 이곳에서 확인하게 됩니다.' },
} as const;

export function FeatureScreen({ screen }: { screen: keyof typeof content }) {
  const insets = useSafeAreaInsets();
  const data = content[screen];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}>
      <Text accessibilityRole="header" style={styles.title}>{data.title}</Text>
      <View style={styles.card}>
        <Text style={styles.subtitle}>{data.subtitle}</Text>
        <Text style={styles.description}>{data.description}</Text>
        <Text style={styles.notice}>화면 준비 중 · 현재는 탭 이동만 지원합니다.</Text>
      </View>
    </ScrollView>
  );
}

// [구성] styles 변수: 화면 요소의 색상·크기·간격을 정의합니다. 컴포넌트의 style 속성에서 이름으로 참조합니다.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: layout.pageGutter, gap: 24 },
  title: { fontFamily: fonts.bold, fontSize: 24, color: colors.ink },
  card: { backgroundColor: colors.card, borderRadius: layout.cardRadius, padding: 24, gap: 16 },
  subtitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  description: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 24, color: colors.ink },
  notice: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 20, color: colors.readableMuted },
});
