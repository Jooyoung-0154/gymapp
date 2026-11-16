// [목적] client.ts 파일: 실행 환경별 API 서버 주소를 결정합니다. EXPO_PUBLIC_API_URL이 있으면 기본 주소보다 우선합니다. 실물 휴대폰은 PC의 접근 가능한 주소를 지정해야 합니다.
import { Platform } from 'react-native';
import { createAuthApi } from './authApi';

// Web must use the same host spelling as Expo (localhost or 127.0.0.1).
export const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL
  ?? (Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.protocol + '//' + window.location.hostname + ':8080'
    : Platform.OS === 'android' ? 'http://10.0.2.2:8080' : 'http://localhost:8080');
export const authApi = createAuthApi(apiBaseUrl);
