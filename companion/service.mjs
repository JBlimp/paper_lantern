import { createServer } from 'node:net';
import { Codex } from './codex.mjs';
import { createLibrary } from './library.mjs';
import { RequestQueue } from './queue.mjs';
import { translationTask, questionTask } from './tasks.mjs';
import { documentTranslationTask } from './documentTranslation.mjs';
import { decoder, frame, VERSION, PROTOCOL } from './ipc.mjs';

// Owned exclusively by the PC app. All Chrome profiles share this engine.
export function createService(
  config,
  { makeCodex = () => new Codex(config.codex), library = createLibrary(), onState = () => {} } = {},
) {
  let codex = makeCodex(),
    ready,
    stopping = false,
    models = 0;
  const clients = new Set(),
    queue = new RequestQueue(2);
  const report = (state = 'ready') =>
    onState({
      state,
      models,
      clients: clients.size,
      active: [...clients].reduce((n, c) => n + c.running.size, 0),
      version: VERSION,
      pid: process.pid,
    });
  async function startCodex() {
    if (!ready || codex.closed) {
      const previous = codex,
        restarting = codex.closed;
      if (restarting) codex = makeCodex();
      const instance = codex;
      ready = (async () => {
        if (restarting) await previous.close();
        await instance.start();
      })().catch(async (error) => {
        await instance.close();
        throw error;
      });
    }
    await ready;
  }
  const server = createServer((socket) => {
    const client = { socket, running: new Map() };
    clients.add(client);
    report();
    const send = (message) => {
      if (!socket.destroyed) socket.write(frame(message));
    };
    async function handle(message) {
      const { id, method, params = {} } = message;
      if (method === 'cancel') {
        client.running.get(params.id)?.abort();
        return;
      }
      if (!Number.isSafeInteger(id) || client.running.has(id)) return;
      const controller = new AbortController();
      client.running.set(id, controller);
      report();
      try {
        if (stopping) throw new Error('PC 프로그램이 종료 중입니다.');
        if ([...clients].reduce((n, c) => n + c.running.size, 0) > 100)
          throw new Error('대기 중인 요청이 많습니다.');
        let result;
        if (
          ['libraryOpen', 'libraryBegin', 'libraryChunk', 'libraryFinish', 'libraryCancel'].includes(method)
        ) {
          result = await library.handle(method, params);
        } else if (method === 'health') {
          if (codex.closed) throw new Error('Codex 연결이 종료되었습니다. 다시 연결해 주세요.');
          result = { state: 'ready', serverPid: process.pid, companionVersion: VERSION };
        } else {
          if (!['status', 'translate', 'translateDocument', 'ask'].includes(method))
            throw new Error('지원하지 않는 요청입니다.');
          if (params.model !== undefined && (typeof params.model !== 'string' || params.model.length > 100))
            throw new Error('모델 형식 오류');
          const task =
            method === 'ask'
              ? questionTask(params)
              : method === 'translateDocument'
                ? documentTranslationTask(params)
                : method === 'translate'
                  ? translationTask(params)
                  : null;
          await startCodex();
          controller.signal.throwIfAborted();
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
            result = {
              ...(await codex.status()),
              protocolVersion: PROTOCOL,
              companionVersion: VERSION,
              serverPid: process.pid,
            };
            models = result.models.length;
          }
        }
        if (!controller.signal.aborted) send({ id, result });
      } catch (error) {
        if (!controller.signal.aborted) send({ id, error: error.message || '요청에 실패했습니다.' });
      } finally {
        client.running.delete(id);
        report();
      }
    }
    socket.on(
      'data',
      decoder(
        (message) => {
          void handle(message).catch(() => socket.destroy());
        },
        () => socket.destroy(),
      ),
    );
    socket.on('error', () => socket.destroy());
    socket.on('close', () => {
      clients.delete(client);
      for (const c of client.running.values()) c.abort();
      report();
    });
  });
  return {
    async listen(path) {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(path, () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      report();
    },
    async close() {
      if (stopping) return;
      stopping = true;
      for (const client of clients) {
        for (const c of client.running.values()) c.abort();
        client.socket.destroy();
      }
      await Promise.allSettled([new Promise((r) => server.close(r)), codex.close(), library.close()]);
    },
  };
}
