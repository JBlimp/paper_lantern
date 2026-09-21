import { filterBody, type BodyContext } from './bodyFilter.ts';
export type Word = { index: number; str: string; x: number; y: number; width: number; height: number; baseline?: number; angle?: number; font?: string };
export type Fragment = { item: number; start: number; end: number };
export type Sentence = { id: string; text: string; fragments: Fragment[]; pages?: number[] };
type Line = { words: Word[]; x: number; y: number; height: number; right: number; baseline: number };

function linesOf(words: Word[]): Line[] {
  const lines: Line[] = [];
  for (const word of [...words].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const baseline = word.baseline ?? word.y + word.height;
    let line = lines.findLast(l => Math.abs(l.baseline - baseline) < Math.max(l.height, word.height) * .3 || (Math.min(l.height, word.height) < Math.max(l.height, word.height) * .8 && Math.abs(l.baseline - baseline) < Math.max(l.height, word.height) * .7));
    if (!line) { line = { words: [], x: word.x, y: word.y, height: word.height, right: 0, baseline }; lines.push(line); }
    if (word.height >= line.height) { line.baseline = baseline; line.y = word.y; }
    line.words.push(word); line.x = Math.min(line.x, word.x);
    line.right = Math.max(line.right, word.x + word.width);
    line.height = Math.max(line.height, word.height);
  }
  for (const line of lines) line.words.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => a.y - b.y);
}

export function extractSentences(input: Word[], page: number, pageWidth: number, mode: 'auto' | 'single' | 'double' = 'auto', pageHeight = Infinity, context: BodyContext = {}): Sentence[] {
  const words = filterBody({ words: input, width: pageWidth, height: pageHeight }, context).words.filter(w => w.str.trim());
  const raw = linesOf(words);
  const gaps: number[] = [];
  for (const line of raw) for (let i = 1; i < line.words.length; i++) {
    const left = line.words[i - 1], right = line.words[i];
    const center = (left.x + left.width + right.x) / 2;
    if (right.x - left.x - left.width > Math.max(18, line.height * 1.8) && center > pageWidth * .35 && center < pageWidth * .65) gaps.push(center);
  }
  const two = mode === 'double' || (mode === 'auto' && gaps.length >= 3);
  const gutter = mode === 'double' || !gaps.length ? pageWidth / 2 : gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  let ordered: Line[] = [];
  if (two) {
    // Full-width titles separate vertical bands; read each band down the left, then the right.
    const spanning = raw.filter(l => l.words.some(w => w.x < gutter - 8 && w.x + w.width > gutter + 8));
    let floor = -Infinity;
    for (const heading of [...spanning, { y: Infinity } as Line]) {
      const band = words.filter(w => w.y > floor && w.y < heading.y - 1 && !spanning.some(l => l.words.includes(w)));
      ordered.push(...linesOf(band.filter(w => w.x + w.width / 2 < gutter)), ...linesOf(band.filter(w => w.x + w.width / 2 >= gutter)));
      if (heading.y !== Infinity) ordered.push(heading);
      floor = heading.y + 1;
    }
  } else ordered = raw;

  const paragraphs: Line[][] = [];
  for (const line of ordered) {
    const last = paragraphs.at(-1), prev = last?.at(-1);
    const previousText = prev?.words.map(w => w.str).join('').trim() ?? '';
    const nextText = line.words[0]?.str.trim() ?? '';
    const continues = !!prev && !/[.!?:][\s\])}"']*$/.test(previousText) && /^[a-z(\[]/.test(nextText) && Math.min(prev.height, line.height) / Math.max(prev.height, line.height) >= .8;
    const columnChange = !!prev && (line.y < prev.y || (two && Math.abs(line.x - prev.x) > pageWidth * .25));
    if (!prev || (!continues && columnChange) || (!columnChange && line.y - prev.y > Math.max(prev.height, line.height) * (continues ? 3 : 1.85)) || Math.max(line.height, prev.height) / Math.min(line.height, prev.height) > 1.3) paragraphs.push([line]);
    else last!.push(line);
  }
  const result: Sentence[] = [];
  for (const paragraph of paragraphs) {
    let text = '';
    const refs: ({ item: number; offset: number } | null)[] = [];
    for (const line of paragraph) {
      for (const [wi, word] of line.words.entries()) {
        const previousWord = wi > 0 ? line.words[wi - 1] : undefined;
        const gap = previousWord ? word.x - previousWord.x - previousWord.width : Infinity;
        const adjacent = previousWord && gap <= Math.min(previousWord.height, word.height) * .12;
        const dehyphenate = wi === 0 && /[\-\u00ad]$/.test(text) && /^[a-z]/.test(word.str);
        if (dehyphenate) { text = text.slice(0, -1); refs.pop(); }
        else if (text && !/\s$/.test(text) && !/^\s/.test(word.str) && !adjacent && !/^[,.;:!?\])}]/.test(word.str)) { text += ' '; refs.push(null); }
        for (let offset = 0; offset < word.str.length; offset++) {
          const char = word.str[offset];
          if (char === '\u200b') continue;
          if (char === '\u00ad') {
            if (offset === word.str.length - 1) { text += '-'; refs.push({ item: word.index, offset }); }
            continue;
          }
          // Expand typographic ligatures without losing their single-glyph source range.
          const normalized = /[\ufb00-\ufb06]/.test(char) ? char.normalize('NFKC') : char;
          for (const letter of normalized) { text += letter; refs.push({ item: word.index, offset }); }
        }
      }
    }
    const segments = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)];
    for (let i = 0; i < segments.length; i++) {
      const start = segments[i].index;
      let chunk = segments[i].segment;
      while (i + 1 < segments.length && /\b(?:Fig|Figs|Eq|Eqs|Dr|Prof|Sec|Secs|Ref|Refs|No|Vol|pp|vs|al|cf|e\.g|i\.e|[A-Z])\.\s*$/.test(chunk)) chunk += segments[++i].segment;
      const fragments: Fragment[] = [];
      for (const ref of refs.slice(start, start + chunk.length)) {
        if (!ref) continue;
        const prev = fragments.at(-1);
        if (prev?.item === ref.item && ref.offset >= prev.start && ref.offset < prev.end) continue;
        if (prev?.item === ref.item && prev.end === ref.offset) prev.end++;
        else fragments.push({ item: ref.item, start: ref.offset, end: ref.offset + 1 });
      }
      if (chunk.trim()) result.push({ id: `p${page}-s${result.length}`, text: chunk.trim(), fragments });
    }
  }
  return result;
}
