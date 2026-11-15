// [목적] App.tsx 파일: 앱의 시작 화면입니다. 글꼴과 안전 영역을 준비하고, 로그인 확인 결과에 따라 로그인 화면 또는 회원 탭을 보여 줍니다.
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/state/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { MemberTabs } from './src/navigation/MemberTabs';
import { colors, layout } from './src/theme/warmWellness';

// [기능] App 함수: 글꼴 로딩이 끝나면 인증 제공자를 연결합니다. 웹의 넓은 화면에서는 휴대폰 크기 프레임을 사용합니다.
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
            : <AuthProvider><AuthenticatedApp desktop={desktop} /></AuthProvider>}
        </View>
      </View>
    </SafeAreaProvider>
  );
}
// [구성] styles 변수: 화면 요소의 색상·크기·간격을 정의합니다. 컴포넌트의 style 속성에서 이름으로 참조합니다.
const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: colors.background },
  desktopCanvas: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  frame: { width: '100%', backgroundColor: colors.background, overflow: 'hidden' },
  fullFrame: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 14, lineHeight: 24, color: colors.ink, textAlign: 'center', padding: 24 },
});

// [기능] AuthenticatedApp 함수: 세션 확인 중에는 로딩을 표시하고, 계정 유무에 따라 회원 탭과 로그인 화면을 나눕니다.
function AuthenticatedApp({ desktop }: { desktop: boolean }) {
  const { account, checking } = useAuth();
  if (checking) return <View style={styles.loading}><ActivityIndicator color={colors.primary} accessibilityLabel="로그인 확인 중" /></View>;
  return account ? <MemberTabs desktopPreview={desktop} /> : <LoginScreen />;
}
