// [정의] 함께 포함된 MIT QRCode 인코더의 사용 범위입니다.
declare class QRCode {
  constructor(typeNumber: number, errorCorrectLevel: number);
  addData(data: string): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, column: number): boolean;
}
export = QRCode;
