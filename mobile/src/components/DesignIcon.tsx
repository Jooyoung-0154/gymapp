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
export type IconName = keyof typeof icons;
/** Original SVGs; root dimensions and colors remain unchanged. */
export function DesignIcon({ name }: { name: IconName }) {
  const icon = icons[name];
  return <Image source={icon.source} style={{ width: icon.size, height: icon.size }} contentFit="contain" accessible={false} pointerEvents="none" transition={0} />;
}
