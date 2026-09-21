import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Codex } from '../companion/codex.mjs';
const schema = { type: 'object' };
async function setup() { const c = new Codex(process.execPath, [resolve('tests/fixtures/codex-server.mjs')]); await c.start(); return c; }
test('stdio handshake, ephemeral configuration, model catalog and item completion', async () => {
  const c = await setup();
  try {
    assert.equal((await c.status()).models[0].id, 'test-model');
    assert.equal(await c.generate('normal', schema, '', new AbortController().signal), 'answer');
    assert.equal(await c.generate('tool', schema, '', new AbortController().signal), 'tool denied');
  } finally { await c.close(); }
});
test('cancel reaches an active Codex turn and subsequent work still succeeds', async () => {
  const c = await setup(), controller = new AbortController();
  try {
    const result = c.generate('hold', schema, '', controller.signal);
    const rejected = assert.rejects(result, /중단/);
    while (![...c.turns.values()].some(t => t.turnId)) await new Promise(r => setTimeout(r, 10));
    controller.abort(); await rejected;
    assert.equal(await c.generate('normal', schema, '', new AbortController().signal), 'answer');
  } finally { await c.close(); }
});
test('app-server crash rejects pending inference without hanging', async () => {
  const c = await setup();
  try { await assert.rejects(c.generate('crash', schema, '', new AbortController().signal), /종료/); }
  finally { await c.close(); }
});
