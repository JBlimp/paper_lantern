import type { Word } from './layout.ts';

export type Rect = { x: number; y: number; width: number; height: number };
export type PageText = { words: Word[]; width: number; height: number };
export type BodyProfile = { bodyHeight: number; repeatedMargins: Set<string> };
export type BodyContext = { profile?: BodyProfile; graphics?: Rect[]; taggedExcluded?: Set<number> };
type Row = Rect & { words: Word[]; text: string; font?: string };

function median(values: number[], fallback = 10) {
  return values.length ? [...values].sort((a,b) => a-b)[Math.floor(values.length / 2)] : fallback;
}
export function textRows(words: Word[]): Row[] {
  const bands: Word[][] = [];
  for (const word of words.filter(w => w.str.trim()).sort((a,b) => a.y-b.y || a.x-b.x)) {
    let band = bands.findLast(b => Math.abs((b[0].baseline ?? b[0].y+b[0].height) - (word.baseline ?? word.y+word.height)) < Math.max(b[0].height, word.height) * .45);
    if (!band) { band = []; bands.push(band); }
    band.push(word);
  }
  const rows: Row[] = [];
  for (const band of bands) {
    let group: Word[] = [];
    const flush = () => {
      if (!group.length) return;
      const x = Math.min(...group.map(w => w.x)), y = Math.min(...group.map(w => w.y));
      rows.push({ words: group, text: group.map(w => w.str).join(' ').replace(/\s+/g, ' ').trim(), x, y, width: Math.max(...group.map(w => w.x+w.width))-x, height: median(group.map(w => w.height)), font: group[0].font });
      group = [];
    };
    for (const word of band.sort((a,b) => a.x-b.x)) {
      const prev = group.at(-1);
      if (prev && word.x-prev.x-prev.width > Math.max(prev.height,word.height)*2.2) flush();
      group.push(word);
    }
    flush();
  }
  return rows.sort((a,b) => a.y-b.y || a.x-b.x);
}
function marginKey(row: Row, page: PageText) {
  if (!Number.isFinite(page.height)) return '';
  const band = row.y < page.height * .12 ? 'top' : row.y > page.height * .86 ? 'bottom' : '';
  if (!band) return '';
  const normalized = row.text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  return `${band}:${Math.round(row.y/page.height*50)}:${normalized}`;
}
export function buildBodyProfile(pages: PageText[]): BodyProfile {
  const weights = new Map<number, number>(), margins = new Map<string, Set<number>>();
  pages.forEach((page, index) => {
    const rows = textRows(page.words.filter(w => Math.abs(w.angle ?? 0) < .1));
    for (const row of rows) {
      if (row.text.length > 40 && /[a-z]{3}/i.test(row.text)) {
        const size = Math.round(row.height*2)/2;
        weights.set(size, (weights.get(size) ?? 0) + row.text.length);
      }
      const key = marginKey(row, page);
      if (key) { if (!margins.has(key)) margins.set(key, new Set()); margins.get(key)!.add(index); }
    }
  });
  const bodyHeight = [...weights.entries()].sort((a,b) => b[1]-a[1])[0]?.[0] ?? 10;
  return { bodyHeight, repeatedMargins: new Set([...margins].filter(([, ids]) => ids.size >= Math.max(2, Math.ceil(pages.length * .3))).map(([key]) => key)) };
}
function intersects(a: Rect, b: Rect, pad = 0) {
  return a.x <= b.x+b.width+pad && a.x+a.width >= b.x-pad && a.y <= b.y+b.height+pad && a.y+a.height >= b.y-pad;
}
function isCaption(row: Row, graphics: Rect[], bodyHeight: number) {
  const match = /^(?:fig(?:ure)?\.?|table|plate|scheme|그림|표)\s*(?:\d+[a-z]?|[IVX]+)\b\s*(.*)$/i.exec(row.text);
  if (!match) return false;
  // A paragraph discussing a figure is still body text.
  if (/^(?:shows?|illustrates?|demonstrates?|presents?|compares?|summari[sz]es?|reports?|depicts?|provides?|is|was|contains?|lists?)\b/i.test(match[1])) return false;
  return /^[.:\-–—(]/.test(match[1]) || row.height < bodyHeight * .95 || graphics.some(g => intersects(g, row, bodyHeight*4));
}
export function filterBody(page: PageText, context: BodyContext = {}): { words: Word[]; excluded: Map<number, string> } {
  const profile = context.profile ?? buildBodyProfile([page]);
  const bodyHeight = profile.bodyHeight;
  const graphics = context.graphics ?? [];
  const excluded = new Map<number, string>();
  const exclude = (words: Word[], reason: string) => words.forEach(w => excluded.set(w.index, reason));
  for (const word of page.words) {
    if (Math.abs(word.angle ?? 0) > .1) excluded.set(word.index, 'rotated annotation');
    if (context.taggedExcluded?.has(word.index)) excluded.set(word.index, 'PDF structure: non-body');
  }
  const rows = textRows(page.words.filter(w => !excluded.has(w.index)));
  for (const row of rows) {
    const margin = Number.isFinite(page.height) && (row.y < page.height*.12 || row.y > page.height*.86);
    if (margin && (row.y < page.height*.1 || row.y > page.height*.92) && row.height <= bodyHeight*1.1 && profile.repeatedMargins.has(marginKey(row, page))) exclude(row.words, 'repeated header/footer');
    if (margin && !rows.some(r => r !== row && /[a-z]/i.test(r.text) && row.y <= r.y+r.height*.3 && r.y-row.y < bodyHeight && row.x >= r.x-bodyHeight && row.x <= r.x+r.width+bodyHeight) && /^(?:[-–—]?\s*\d+\s*[-–—]?|page\s+\d+(?:\s+of\s+\d+)?)$/i.test(row.text)) exclude(row.words, 'page number');
    if (margin && /^(?:arxiv\s*:|preprint(?:\s+submitted)?\b|©|copyright\s+\d|https?:\/\/arxiv\.)/i.test(row.text)) exclude(row.words, 'margin metadata');
  }
  // Geometric evidence works even if the graph uses the same font as the body,
  // or has no caption. Ignore whole-page backgrounds and scanned-page images.
  for (const graphic of graphics) {
    if (graphic.width*graphic.height > page.width*page.height*.65) continue;
    const enclosedProse = rows.filter(row => row.text.length > 60 && row.height >= bodyHeight*.95 && intersects(graphic, { x: row.x+row.width/2, y: row.y+row.height/2, width: 0, height: 0 }));
    const hasCaption = rows.some(row => isCaption(row, graphics, bodyHeight) && intersects(graphic, row, bodyHeight*5));
    // A bordered theorem or shaded prose callout is not automatically a figure.
    if (!hasCaption && enclosedProse.length >= 2 && enclosedProse.reduce((n,row) => n+row.text.length,0) >= 160) continue;
    for (const row of rows) {
      const center = { x: row.x+row.width/2, y: row.y+row.height/2, width: 0, height: 0 };
      if (intersects(graphic, center)) exclude(row.words, 'inside figure/table');
      else if (row.text.length < 45 && row.width < graphic.width*.8 && intersects(graphic, row, bodyHeight*1.7)) exclude(row.words, 'figure label');
    }
  }
  const captions = rows.filter(row => isCaption(row, graphics, bodyHeight));
  for (const caption of captions) {
    exclude(caption.words, 'caption');
    let end = caption;
    // Follow caption continuation in the same column, never a neighbouring column.
    for (const row of rows.filter(r => r.y > caption.y && Math.abs(r.x-caption.x) < bodyHeight*2)) {
      const gap = row.y-end.y;
      if (gap > end.height*1.7 || Math.abs(row.height-caption.height) > bodyHeight*.12 || isCaption(row, graphics, bodyHeight)) break;
      if (/[.!?]\s*$/.test(end.text) && gap > end.height*1.3 && /^[A-Z]/.test(row.text)) break;
      exclude(row.words, 'caption continuation'); end = row;
    }
    // Fallback for untagged vector figures whose drawing operators aren't
    // available: short label rows bounded by a caption and the nearest prose.
    const preceding = rows.filter(r => r.y < caption.y && r.x >= caption.x-bodyHeight*2 && r.x < caption.x+Math.max(caption.width, page.width*.35)).sort((a,b) => b.y-a.y);
    for (const row of preceding) {
      if (caption.y-row.y > page.height*.32 || row.text.length > 65 || row.height >= bodyHeight*.98) break;
      exclude(row.words, 'caption-adjacent labels');
    }
  }
  // Small font alone is deliberately not an exclusion: footnotes and inline
  // formulas are often valid prose. Unknown blocks stay visible rather than
  // silently deleting potentially important paragraphs.
  return { words: page.words.filter(w => !excluded.has(w.index)), excluded };
}
