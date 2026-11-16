import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, matchRoutes } from 'react-router';
import { adminSections, selectAdminMembers, membershipDateError, adminBackTarget, formatAdminDateInput } from '../src/utils/adminNavigation.ts';
import { OperatorGate } from '../src/navigation/OperatorGate.ts';
import { MemoryRouter as NativeRouter, Routes as NativeRoutes, Route as NativeRoute, Outlet as NativeOutlet, useSearchParams as useNativeSearchParams } from '../src/navigation/router.ts';

const rows = [
  { accountId: '1', name: '', phone: '01012345678', status: 'PENDING', accountStatus: 'PENDING', version: 1 },
  { accountId: '2', name: '운동회원', phone: '01098765432', status: 'ACTIVE', accountStatus: 'ACTIVE', version: 1 },
  { accountId: '3', name: '정지회원', phone: '01011112222', status: 'SUSPENDED', accountStatus: 'SUSPENDED', version: 1 },
];
test('each administrator feature has its own matching route', () => {
  const routes = [{ path: '/admin', children: adminSections.map(section => ({ path: section.segment })) }];
  for (const section of adminSections) {
    assert.equal(matchRoutes(routes, section.path).at(-1).route.path, section.segment);
  }
  assert.equal(new Set(adminSections.map(section => section.path)).size, 5);
  assert.equal(matchRoutes(routes, '/admin/unknown'), null);
});
test('approval and membership pages display only eligible members and support search', () => {
  assert.deepEqual(selectAdminMembers(rows, 'approvals', '').map(m => m.accountId), ['1']);
  assert.deepEqual(selectAdminMembers(rows, 'memberships', '').map(m => m.accountId), ['2']);
  assert.equal(selectAdminMembers(rows, 'members', '정지회원').length, 1);
  assert.equal(selectAdminMembers(rows, 'members', '010-9876-5432').length, 1);
  assert.equal(selectAdminMembers(rows, 'members', '없는회원').length, 0);
});
test('invalid or reversed membership dates are rejected before submission', () => {
  assert.ok(membershipDateError('2026-02-30', '2026-03-01'));
  assert.ok(membershipDateError('2026-12-31', '2026-12-01'));
  assert.ok(membershipDateError('', '2026-12-01'));
  assert.equal(membershipDateError('2026-12-01', '2026-12-31'), '');
  assert.equal(membershipDateError('2026-12-01', '2026-12-01'), '');
});
test('operator gate never renders administrator children for guests or members', () => {
  for (const account of [null, { roles: ['MEMBER'] }, { roles: ['TRAINER'] }]) {
    const html = renderToString(createElement(MemoryRouter, null, createElement(OperatorGate, { account }, 'ADMIN CONTENT')));
    assert.equal(html.includes('ADMIN CONTENT'), false);
  }
  const html = renderToString(createElement(MemoryRouter, null, createElement(OperatorGate, { account: { roles: ['OPERATOR'] } }, 'ADMIN CONTENT')));
  assert.equal(html.includes('ADMIN CONTENT'), true);
});
test('native routes mount only the selected administrator page inside its layout', () => {
  for (const selected of adminSections) {
    const html = renderToString(createElement(NativeRouter, { initialEntries: [selected.path] },
      createElement(NativeRoutes, null,
        createElement(NativeRoute, { path: '/', element: 'MEMBER APP' }),
        createElement(NativeRoute, { path: '/admin', element: createElement('section', null, 'ADMIN HEADER', createElement(NativeOutlet)) },
          ...adminSections.map(item => createElement(NativeRoute, { key: item.key, path: item.segment, element: item.label }))))));
    assert.ok(html.includes('ADMIN HEADER'));
    assert.ok(html.includes(selected.label));
    assert.equal(html.includes('MEMBER APP'), false);
    for (const other of adminSections.filter(item => item.key !== selected.key)) assert.equal(html.includes(other.label), false);
  }
});
test('native membership route preserves the selected member in query parameters', () => {
  function Selection() { return useNativeSearchParams()[0].get('member'); }
  const html = renderToString(createElement(NativeRouter, { initialEntries: ['/admin/memberships?member=42'] }, createElement(Selection)));
  assert.equal(html, '42');
});
test('app back navigation returns from membership entry to its member list', () => {
  assert.equal(adminBackTarget('/admin/memberships', '?member=42'), '/admin/memberships');
  assert.equal(adminBackTarget('/admin/memberships', ''), '/');
  assert.equal(adminBackTarget('/admin/approvals', ''), '/');
  assert.equal(adminBackTarget('/admin/members', ''), '/');
});
test('numeric date entry formats partial input and accepts pasted dates', () => {
  assert.equal(formatAdminDateInput('2026'), '2026');
  assert.equal(formatAdminDateInput('202612'), '2026-12');
  assert.equal(formatAdminDateInput('20261231'), '2026-12-31');
  assert.equal(formatAdminDateInput('2026-12-31'), '2026-12-31');
  assert.equal(formatAdminDateInput(''), '');
});
