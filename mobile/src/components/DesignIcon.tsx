// [목적] DesignIcon.tsx 파일: 아이콘 이름에 맞는 원본 SVG를 표시합니다. 허용된 아이콘 이름은 타입으로 제한합니다.
import { Image } from 'expo-image';
const icons = {
  scan: { source: require('../../assets/figma/scan-line.svg'), size: 22 },
  arrow: { source: require('../../assets/figma/arrow-up-right.svg'), size: 18 },
  chevron: { source: require('../../assets/figma/chevron-right.svg'), size: 16 },
  home: { source: require('../../assets/figma/house.svg'), size: 21 },
  attendance: { source: require('../../assets/figma/calendar-check.svg'), size: 21 },
  booking: { source: require('../../assets/figma/calendar-days.svg'), size: 21 },
  my: { source: require('../../assets/figma/user-round.svg'), size: 21 },
} as const;
// [정의] IconName은 icons 객체에 등록된 아이콘 이름만 허용하는 타입입니다.
// [구성] keyof typeof icons는 icons 객체의 키를 문자열 리터럴 유니온으로 추출합니다.
// [목적] DesignIcon의 name 매개변수는 IconName을 사용해 등록되지 않은 이름을 제한합니다.
export type IconName = keyof typeof icons;
/** Original SVGs; root dimensions and colors remain unchanged. */
export function DesignIcon({ name }: { name: IconName }) {
  const icon = icons[name];
  return <Image source={icon.source} style={{ width: icon.size, height: icon.size }} contentFit="contain" accessible={false} pointerEvents="none" transition={0} />;
}
