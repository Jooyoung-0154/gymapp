// [목적] QR 데이터를 검은 셀의 연속 구간으로 변환합니다. 화면에는 4칸의 흰 여백을 추가해 스캐너가 경계를 읽게 합니다.
import QRCode from '../vendor/QRCode/index.js';
export function qrMatrix(payload: string) {
  const qr = new QRCode(0, 0); // 0은 버전 자동 선택, 오류 복구 M입니다.
  qr.addData(payload); qr.make();
  const size = qr.getModuleCount();
  const runs: { row: number; start: number; length: number }[] = [];
  for (let row = 0; row < size; row++) {
    let start = -1;
    for (let col = 0; col <= size; col++) {
      const dark = col < size && qr.isDark(row, col);
      if (dark && start < 0) start = col;
      if (!dark && start >= 0) { runs.push({ row, start, length: col - start }); start = -1; }
    }
  }
  return { size, runs };
}
