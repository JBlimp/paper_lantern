import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createService } from './service.mjs';
import { dataRoot, pipeName } from './ipc.mjs';
const root = dataRoot(),
  runtime = join(root, 'runtime'),
  stateFile = join(runtime, 'service.json');
await mkdir(runtime, { recursive: true });
const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
let lastState = {},
  stopped = false,
  publishing = Promise.resolve();
const publish = () => {
  publishing = publishing
    .then(() => writeFile(stateFile, JSON.stringify({ ...lastState, updatedAt: Date.now() })))
    .catch(() => {});
};
const service = createService(config, {
  onState: (state) => {
    lastState = state;
    publish();
  },
});
async function shutdown() {
  if (stopped) return;
  stopped = true;
  clearInterval(timer);
  await service.close();
  await publishing;
  await rm(stateFile, { force: true });
  process.exit();
}
const timer = setInterval(publish, 1500);
// EOF is the ownership contract: closing/crashing the PC app ends the service.
process.stdin.on('end', () => void shutdown());
process.stdin.on('error', () => void shutdown());
process.stdin.resume();
process.on('SIGTERM', () => void shutdown());
try {
  await service.listen(pipeName(root));
} catch (error) {
  console.error(error.message);
  await shutdown();
}
