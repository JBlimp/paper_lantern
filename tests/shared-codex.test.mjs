import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCodexBridge } from '../public/codex-bridge.js';
import { RequestQueue } from '../companion/queue.mjs';
function port() {
  const event = () => { const callbacks = []; return { addListener: f => callbacks.push(f), emit: value => callbacks.forEach(f => f(value)) }; };
  return { onMessage: event(), onDisconnect: event(), sent: [], postMessage(m) { this.sent.push(m); }, disconnect() { this.onDisconnect.emit(); } };
}
test('tabs share one host, IDs and cancellation stay isolated, last-tab close retains host', () => {
  const host = port(); let starts = 0;
  const bridge = createCodexBridge(() => { starts++; return host; });
  const a = port(), b = port(); bridge.attach(a); bridge.attach(b);
  a.onMessage.emit({ id: 1, method: 'ask' }); b.onMessage.emit({ id: 1, method: 'ask' });
  assert.equal(starts, 1); assert.notEqual(host.sent[0].id, host.sent[1].id);
  const bId = host.sent[1].id;
  a.disconnect(); assert.equal(host.sent.at(-1).params.id, host.sent[0].id);
  host.onMessage.emit({ id: bId, result: 'answer B' });
  assert.deepEqual(b.sent, [{ id: 1, result: 'answer B' }]); assert.equal(a.sent.length, 0);
  b.disconnect(); const c = port(); bridge.attach(c); assert.equal(starts, 1);
});
test('shared host failure notifies all clients and later connection starts fresh host', () => {
  const hosts = [], bridge = createCodexBridge(() => { const h = port(); hosts.push(h); return h; });
  const a = port(), b = port(); bridge.attach(a); bridge.attach(b);
  hosts[0].disconnect(); assert(a.sent[0].disconnected); assert(b.sent[0].disconnected);
  bridge.attach(port()); assert.equal(hosts.length, 2);
});
test('queue bounds concurrency and removes cancelled waiting work', async () => {
  const queue = new RequestQueue(1);
  const release = await queue.acquire(new AbortController().signal);
  const cancel = new AbortController(), waiting = queue.acquire(cancel.signal);
  const rejected = assert.rejects(waiting, /중단/); cancel.abort(); await rejected;
  let acquired = false;
  const next = queue.acquire(new AbortController().signal).then(release => { acquired = true; return release; });
  await Promise.resolve(); assert.equal(acquired, false); release(); (await next)(); assert.equal(queue.active, 0);
});

// A PDF tab can close between Chrome delivering the host disconnect and our reply.
test('a dead tab cannot prevent remaining tabs from learning the host stopped', () => {
  const host = port(), bridge = createCodexBridge(() => host);
  const closed = port(), active = port();
  bridge.attach(closed); bridge.attach(active);
  closed.postMessage = () => { throw new Error('Port closed'); };
  closed.disconnect = () => { throw new Error('Port closed'); };
  assert.doesNotThrow(() => host.disconnect());
  assert.equal(active.sent[0].disconnected, true);
});

test('PC shutdown notice reaches every tab before native relay disconnect', () => {
 const host=port(), bridge=createCodexBridge(()=>host), a=port(), b=port();bridge.attach(a);bridge.attach(b);
 host.onMessage.emit({disconnected:true,error:'PC app is off'});
 assert.equal(a.sent[0].error,'PC app is off');assert.equal(b.sent[0].error,'PC app is off');
});

test('stream progress preserves request routing until final and cancellation', () => {
 const host=port(), bridge=createCodexBridge(()=>host), a=port(), b=port();bridge.attach(a);bridge.attach(b);
 a.onMessage.emit({id:1,method:'ask'});b.onMessage.emit({id:1,method:'ask'});
 const [aid,bid]=host.sent.map(m=>m.id);
 host.onMessage.emit({id:aid,progress:{answer:'first'}});
 host.onMessage.emit({id:aid,progress:{answer:'first second'}});
 host.onMessage.emit({id:aid,result:{answer:'final',pages:[1]}});
 assert.equal(a.sent.length,3);assert.equal(b.sent.length,0);
 b.onMessage.emit({method:'cancel',params:{id:1}});
 host.onMessage.emit({id:bid,progress:{answer:'late'}});
 assert.equal(b.sent.length,0);
});
