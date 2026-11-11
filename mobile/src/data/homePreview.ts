/** Fixed Figma example, NOT current gym information or an API response. */
export const homePreview = {
  gymName: 'Test Gym App',
  congestion: { label: '보통', people: 24, observedAtLabel: '11.12 10:00' },
  membership: { remainingDays: 49, expiresOnLabel: '2026.12.30' },
  attendance: { streakDays: 9, daysUntilReward: 1 },
  nextBooking: { timeLabel: '11.14(토) 14:00–15:00', trainerName: '이준호', reservedCredits: 1 },
} as const;
