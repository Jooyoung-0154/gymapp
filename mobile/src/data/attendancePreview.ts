import { homePreview } from './homePreview';

/** Fixed 2026-11-12 design snapshot; never infer rewards from device dates. */
export const attendancePreview = {
  snapshotDate: '2026-11-12',
  snapshotMonth: { year: 2026, month: 11 },
  earliestMonth: { year: 2026, month: 1 },
  attendanceDates: [
    '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07',
    '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14',
    '2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21',
    '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28',
    '2026-10-29', '2026-10-30',
    '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07',
    '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12',
  ],
  // Separate authoritative example summaries, NOT recalculated by the calendar.
  streakDays: homePreview.attendance.streakDays,
  daysUntilReward: homePreview.attendance.daysUntilReward,
  cumulativeRewardDays: 2,
} as const;
