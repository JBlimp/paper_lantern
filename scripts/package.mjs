import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/cmaps', { recursive: true });
await cp('node_modules/pdfjs-dist/cmaps', 'dist/cmaps', { recursive: true });
await cp('node_modules/pdfjs-dist/standard_fonts', 'dist/standard_fonts', { recursive: true });
await cp('node_modules/pdfjs-dist/wasm', 'dist/wasm', { recursive: true });
await mkdir('dist/licenses', { recursive: true });
for (const name of ['pdfjs-dist', 'react', 'react-dom', 'scheduler']) {
  await cp(`node_modules/${name}/LICENSE`, `dist/licenses/${name}.txt`);
}
await cp('README.md', 'dist/README.md');
await cp('companion', 'dist/companion', { recursive: true });
console.log('Extension ready: dist/');
