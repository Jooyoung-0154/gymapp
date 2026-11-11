export const memberPreview = {
  name: '김하늘', phone: '010-2486-4826', maskedPhone: '010-****-4826', memberNumber: 'GYM-00124',
  trainer: '이준호', trainerInitial: '준', gym: 'Test Gym App',
  membership: { startsOn: '2026.10.01', expiresOn: '2026.12.30', remainingDays: 49 },
  pt: { label: '개인 PT 12회권', startsOn: '2026-11-01', expiresOn: '2026-12-30', remaining: 8 },
  snapshotTime: '2026-11-12T10:00:00+09:00',
  news: [
    { id: 'news-1', title: '11월 시설 이용 안내', category: '공지', date: '2026.11.01', body: '운동 기구 사용 후에는 원판과 소도구를 제자리에 정리해 주세요. 모두가 편안한 공간을 함께 만들어요.' },
    { id: 'news-2', title: '운동 전, 가볍게 몸을 풀어 주세요', category: '운동팁', date: '2026.11.05', body: '본 운동에 앞서 가벼운 움직임으로 준비해 주세요. 오늘 수업에 필요한 준비 운동은 담당 트레이너와 함께 확인하세요.' },
  ],
  notifications: [
    { id: 'notice-1', title: '다음 PT 일정을 확인해 주세요', date: '11.12 09:00', body: '11월 14일 토요일 14:00, 이준호 트레이너와의 개인 PT가 예정되어 있어요.' },
    { id: 'notice-2', title: '새로운 수업 일지가 도착했어요', date: '11.10 12:10', body: '11월 10일 완료한 PT의 일지를 마이페이지에서 확인할 수 있어요.' },
  ],
} as const;
