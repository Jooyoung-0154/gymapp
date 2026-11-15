// [목적] warmWellness.ts 파일: 공통 색상·글꼴·기준 화면 크기를 정의합니다. 여러 화면에서 가져와 디자인을 일관되게 유지합니다.
/** Figma: 03 웜 웰니스 / 9:1631. Sizes are React Native logical points. */
export const colors = {
  background: '#FAF5ED', canvas: '#EFEAE3', card: '#FFFCF7', congestion: '#F1DED0',
  primary: '#AC5137', primaryPressed: '#91422D', ink: '#3E302A', muted: '#89786B',
  readableMuted: '#79675B', border: '#E9DED2', badge: '#F7E9CC', badgeInk: '#8C652F',
  onPrimary: '#FFFDF8', scrim: 'rgba(62,48,42,0.32)',
} as const;
export const fonts = {
  regular: 'NotoSansKR_400Regular', medium: 'NotoSansKR_500Medium',
  bold: 'NotoSansKR_700Bold', number: 'Inter_500Medium',
} as const;
export const layout = {
  pageGutter: 20, cardGap: 16, cardRadius: 24, congestionRadius: 28,
  referenceWidth: 390, referenceHeight: 920,
} as const;
