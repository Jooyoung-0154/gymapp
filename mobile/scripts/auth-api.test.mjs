// [목적] auth-api.test.mjs 파일: 가짜 HTTP 전송 함수로 인증 API의 요청·응답·오류 처리를 확인하는 Node 테스트입니다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthApi, ApiError } from '../src/api/authApi.ts';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('login sends cookie credentials, CSRF and a different command key each time', async () => {
  const calls = [];
  const api = createAuthApi('http://localhost:8080/', async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('/csrf') ? json({ data: { token: 'test-csrf', headerName: 'X-XSRF-TOKEN' } }) : json({ data: {} });
  });
  await api.login('01000000000', 'test-password');
  await api.logout();
  assert.equal(calls.length, 4);
  for (const { options } of calls) assert.equal(options.credentials, 'include');
  assert.equal(calls[1].url, 'http://localhost:8080/api/v1/auth/login');
  assert.equal(calls[1].options.headers['X-XSRF-TOKEN'], 'test-csrf');
  assert.deepEqual(JSON.parse(calls[1].options.body), { phone: '01000000000', password: 'test-password' });
  const key = calls[1].options.headers['Idempotency-Key'];
  assert.ok(key.length >= 20 && key.length <= 100);
  assert.notEqual(key, calls[3].options.headers['Idempotency-Key']);
});
test('unauthorized me preserves server error and performs no login retry', async () => {
  let calls = 0;
  const api = createAuthApi('http://localhost:8080', async () => {
    calls++;
    return json({ error: { code: 'UNAUTHENTICATED', message: '다시 로그인해 주세요.' } }, 401);
  });
  await assert.rejects(api.me(), e => e instanceof ApiError && e.status === 401 && e.code === 'UNAUTHENTICATED');
  assert.equal(calls, 1);
});
test('failed CSRF request never submits password', async () => {
  const urls = [];
  const api = createAuthApi('http://localhost:8080', async url => { urls.push(url); throw new Error('offline'); });
  await assert.rejects(api.login('01000000000', 'secret'), e => e.code === 'CONNECTION_FAILED');
  assert.deepEqual(urls, ['http://localhost:8080/api/v1/auth/csrf']);
});
test('invalid server response becomes a connection error', async () => {
  const api = createAuthApi('http://localhost:8080', async () => new Response('<html>error</html>'));
  await assert.rejects(api.me(), e => e.code === 'CONNECTION_FAILED');
});

test('attendance requests the selected month with the existing cookie and no command', async () => {
  let called;
  const result = { month: '2026-11', attendanceDates: [], attendanceCount: 0, memberId: '42', today: '2026-11-15', earliestMonth: '2026-11' };
  const api = createAuthApi('http://localhost:8080', async (url, options) => { called = { url, options }; return json({ data: result }); });
  assert.deepEqual(await api.attendance('2026-11'), result);
  assert.equal(called.url, 'http://localhost:8080/api/v1/me/attendance?month=2026-11');
  assert.equal(called.options.credentials, 'include');
  assert.equal(called.options.method, 'GET');
  assert.equal(called.options.body, undefined);
});
test('attendance failure is reported rather than converted into empty history', async () => {
  const api = createAuthApi('http://localhost:8080', async () => json({ error: { code: 'SERVICE_UNAVAILABLE', message: '잠시 후 다시 시도해 주세요.' } }, 503));
  await assert.rejects(api.attendance('2026-11'), e => e.status === 503 && e.code === 'SERVICE_UNAVAILABLE');
});

// 가입·승인·닉네임 설정이 같은 API와 계정 상태로 연결되는지 검증합니다.
test('registration, approval, MFA and nickname use the common API', async () => {
  const commands = [];
  const api = createAuthApi('http://localhost:8080', async (url, options) => {
    if (url.endsWith('/csrf')) return json({ data: { token: 'csrf', headerName: 'X-XSRF-TOKEN' } });
    commands.push({ path: new URL(url).pathname, body: JSON.parse(options.body) });
    return json({ data: { approvalPending: true } });
  });
  assert.equal((await api.register('01000000000', 'TestPassword123')).approvalPending, true);
  await api.approve({ accountId: '42', version: 3 });
  await api.verifyMfa('challenge', '123456');
  await api.nickname('운동회원');
  assert.deepEqual(commands, [
    { path: '/api/v1/auth/register', body: { phone: '01000000000', password: 'TestPassword123' } },
    { path: '/api/v1/admin/accounts/42/status', body: { status: 'ACTIVE', expectedVersion: 3 } },
    { path: '/api/v1/auth/mfa/verify', body: { challengeId: 'challenge', totp: '123456' } },
    { path: '/api/v1/me/nickname', body: { nickname: '운동회원' } },
  ]);
});

test('common app routes members through nickname setup and retains operator separation', async () => {
  const { accountDestination } = await import('../src/utils/authDestination.ts');
  const account = { accountId: '42', name: '', phone: '01000000000', roles: ['MEMBER'], status: 'ACTIVE', nicknameRequired: true };
  assert.equal(accountDestination(null), 'login');
  assert.equal(accountDestination(account), 'nickname');
  assert.equal(accountDestination({ ...account, nicknameRequired: false, name: '운동회원' }), 'member');
  assert.equal(accountDestination({ ...account, roles: ['OPERATOR'] }), 'operator');
  assert.equal(accountDestination({ ...account, roles: ['OPERATOR', 'MEMBER'] }), 'operator');
  assert.equal(accountDestination({ ...account, roles: ['TRAINER'] }), 'login');
});
