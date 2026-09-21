import { createLibrary } from './library.mjs';
import { documentTranslationTask } from './documentTranslation.mjs';
import { readFile } from 'node:fs/promises';
import { Codex } from './codex.mjs';
import { translationTask, questionTask } from './tasks.mjs';
import { monitorHost } from './runtime.mjs';
import { RequestQueue } from './queue.mjs';

// Chrome Native Messaging: private stdio pipe, no localhost server or API key.
const library = createLibrary();
const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
let codex = new Codex(config.codex);
const monitor = monitorHost(() => void shutdown());
monitor.launchTray();
let ready,
  buffer = Buffer.alloc(0);
const running = new Map();
const queue = new RequestQueue(2);
let statusPromise,
  statusAt = 0;
function send(value) {
  const body = Buffer.from(JSON.stringify(value));
  if (body.length > 1000000) {
    send({ id: value.id, error: '응답이 너무 큽니다.' });
    return;
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  process.stdout.write(Buffer.concat([header, body]));
}
async function handle(message) {
  const { id, method, params = {} } = message;
  if (method === 'cancel') {
    running.get(params.id)?.abort();
    return;
  }
  if (!Number.isSafeInteger(id) || running.has(id)) return;
  const controller = new AbortController();
  running.set(id, controller);
  try {
    if (running.size > 100) throw new Error('대기 중인 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    if (['libraryOpen', 'libraryBegin', 'libraryChunk', 'libraryFinish', 'libraryCancel'].includes(method)) {
      send({ id, result: await library.handle(method, params) });
      return;
    }
    if (!['health', 'status', 'translate', 'ask', 'translateDocument'].includes(method))
      throw new Error('지원하지 않는 요청입니다.');
    if (params.model !== undefined && (typeof params.model !== 'string' || params.model.length > 100))
      throw new Error('모델 형식 오류');
    const task =
      method === 'translateDocument'
        ? documentTranslationTask(params)
        : method === 'translate'
          ? translationTask(params)
          : method === 'ask'
            ? questionTask(params)
            : null;
    if (monitor.blocked())
      throw new Error(
        '연결 프로그램이 트레이에서 종료되었습니다. 시작 메뉴의 Paper Lantern을 실행한 뒤 다시 연결해 주세요.',
      );
    if (method === 'health') {
      if (!ready || codex.closed || stopping)
        throw new Error('Codex 연결이 종료되었습니다. 다시 연결해 주세요.');
      send({ id, result: { state: 'ready', serverPid: process.pid } });
      return;
    }
    if (codex.closed) {
      const old = codex;
      codex = new Codex(config.codex);
      ready = undefined;
      statusPromise = null;
      await old.close();
    }
    if (!ready) {
      const instance = codex;
      ready = instance.start().catch(async (error) => {
        await instance.close();
        throw error;
      });
    }
    await ready;
    controller.signal.throwIfAborted();
    monitor.update('ready', undefined, running.size);
    let result;
    if (task) {
      const release = await queue.acquire(controller.signal);
      try {
        result = task.validate(
          JSON.parse(
            await codex.generate(
              task.prompt,
              task.schema,
              params.model,
              controller.signal,
              params.systemPrompt,
              method === 'translateDocument' ? 'low' : undefined,
              method === 'translateDocument' ? 900000 : 180000,
              task.images,
            ),
          ),
        );
      } finally {
        release();
      }
    } else {
      if (!statusPromise || Date.now() - statusAt > 60000) {
        statusAt = Date.now();
        statusPromise = codex.status().catch((error) => {
          statusPromise = null;
          throw error;
        });
      }
      result = {
        ...(await statusPromise),
        protocolVersion: 8,
        companionVersion: '0.5.2',
        serverPid: process.pid,
      };
      monitor.update('ready', result.models.length, running.size);
    }
    if (!controller.signal.aborted) send({ id, result });
  } catch (error) {
    monitor.update('error');
    send({ id, error: error.message || 'Codex 요청에 실패했습니다.' });
  } finally {
    running.delete(id);
    monitor.update(undefined, undefined, running.size);
  }
}
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (length > 2000000) {
      process.stdin.destroy();
      void shutdown();
      return;
    }
    if (buffer.length < length + 4) break;
    const body = buffer.subarray(4, length + 4);
    buffer = buffer.subarray(length + 4);
    try {
      void handle(JSON.parse(body.toString('utf8')));
    } catch {
      void shutdown();
      return;
    }
  }
});
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  monitor.close();
  for (const controller of running.values()) controller.abort();
  try {
    await Promise.allSettled([codex.close(), library.close()]);
  } finally {
    process.exit();
  }
}
process.stdin.on('end', () => void shutdown());
process.stdin.on('error', () => void shutdown());
process.stdout.on('error', () => void shutdown());
