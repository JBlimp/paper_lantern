import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { getDocument, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractSentences } from '../src/layout.ts';
const path = process.argv[2];
const doc = await getDocument({ data: new Uint8Array(await readFile(path)), useSystemFonts: true }).promise;
await mkdir('artifacts', { recursive: true });
const pages = [];
for (let number = 1; number <= doc.numPages; number++) {
  const page = await doc.getPage(number), base = page.getViewport({ scale: 1 }), content = await page.getTextContent();
  const words = content.items.filter(i => 'str' in i).map((item, index) => {
    const t = Util.transform(base.transform, item.transform), height = Math.hypot(t[2], t[3]) || item.height || 10;
    return { index, str: item.str, x: t[4], y: t[5] - height, baseline: t[5], width: item.width, height, angle: Math.atan2(t[1], t[0]), font: item.fontName };
  });
  const sentences = extractSentences(words, number, base.width, 'auto', base.height);
  pages.push({ number, width: base.width, height: base.height, words, sentences });
  if (number === 1) console.log(sentences.map((s, i) => `${i + 1}: ${s.text}`).join('\n'));
}
await writeFile('artifacts/sheaf-extraction.json', JSON.stringify(pages, null, 2));
console.log('Pages', doc.numPages);
await doc.loadingTask.destroy();
