import { readFile } from 'node:fs/promises';
import { Codex } from './codex.mjs';
import { translationTask, questionTask } from './tasks.mjs';

// Chrome Native Messaging: private stdio pipe, no localhost server or API key.
const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
const codex = new Codex(config.codex);
let ready, buffer = Buffer.alloc(0);
const running = new Map();
function send(value) {
  const body = Buffer.from(JSON.stringify(value));
  if (body.length > 1000000) { send({ id: value.id, error: '응답이 너무 큽니다.' }); return; }
  const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
  process.stdout.write(Buffer.concat([header, body]));
}
async function handle(message) {
  const { id, method, params = {} } = message;
  if (method === 'cancel') { running.get(params.id)?.abort(); return; }
  if (!Number.isSafeInteger(id) || running.has(id)) return;
  const controller = new AbortController(); running.set(id, controller);
  try {
    if (running.size > 3) throw new Error('진행 중인 요청을 먼저 완료해 주세요.');
    if (!['status', 'translate', 'ask'].includes(method)) throw new Error('지원하지 않는 요청입니다.');
    if (params.model !== undefined && (typeof params.model !== 'string' || params.model.length > 100)) throw new Error('모델 형식 오류');
    const task = method === 'translate' ? translationTask(params) : method === 'ask' ? questionTask(params) : null;
    ready ??= codex.start(); await ready; controller.signal.throwIfAborted();
    const result = task ? task.validate(JSON.parse(await codex.generate(task.prompt, task.schema, params.model, controller.signal))) : await codex.status();
    if (!controller.signal.aborted) send({ id, result });
  } catch (error) { send({ id, error: error.message || 'Codex 요청에 실패했습니다.' }); }
  finally { running.delete(id); }
}
process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (length > 1000000) { process.stdin.destroy(); void shutdown(); return; }
    if (buffer.length < length + 4) break;
    const body = buffer.subarray(4, length + 4); buffer = buffer.subarray(length + 4);
    try { void handle(JSON.parse(body.toString('utf8'))); } catch { void shutdown(); return; }
  }
});
async function shutdown() { for (const c of running.values()) c.abort(); await codex.close(); process.exit(); }
process.stdin.on('end', () => void shutdown());
process.stdin.on('error', () => void shutdown());
process.stdout.on('error', () => void shutdown());
