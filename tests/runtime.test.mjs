import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorHost } from '../companion/runtime.mjs';
test('tray health records omit content; pause and restart stop only monitored hosts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lantern-runtime-test-'));
  let stopped = 0, monitor;
  try {
    monitor = monitorHost(() => stopped++, root);
    monitor.update('ready', 5, 2); monitor.update(undefined, undefined, 0);
    const file = join(root, `host-${process.pid}.json`), state = JSON.parse(readFileSync(file));
    assert.equal(state.state, 'ready'); assert.equal(state.models, 5); assert.equal(state.active, 0);
    assert.deepEqual(Object.keys(state).sort(), ['active', 'models', 'pid', 'state', 'updatedAt']);
    writeFileSync(join(root, 'restart'), 'new');
    await new Promise(r => setTimeout(r, 1200)); assert.equal(stopped, 1);
    monitor.close(); assert.equal(existsSync(file), false);
    monitor = monitorHost(() => stopped++, root);
    writeFileSync(join(root, 'paused'), 'yes'); assert.equal(monitor.blocked(), true);
    await new Promise(r => setTimeout(r, 1200)); assert.equal(stopped, 2);
  } finally { monitor?.close(); rmSync(root, { recursive: true, force: true }); }
});
