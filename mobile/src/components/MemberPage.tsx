import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, layout } from '../theme/warmWellness';

export function MemberPage({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={styles.screen}>
    <View style={[styles.header, { paddingTop: insets.top + 8, minHeight: insets.top + 76 }]}><Text accessibilityRole="header" style={styles.gymName}>Test Gym App</Text></View>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never">
      <View style={styles.intro}><Text accessibilityRole="header" style={styles.title}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>
      {children}
      <Text style={styles.example}>디자인 미리보기 · 표시된 정보와 변경은 예시예요.</Text>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, header: { paddingHorizontal: 24, paddingBottom: 8, justifyContent: 'center', backgroundColor: '#F3E7D9', borderBottomWidth: 2, borderBottomColor: '#CBB099' },
  gymName: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 30, letterSpacing: -0.6, color: colors.ink },
  content: { paddingHorizontal: layout.pageGutter, paddingTop: 8, paddingBottom: 24, gap: 16 }, intro: { gap: 6, paddingHorizontal: 4, marginBottom: 2 },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 36, color: colors.ink, letterSpacing: -0.7 },
  subtitle: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 20, color: colors.readableMuted },
  example: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 19, color: colors.readableMuted, paddingHorizontal: 4 },
});
