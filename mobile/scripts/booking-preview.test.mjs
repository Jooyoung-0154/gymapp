import test from 'node:test';
import assert from 'node:assert/strict';
import { initialBookingState, availableCredits, heldCredits, applyBookingCommand, cancellationKind, canChange, slotState } from '../src/utils/bookingPreview.ts';

test('consecutive reservations remain available and only reduce bookable credits', () => {
  let state = initialBookingState();
  for (const time of ['09:00', '11:00', '13:00', '15:30', '18:00']) {
    const before = availableCredits(state);
    const result = applyBookingCommand(state, { type: 'create', date: '2026-11-14', time });
    assert.equal(result.ok, true);
    state = result.state;
    assert.equal(availableCredits(state), before - 1);
    assert.equal(state.remaining, 8, 'actual debit still occurs after the scheduled end');
    assert.equal(slotState(state, '2026-11-14', time), 'reserved');
  }
  assert.equal(new Set(state.bookings.map(b => b.id)).size, state.bookings.length);
  assert.equal(heldCredits(state), 7);
});

test('adding a booking holds one credit and duplicate requests cannot hold again', () => {
  const initial = initialBookingState();
  assert.equal(availableCredits(initial), 6);
  const added = applyBookingCommand(initial, { type:'create', date:'2026-11-14', time:'13:00' });
  assert.equal(added.ok, true);
  assert.equal(availableCredits(added.state), 5);
  assert.equal(heldCredits(added.state), 3);
  assert.equal(applyBookingCommand(added.state, { type:'create', date:'2026-11-14', time:'13:00' }).ok, false);
  assert.equal(initial.bookings.length, 4);
});
test('full, existing, expired, unpublished and invalid dates are unavailable', () => {
  const state = initialBookingState();
  assert.equal(slotState(state,'2026-11-14','14:00'), 'reserved');
  assert.equal(slotState(state,'2026-11-14','17:00'), 'full');
  assert.equal(slotState(state,'2026-12-31','13:00'), 'expired');
  assert.equal(slotState(state,'2026-11-15','13:00'), 'closed');
  assert.equal(slotState(state,'2026-11-31','13:00'), 'closed');
  assert.equal(slotState(state,'2026-11-12','09:00'), 'past');
});
test('a rejected change preserves the original booking and hold', () => {
  const state = initialBookingState(), before = JSON.stringify(state);
  const result = applyBookingCommand(state, { type:'move', id:'existing-1', date:'2026-11-18', time:'18:00' });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state), before);
});
test('successful changes reuse the same booking and do not consume extra credits', () => {
  const state = initialBookingState();
  const result = applyBookingCommand(state, { type:'move', id:'existing-1', date:'2026-11-14', time:'15:30' });
  assert.equal(result.ok, true);
  assert.equal(result.booking.id, 'existing-1');
  assert.equal(result.state.bookings.length, state.bookings.length);
  assert.equal(availableCredits(result.state), 6);
  assert.equal(slotState(result.state,'2026-11-14','14:00'), 'available');
});
test('the exact 24 hour cancellation boundary is on time', () => {
  const booking = { id:'boundary', date:'2026-11-13', time:'10:00', status:'scheduled' };
  assert.equal(cancellationKind(booking,'2026-11-12T10:00:00+09:00'), 'on_time');
  assert.equal(cancellationKind(booking,'2026-11-12T10:00:00.001+09:00'), 'late');
  assert.equal(canChange(booking,'2026-11-12T10:00:00.001+09:00'), false);
  assert.equal(cancellationKind(booking,'2026-11-13T10:00:00+09:00'), 'unavailable');
});
test('on-time cancellation releases a hold, while late cancellation keeps it', () => {
  const state = initialBookingState();
  const onTime = applyBookingCommand(state, {type:'cancel',id:'existing-1'});
  assert.equal(onTime.ok,true);
  assert.equal(availableCredits(onTime.state),7);
  const added = applyBookingCommand(state,{type:'create',date:'2026-11-12',time:'13:00'});
  const late = applyBookingCommand(added.state,{type:'cancel',id:added.booking.id});
  assert.equal(late.ok,true);
  assert.equal(late.booking.status,'late_cancelled');
  assert.equal(availableCredits(late.state),5);
});
test('zero available credits and out-of-window booking attempts are rejected', () => {
  const state = {...initialBookingState(), remaining:2};
  assert.equal(applyBookingCommand(state,{type:'create',date:'2026-11-14',time:'13:00'}).ok,false);
  assert.equal(applyBookingCommand(initialBookingState(),{type:'create',date:'2027-01-02',time:'13:00'}).ok,false);
});
