import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix } from '../src/utils/qrMatrix.ts';
import { createAuthApi, makeCommandKey } from '../src/api/authApi.ts';
const json = value => new Response(JSON.stringify({ data: value }), { status: 200, headers: { 'Content-Type': 'application/json' } });
test('QR matrix encodes the token with three finder patterns and a valid module size', () => {
  const qr = qrMatrix('gymqr:' + 'A'.repeat(43));
  assert.ok(qr.size >= 21 && (qr.size - 21) % 4 === 0);
  const grid = Array.from({ length: qr.size }, () => Array(qr.size).fill(false));
  for (const run of qr.runs) for (let col = run.start; col < run.start + run.length; col++) grid[run.row][col] = true;
  for (const [top, left] of [[0, 0], [0, qr.size - 7], [qr.size - 7, 0]]) {
    for (let row = 0; row < 7; row++) for (let col = 0; col < 7; col++) {
      assert.equal(grid[top + row][left + col], row === 0 || row === 6 || col === 0 || col === 6 || (row >= 2 && row <= 4 && col >= 2 && col <= 4));
    }
  }
  assert.notDeepEqual(qr.runs, qrMatrix('gymqr:' + 'B'.repeat(43)).runs);
});
test('QR payload stays out of GET URLs and check-in retries reuse the same command key', async () => {
  const calls = [];
  const api = createAuthApi('http://localhost:8080', async (url, options) => {
    if (url.endsWith('/csrf')) return json({ token: 'csrf', headerName: 'X-XSRF-TOKEN' });
    calls.push({ url, options }); return json({ accepted: true });
  });
  await api.issueQr(); await api.qrStatus('42');
  const key = makeCommandKey(), token = 'gymqr:' + 'A'.repeat(43);
  await api.checkin('1', token, key); await api.checkin('1', token, key);
  assert.equal(calls[1].url, 'http://localhost:8080/api/v1/me/qr/42');
  for (const call of calls) assert.equal(call.url.includes(token), false);
  assert.equal(calls[2].options.headers['Idempotency-Key'], key);
  assert.equal(calls[3].options.headers['Idempotency-Key'], key);
  assert.deepEqual(JSON.parse(calls[2].options.body), { deviceId: '1', qrToken: token });
});
