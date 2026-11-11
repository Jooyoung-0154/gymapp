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
