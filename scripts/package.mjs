import { cp, mkdir, readFile, readdir } from 'node:fs/promises';
await mkdir('dist/cmaps', { recursive: true });
await cp('node_modules/pdfjs-dist/cmaps', 'dist/cmaps', { recursive: true });
await cp('node_modules/pdfjs-dist/standard_fonts', 'dist/standard_fonts', { recursive: true });
await cp('node_modules/pdfjs-dist/wasm', 'dist/wasm', { recursive: true });
await mkdir('dist/licenses', { recursive: true });
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path.startsWith('node_modules/') || info.dev) continue;
  const files = await readdir(path).catch((error) => {
    if (error.code === 'ENOENT' && info.optional) return [];
    throw error;
  });
  for (const file of files.filter((file) => /^licen[cs]e(?:\.|$)/i.test(file))) {
    await cp(`${path}/${file}`, `dist/licenses/${path.replaceAll('/', '_')}-${file}`);
  }
}
await cp('README.md', 'dist/README.md');
await cp('companion', 'dist/companion', { recursive: true });
console.log('Extension ready: dist/');
