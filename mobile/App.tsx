import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MemberTabs } from './src/navigation/MemberTabs';
import { colors, layout } from './src/theme/warmWellness';

export default function App() {
  const [loaded, error] = useFonts({
    NotoSansKR_400Regular: require('@expo-google-fonts/noto-sans-kr/400Regular/NotoSansKR_400Regular.ttf'),
    NotoSansKR_500Medium: require('@expo-google-fonts/noto-sans-kr/500Medium/NotoSansKR_500Medium.ttf'),
    NotoSansKR_700Bold: require('@expo-google-fonts/noto-sans-kr/700Bold/NotoSansKR_700Bold.ttf'),
    Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  });
  const window = useWindowDimensions();
  const desktop = Platform.OS === 'web' && window.width >= 600;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={[styles.canvas, desktop && styles.desktopCanvas]}>
        <View style={[styles.frame, !desktop && styles.fullFrame, desktop && { width: layout.referenceWidth, height: Math.min(layout.referenceHeight, window.height - 48), flexShrink: 0, borderRadius: 28, borderWidth: 1, borderColor: colors.border }]}>
          {!loaded && !error ? <View style={styles.loading}><ActivityIndicator color={colors.primary} accessibilityLabel="화면 준비 중" /></View>
            : error ? <View style={styles.loading}><Text style={styles.error}>글꼴을 준비하지 못했어요.{'\n'}앱을 다시 열어 주세요.</Text></View>
            : <MemberTabs desktopPreview={desktop} />}
        </View>
      </View>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.background },
  desktopCanvas: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  frame: { width: '100%', backgroundColor: colors.background, overflow: 'hidden' },
  fullFrame: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 14, lineHeight: 24, color: colors.ink, textAlign: 'center', padding: 24 },
});
