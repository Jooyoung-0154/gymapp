// [목적] PreviewNotice.tsx 파일: 미리보기 동작의 안내 메시지를 모달로 표시합니다. notice가 없으면 안내를 표시하지 않습니다.
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme/warmWellness';
// [정의] PreviewMessage는 미리보기 안내창에 표시할 메시지 타입입니다.
// [구성] title은 안내 제목 문자열, message는 안내 본문 문자열입니다.
// [목적] PreviewNotice는 PreviewMessage 또는 null을 받아 안내창 표시 여부를 결정합니다.
export type PreviewMessage = { title: string; message: string };
export function PreviewNotice({ notice, onClose }: { notice: PreviewMessage | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={notice !== null} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="안내 닫기" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]} accessibilityViewIsModal accessibilityLabel={notice?.title}>
          <Text style={styles.eyebrow}>디자인 미리보기</Text>
          <Text style={styles.title} accessibilityRole="header">{notice?.title}</Text>
          <Text style={styles.message}>{notice?.message}</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>확인</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}
// [구성] styles 변수: 화면 요소의 색상·크기·간격을 정의합니다. 컴포넌트의 style 속성에서 이름으로 참조합니다.
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: colors.scrim },
  sheet: { width: '100%', maxWidth: 440, padding: 26, gap: 14, backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  eyebrow: { fontFamily: fonts.medium, fontSize: 12, color: colors.primary },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 33, color: colors.ink },
  message: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 24, color: colors.readableMuted },
  button: { minHeight: 52, backgroundColor: colors.primary, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginTop: 6 },
  buttonText: { fontFamily: fonts.bold, color: colors.onPrimary, fontSize: 15 },
  pressed: { backgroundColor: colors.primaryPressed },
});
