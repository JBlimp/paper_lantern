// Chrome launches this transport only. It never starts the PC app or Codex.
import { connect } from 'node:net';
import { pipeName, frame } from './ipc.mjs';
const socket = connect(pipeName());
let closed = false;
function finish() {
  if (closed) return;
  closed = true;
  socket.destroy();
  process.stdin.pause();
  process.stdout.write(
    frame({
      disconnected: true,
      error: 'PC 프로그램이 실행 중이 아닙니다. 시작 메뉴에서 Paper Lantern을 실행해 주세요.',
    }),
    () => process.exit(),
  );
  setTimeout(() => process.exit(), 500).unref();
}
socket.once('connect', () => {
  process.stdin.pipe(socket);
  socket.pipe(process.stdout, { end: false });
});
socket.on('error', finish);
socket.on('close', finish);
process.stdin.on('end', () => {
  socket.end();
});
process.stdin.on('error', finish);
process.stdout.on('error', () => process.exit());
