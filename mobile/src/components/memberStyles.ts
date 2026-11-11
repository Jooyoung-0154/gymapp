import { StyleSheet } from 'react-native';
import { colors, fonts, layout } from '../theme/warmWellness';
export const memberStyles = StyleSheet.create({
  card: { padding: 20, borderRadius: layout.cardRadius, backgroundColor: colors.card, gap: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  wrap: { flexWrap: 'wrap' }, fill: { flex: 1 }, gap: { gap: 6 },
  title: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 24, color: colors.ink },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 20, color: colors.readableMuted },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 25, color: colors.ink },
  small: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 18, color: colors.readableMuted },
  badge: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 18, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, color: colors.primary, backgroundColor: colors.congestion, overflow: 'hidden' },
  button: { minHeight: 52, paddingHorizontal: 20, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 28, backgroundColor: colors.primary },
  buttonText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 24, color: colors.onPrimary },
  secondary: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  secondaryText: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 24, color: colors.primary },
  pressed: { opacity: 0.7 }, disabled: { opacity: 0.35 },
  divider: { height: 1, backgroundColor: colors.border },
  info: { padding: 16, gap: 8, backgroundColor: colors.congestion, borderRadius: 18 },
  number: { fontFamily: fonts.number, fontSize: 32, lineHeight: 40, color: colors.primary, letterSpacing: -1 },
  link: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 20, color: colors.primary },
  empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 12, gap: 10 },
});
