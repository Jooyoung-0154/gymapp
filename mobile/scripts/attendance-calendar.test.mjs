import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarCells, shiftMonth, attendanceCount } from '../src/utils/attendanceCalendar.ts';

test('leap years include February 29 and normal years do not', () => {
  assert.equal(calendarCells({year:2024,month:2}).filter(cell=>cell.day!==null).length,29);
  assert.equal(calendarCells({year:2025,month:2}).filter(cell=>cell.day!==null).length,28);
});
test('month movement crosses years in either direction', () => {
  assert.deepEqual(shiftMonth({year:2026,month:1},-1),{year:2025,month:12});
  assert.deepEqual(shiftMonth({year:2026,month:12},1),{year:2027,month:1});
});
test('weekdays and all dates are stable across time zones', () => {
  for(const tz of ['Asia/Seoul','America/Los_Angeles','Pacific/Kiritimati']) {
    process.env.TZ=tz;
    const cells=calendarCells({year:2026,month:11});
    assert.equal(cells.length,42);
    assert.equal(cells[0].date,'2026-11-01');
    assert.equal(cells[29].date,'2026-11-30');
    assert.equal(cells[30].day,null);
  }
});
test('duplicate visits and invalid dates cannot inflate monthly counts', () => {
  assert.equal(attendanceCount(['2026-02-01','2026-02-01','2026-02-30','2026-03-01'],{year:2026,month:2}),1);
  assert.equal(attendanceCount([],{year:2026,month:11}),0);
});
test('invalid months are rejected', () => {
  assert.throws(()=>calendarCells({year:2026,month:13}),RangeError);
  assert.throws(()=>calendarCells({year:2026,month:0}),RangeError);
});
