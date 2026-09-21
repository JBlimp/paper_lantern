import { mkdir, mkdtemp, appendFile, writeFile, rm } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const scripts = dirname(fileURLToPath(import.meta.url));
export function createLibrary(root = join(process.env.LOCALAPPDATA || '.', 'PaperLantern', 'library')) {
  const uploads = new Map();
  async function discard(id) {
    const item = uploads.get(id);
    if (!item) return;
    uploads.delete(id);
    clearTimeout(item.timer);
    await rm(item.dir, { recursive: true, force: true });
  }
  return {
    async handle(method, params) {
      if (method === 'libraryOpen') {
        await mkdir(root, { recursive: true });
        await writeFile(join(root, 'show-window'), 'show');
        return { opened: true };
      }
      if (method === 'libraryBegin') {
        if (
          uploads.size >= 3 ||
          typeof params.name !== 'string' ||
          params.name.length > 240 ||
          basename(params.name) !== params.name ||
          /[<>:"/\\|?*\x00-\x1f]/.test(params.name) ||
          !/\.pdf$/i.test(params.name) ||
          !Number.isSafeInteger(params.size) ||
          params.size < 5 ||
          params.size > 100 * 1024 * 1024
        )
          throw new Error('100MB 이하의 PDF를 추가해 주세요.');
        const dir = await mkdtemp(join(tmpdir(), 'paper-lantern-import-')),
          id = crypto.randomUUID();
        uploads.set(id, {
          dir,
          path: join(dir, params.name),
          size: params.size,
          received: 0,
          timer: setTimeout(() => void discard(id), 600000),
        });
        return { id };
      }
      const item = uploads.get(params.id);
      if (!item) throw new Error('파일 전송이 만료되었습니다. 다시 추가해 주세요.');
      if (method === 'libraryCancel') {
        await discard(params.id);
        return {};
      }
      if (method === 'libraryChunk') {
        if (
          typeof params.data !== 'string' ||
          params.data.length > 400000 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(params.data) ||
          params.offset !== item.received
        )
          throw new Error('파일 전송 순서를 확인하지 못했습니다.');
        const bytes = Buffer.from(params.data, 'base64');
        if (item.received + bytes.length > item.size) throw new Error('파일 크기가 맞지 않습니다.');
        await appendFile(item.path, bytes);
        item.received += bytes.length;
        return {};
      }
      if (method !== 'libraryFinish') throw new Error('지원하지 않는 라이브러리 요청입니다.');
      if (item.received !== item.size) throw new Error('파일 전송이 완료되지 않았습니다.');
      try {
        await mkdir(root, { recursive: true });
        return await new Promise((resolve, reject) => {
          const child = spawn(
            'powershell.exe',
            [
              '-NoProfile',
              '-ExecutionPolicy',
              'Bypass',
              '-File',
              join(scripts, 'library-import.ps1'),
              '-SourcePath',
              item.path,
              '-LibraryRoot',
              root,
            ],
            { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
          );
          let out = '',
            err = '';
          child.stdout.on('data', (d) => (out += d));
          child.stderr.on('data', (d) => (err += d));
          child.on('error', reject);
          child.on('exit', (code) => {
            if (code !== 0) reject(new Error(err.trim() || '라이브러리에 추가하지 못했습니다.'));
            else {
              try {
                resolve(JSON.parse(out.replace(/^\uFEFF/, '')));
              } catch {
                reject(new Error('라이브러리 응답 오류'));
              }
            }
          });
        });
      } finally {
        await discard(params.id);
      }
    },
    async close() {
      await Promise.all([...uploads.keys()].map(discard));
    },
  };
}
