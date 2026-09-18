import type { Word } from './layout';
export type Reference = { number: number; text: string; page: number };
export function citationNumbers(text: string): number[] {
  const result: number[] = [];
  for (const part of text.replace(/[\[\]]/g, '').split(/[,;]/)) {
    const match = part.trim().match(/^(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?$/);
    if (!match) return [];
    const first = Number(match[1]), last = Number(match[2] ?? first);
    if (!first || last < first || last - first > 50) return [];
    for (let n = first; n <= last; n++) result.push(n);
  }
  return [...new Set(result)];
}
export function referenceRows(words: Word[], width: number, height: number): string[] {
  const items = words.filter(w => w.str.trim() && Math.abs(w.angle ?? 0) < .1 && w.y > height * .04 && w.y < height * .95);
  const right = items.filter(w => w.x > width * .48 && w.x < width * .65).length;
  const left = items.filter(w => w.x < width * .45).length;
  const columns = right > 8 && left > 8 ? [items.filter(w => w.x < width * .49), items.filter(w => w.x >= width * .49)] : [items];
  return columns.flatMap(column => {
    const rows: { y: number; size: number; words: Word[] }[] = [];
    for (const word of [...column].sort((a,b) => a.y-b.y || a.x-b.x)) {
      const row = rows.findLast(r => Math.abs(r.y-word.y) < Math.max(r.size,word.height)*.45);
      if (row) row.words.push(word); else rows.push({ y:word.y,size:word.height,words:[word] });
    }
    return rows.map(row => row.words.sort((a,b)=>a.x-b.x).map(w=>w.str).join(' ').replace(/\s+/g,' ').trim());
  });
}
export function parseReferences(pages: { page: number; rows: string[] }[]): Map<number, Reference> {
  const result = new Map<number, Reference>(), ambiguous = new Set<number>();
  let inReferences = false, current: Reference | null = null;
  const flush = () => {
    if (current && current.text.length > 20) {
      if (result.has(current.number)) ambiguous.add(current.number);
      else result.set(current.number, current);
    }
    current = null;
  };
  for (const page of pages) for (const row of page.rows) {
    if (/^(?:\d+[. ]+)?(?:references|bibliography|참고\s*문헌)\s*$/i.test(row)) { inReferences = true; continue; }
    if (!inReferences) continue;
    if (/^(?:appendix\b|supplementary\s+(?:material|information))/i.test(row)) { flush(); inReferences = false; continue; }
    const start = row.match(/^(?:\[\s*(\d{1,4})\s*\]|(\d{1,4})\.)\s*(.*)$/);
    if (start) { flush(); current = { number:Number(start[1] ?? start[2]), text:start[3], page:page.page }; }
    else if (current && !/^\d+$/.test(row)) {
      if (current.text.endsWith('-') && /^[a-z]/.test(row)) current.text = current.text.slice(0,-1) + row;
      else current.text += (current.text.endsWith('-') ? '' : ' ') + row;
    }
  }
  flush(); ambiguous.forEach(n => result.delete(n));
  return result;
}
