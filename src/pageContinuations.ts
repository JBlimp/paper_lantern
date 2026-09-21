import type { Sentence, Word } from './layout.ts';
type Page = { number: number; height: number; words: Word[]; sentences: Sentence[] };
function heading(text: string) {
  return (
    /^(?:references|bibliography|acknowledg(?:e)?ments|appendix|abstract|keywords)\b/i.test(text) ||
    /^(?:figure|fig\.|table|algorithm)\s*\d+[.:]/i.test(text) ||
    /^\d+(?:\.\d+)*\s+[A-Z]|^[•●▪*]\s|^\(?\d+\)\s/.test(text) ||
    (text.split(/\s+/).length <= 8 && /^(?:[A-Z][a-zA-Z-]*\s*)+$/.test(text))
  );
}
function boundaryWords(sentence: Sentence, page: Page) {
  const indices = new Set(sentence.fragments.map((f) => f.item));
  return page.words.filter((w) => indices.has(w.index) && w.str.trim());
}
export function canContinue(left: Sentence, right: Sentence, before: Page, after: Page) {
  const a = left.text.trim(),
    b = right.text.trim();
  const abbreviation = /\b(?:e\.g|i\.e|et al|Fig|Figs|Eq|Sec|No)\.$/.test(a);
  if (!a || !b || heading(a) || heading(b) || (/[.!?:][\s\])}"'”’]*$/.test(a) && !abbreviation)) return false;
  const aw = boundaryWords(left, before),
    bw = boundaryWords(right, after);
  if (!aw.length || !bw.length) return false;
  const end = aw.reduce((a, b) => (a.y > b.y ? a : b)),
    start = bw.reduce((a, b) => (a.y < b.y ? a : b));
  if (end.y + end.height < before.height * 0.6 || start.y > after.height * 0.7) return false;
  if (Math.min(end.height, start.height) / Math.max(end.height, start.height) < 0.8) return false;
  // An incomplete body sentence may continue with a proper noun (e.g. DiskANN).
  // Capitalization alone is not a boundary; heading and geometry guards run above.
  return true;
}
export function linkPageContinuations(input: Page[]): Sentence[][] {
  const pages = input.map((p) => ({
    ...p,
    sentences: p.sentences.map((s) => ({ ...s, fragments: s.fragments.map((f) => ({ ...f })) })),
  }));
  const groups = new Map<string, Sentence[]>();
  for (const page of pages) for (const sentence of page.sentences) groups.set(sentence.id, [sentence]);
  for (let i = 0; i < pages.length - 1; i++) {
    const before = pages[i],
      after = pages[i + 1];
    const left = before.sentences.at(-1),
      right = after.sentences[0];
    if (!left || !right || !canContinue(left, right, before, after)) continue;
    const text =
      /[a-z][-\u00ad]$/.test(left.text) && /^[a-z]/.test(right.text)
        ? left.text.slice(0, -1) + right.text
        : left.text + ' ' + right.text;
    const members = [...groups.get(left.id)!, ...groups.get(right.id)!];
    const numbers = [...new Set([...(left.pages ?? [before.number]), ...(right.pages ?? [after.number])])];
    groups.delete(right.id);
    for (const member of members) {
      member.id = left.id;
      member.text = text;
      member.pages = numbers;
    }
    groups.set(left.id, members);
  }
  return pages.map((p) => p.sentences);
}
