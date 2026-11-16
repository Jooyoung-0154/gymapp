// [목적] 운영 데스크의 실제 api 함수를 실행해 토큰 갱신과 안전한 재시도 범위를 검증합니다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
const file = new URL('../server/src/main/resources/static/app.js', import.meta.url);
const source = readFileSync(file, 'utf8').split('// [목적] formHandler')[0];
function client(fetch) {
  const context = vm.createContext({ fetch, crypto: { randomUUID }, showAuth: async () => {}, document: {} });
  vm.runInContext(source + '\nthis.callApi=api;', context);
  return context.callApi;
}
const json = (payload, status=200) => new Response(JSON.stringify(payload), { status });
test('a changed cookie between registrations never reuses a cached CSRF token', async () => {
  let token = 'first-cookie', posts = 0;
  const api = client(async (url, options) => {
    if (url.endsWith('/csrf')) return json({ data: { token, headerName: 'X-XSRF-TOKEN' } });
    posts++;
    assert.equal(options.headers['X-XSRF-TOKEN'], token);
    return json({ data: { accountId: String(posts) } });
  });
  await api('/admin/members', { name: 'TEST first' });
  token = 'changed-by-another-tab';
  await api('/admin/members', { name: 'TEST second' });
  assert.equal(posts, 2);
});
test('CSRF rejection retries once using the same operation key and a fresh token', async () => {
  const keys = [], tokens = [];
  let refreshes = 0;
  const api = client(async (url, options) => {
    if (url.endsWith('/csrf')) return json({ data: { token: 'token-' + ++refreshes, headerName: 'X-XSRF-TOKEN' } });
    keys.push(options.headers['Idempotency-Key']);
    tokens.push(options.headers['X-XSRF-TOKEN']);
    return keys.length === 1 ? json({ error: { code: 'CSRF_INVALID', message: 'retry' } }, 403) : json({ data: { accountId: '42' } });
  });
  assert.equal((await api('/admin/members', { name: 'TEST' })).accountId, '42');
  assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]); assert.notEqual(tokens[0], tokens[1]);
});
test('persistent CSRF failure stops after one retry', async () => {
  let posts = 0;
  const api = client(async url => url.endsWith('/csrf') ? json({ data: { token: 't', headerName: 'X-XSRF-TOKEN' } })
    : (++posts, json({ error: { code: 'CSRF_INVALID', message: 'csrf-failed' } }, 403)));
  await assert.rejects(api('/admin/members', {}), e => e.code === 'CSRF_INVALID');
  assert.equal(posts, 2);
});
test('permission failure is never automatically retried', async () => {
  let posts = 0;
  const api = client(async url => url.endsWith('/csrf') ? json({ data: { token: 't', headerName: 'X-XSRF-TOKEN' } })
    : (++posts, json({ error: { code: 'ACCESS_DENIED', message: 'denied' } }, 403)));
  await assert.rejects(api('/admin/members', {}), e => e.code === 'ACCESS_DENIED');
  assert.equal(posts, 1);
});
test('network failure is not automatically retried', async () => {
  let posts = 0;
  const api = client(async url => {
    if (url.endsWith('/csrf')) return json({ data: { token: 't', headerName: 'X-XSRF-TOKEN' } });
    posts++; throw new Error('offline');
  });
  await assert.rejects(api('/admin/members', {}));
  assert.equal(posts, 1);
});
