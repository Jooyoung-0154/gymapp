// [목적] MemberTabs.tsx 파일: 홈·출석·예약·마이페이지 탭과 예약 예시 상태 제공자를 구성합니다. 화면을 유지해 탭 이동 후에도 화면 상태를 보존합니다.
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesignIcon } from '../components/DesignIcon';
import { HomeScreen } from '../screens/HomeScreen';
import { AttendanceScreen } from '../screens/AttendanceScreen';
import { BookingScreen, type BookingSection } from '../screens/BookingScreen';
import { MyPageScreen } from '../screens/MyPageScreen';
import { BookingPreviewProvider } from '../state/BookingPreviewContext';
import { colors, fonts } from '../theme/warmWellness';

const tabs = [
  { key: 'home', label: '홈' },
  { key: 'attendance', label: '출석' },
  { key: 'booking', label: '예약' },
  { key: 'my', label: '마이페이지' },
] as const;
// [정의] TabKey는 하단 회원 메뉴에서 선택할 수 있는 탭 이름 타입입니다.
// [구성] typeof tabs[number]['key']는 tabs 배열 각 항목의 key 값을 모은 타입입니다.
// [목적] activeTab 상태는 TabKey에 해당하는 탭 이름만 저장합니다.
type TabKey = typeof tabs[number]['key'];

/** Four top-level screens; keep mounted screens to preserve scroll position. */
export function MemberTabs({ desktopPreview }: { desktopPreview: boolean }) {
  return <BookingPreviewProvider><MemberTabContent desktopPreview={desktopPreview} /></BookingPreviewProvider>;
}

function MemberTabContent({ desktopPreview }: { desktopPreview: boolean }) {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [bookingSection, setBookingSection] = useState<BookingSection>('new');
  const insets = useSafeAreaInsets();
  const openBookings = () => { setBookingSection('mine'); setActiveTab('booking'); };

  // [처리 흐름] useEffect 콜백 처리: 안드로이드 뒤로가기는 다른 탭에서 홈으로 이동시킵니다. 탭 변경·해제 시 기존 이벤트 구독을 제거합니다.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeTab === 'home') return false;
      setActiveTab('home');
      return true;
    });
    return () => subscription.remove();
  }, [activeTab]);

  return (
    <View style={styles.screen}>
      <Text style={{ color: colors.readableMuted, textAlign: 'center', fontSize: 11, padding: 6 }}>회원정보·출석 조회 연동 · 홈 요약·이용권·예약은 예시</Text>
      {tabs.map(tab => (
        <View key={tab.key} style={[styles.screen, activeTab !== tab.key && styles.hidden]}>
          {tab.key === 'home' ? <HomeScreen onOpenBookings={openBookings} onOpenAttendance={() => setActiveTab('attendance')} onOpenMy={() => setActiveTab('my')} /> : tab.key === 'attendance' ? <AttendanceScreen /> : tab.key === 'booking' ? <BookingScreen section={bookingSection} onSectionChange={setBookingSection} /> : <MyPageScreen onOpenBookings={openBookings} />}
        </View>
      ))}
      <View style={[styles.bottomBar, { paddingBottom: desktopPreview ? 9 : Math.max(insets.bottom, 12) }]}>
        <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel="회원 메뉴">
          {tabs.map(tab => (
            <Pressable key={tab.key} accessibilityRole="tab" accessibilityLabel={tab.label}
              accessibilityState={{ selected: activeTab === tab.key }}
              onPress={() => setActiveTab(tab.key)}
              style={({ pressed }) => [styles.tab, activeTab === tab.key && styles.selected, pressed && styles.pressed]}>
              <DesignIcon name={tab.key} />
              <Text style={[styles.label, activeTab === tab.key && styles.selectedLabel]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
        {desktopPreview && <View style={styles.homeIndicator} accessible={false} />}
      </View>
    </View>
  );
}

// [구성] styles 변수: 화면 요소의 색상·크기·간격을 정의합니다. 컴포넌트의 style 속성에서 이름으로 참조합니다.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hidden: { display: 'none' },
  bottomBar: { backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, paddingHorizontal: 12, gap: 12 },
  tabs: { flexDirection: 'row', minHeight: 51 },
  tab: { flex: 1, minHeight: 51, gap: 5, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, borderRadius: 8 },
  selected: { backgroundColor: colors.card },
  pressed: { opacity: 0.72 },
  label: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 17, color: colors.readableMuted },
  selectedLabel: { fontFamily: fonts.bold, color: colors.primary },
  homeIndicator: { width: 112, height: 4, borderRadius: 100, backgroundColor: colors.ink, alignSelf: 'center' },
});


