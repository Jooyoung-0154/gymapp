// [목적] index.ts 파일: Expo가 App 컴포넌트를 앱의 진입점으로 등록하는 파일입니다.
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
