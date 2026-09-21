import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

export const VERSION = '0.6.2';
export const PROTOCOL = 9;
export const dataRoot = () => resolve(process.env.LOCALAPPDATA || '.', 'PaperLantern');
export function pipeName(root = dataRoot()) {
  const key = createHash('sha256').update(resolve(root).toLowerCase()).digest('hex').slice(0, 24);
  return process.platform === 'win32' ? `\\\\.\\pipe\\paper-lantern-${key}` : join(root, 'app.sock');
}
export function frame(value) {
  const body = Buffer.from(JSON.stringify(value));
  if (body.length > 1000000) throw new Error('응답이 너무 큽니다.');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}
export function decoder(onMessage, onError) {
  let buffer = Buffer.alloc(0),
    failed = false;
  return (chunk) => {
    if (failed) return;
    buffer = Buffer.concat([buffer, chunk]);
    try {
      while (buffer.length >= 4) {
        const size = buffer.readUInt32LE(0);
        if (size > 2000000 || size === 0) throw new Error('메시지 크기 오류');
        if (buffer.length < size + 4) break;
        const body = buffer.subarray(4, size + 4);
        buffer = buffer.subarray(size + 4);
        onMessage(JSON.parse(body.toString('utf8')));
      }
    } catch (error) {
      failed = true;
      onError(error);
    }
  };
}
