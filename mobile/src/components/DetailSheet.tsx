import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme/warmWellness';

export function DetailSheet({ visible, title, onClose, children, footer }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="상세 안내 닫기" onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.handle} accessible={false} />
        <View style={styles.heading}><View style={styles.titleArea}><Text style={styles.eyebrow}>Test Gym App · 미리보기</Text><Text accessibilityRole="header" style={styles.title}>{title}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>{children}</ScrollView>
        {footer && <View style={styles.footer}>{footer}</View>}
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 440, maxHeight: '90%', backgroundColor: colors.background, borderRadius: 28, paddingHorizontal: 24, paddingTop: 10 },
  handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  heading: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 20 }, titleArea: { flex: 1, gap: 5 },
  eyebrow: { fontFamily: fonts.medium, fontSize: 11, color: colors.primary }, title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 33, color: colors.ink },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderRadius: 22 }, closeText: { fontSize: 26, color: colors.readableMuted },
  body: { gap: 16, paddingBottom: 12 }, footer: { paddingTop: 16, gap: 10 },
});
