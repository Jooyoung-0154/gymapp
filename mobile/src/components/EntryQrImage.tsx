// [목적] 실제 입장 토큰을 QR 인코더로 변환해 웹·앱에서 같은 QR을 표시합니다.
import { memo, useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { qrMatrix } from '../utils/qrMatrix';
export const EntryQrImage = memo(function EntryQrImage({ token }: { token: string }) {
  const qr = useMemo(() => qrMatrix(token), [token]);
  const unit = Math.max(1, Math.floor(Math.min(280, useWindowDimensions().width - 80) / (qr.size + 8)));
  const edge = unit * (qr.size + 8);
  return <View accessibilityRole="image" accessibilityLabel="입장용 일회용 QR" style={{ width: edge, height: edge, backgroundColor: '#ffffff', alignSelf: 'center' }}>
    {qr.runs.map((run, index) => <View key={index} accessible={false} style={{ position: 'absolute', top: (run.row + 4) * unit, left: (run.start + 4) * unit, width: run.length * unit, height: unit, backgroundColor: '#000000' }} />)}
  </View>;
});
