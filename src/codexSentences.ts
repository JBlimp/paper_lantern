import type { Sentence } from './layout';
export type SourceUnit = {
  id: string;
  page: number;
  text: string;
  item: number;
  start: number;
  end: number;
  x: number;
  y: number;
  height: number;
};
export type PaperTranslation = { sentences: { text: string; translation: string; pages: number[] }[] };
export type CodexWork = { complete?: boolean };
export type DocumentResult = { pages: Sentence[][]; translations: Record<string, string>; work: CodexWork };
const normalize = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
export async function translateDocument(
  units: SourceUnit[],
  pageCount: number,
  request: (
    pages: { page: number; text: string }[],
    onPartial: (value: PaperTranslation) => void,
  ) => Promise<PaperTranslation>,
  signal: AbortSignal,
  onProgress?: (result: DocumentResult) => void,
): Promise<DocumentResult> {
  signal.throwIfAborted();
  const documentPages = Array.from({ length: pageCount }, (_, i) => ({
    page: i + 1,
    text: units
      .filter((u) => u.page === i + 1)
      .map((u) => u.text)
      .join(' '),
  }));
  if (!documentPages.some((page) => page.text.trim()))
    throw new Error('PDF에서 번역할 텍스트를 찾지 못했습니다.');
  const map = translationMapper(units, pageCount);
  const result = await request(documentPages, (partial) => {
    if (!signal.aborted) onProgress?.(map(partial, false));
  }); // Exactly one model request for the entire paper.
  signal.throwIfAborted();
  return map(result, true);
}
function translationMapper(units: SourceUnit[], pageCount: number) {
  let source = '';
  const positions: { unit: SourceUnit; offset: number }[] = [];
  const bounds = new Map<number, { start: number; end: number }>();
  for (const unit of units) {
    if (!bounds.has(unit.page)) bounds.set(unit.page, { start: source.length, end: source.length });
    for (let offset = 0; offset < unit.text.length; offset++)
      for (const char of normalize(unit.text[offset])) {
        source += char;
        positions.push({ unit, offset });
      }
    bounds.get(unit.page)!.end = source.length;
  }
  return (result: PaperTranslation, complete: boolean): DocumentResult => {
    const pages: Sentence[][] = Array.from({ length: pageCount }, () => []),
      translations: Record<string, string> = {};
    let cursor = 0;
    result.sentences.forEach((sentence, serial) => {
      const numbers = [...new Set(sentence.pages)].sort((a, b) => a - b),
        id = `codex-s${serial}`;
      const needle = normalize(sentence.text),
        start = bounds.get(numbers[0])?.start ?? 0,
        end = bounds.get(numbers.at(-1)!)?.end ?? source.length;
      let found = needle ? source.indexOf(needle, Math.max(start, cursor)) : -1;
      if (found < 0 || found + needle.length > end) found = needle ? source.indexOf(needle, start) : -1;
      const matched = found >= start && found + needle.length <= end && !!needle;
      const fragments = new Map<number, { item: number; start: number; end: number }[]>();
      if (matched) {
        for (const { unit, offset } of positions.slice(found, found + needle.length)) {
          if (!fragments.has(unit.page)) fragments.set(unit.page, []);
          const list = fragments.get(unit.page)!,
            last = list.at(-1),
            position = unit.start + offset;
          if (last && last.item === unit.item && position <= last.end + 1) last.end = position + 1;
          else list.push({ item: unit.item, start: position, end: position + 1 });
        }
        cursor = found + needle.length;
      }
      translations[id] = sentence.translation;
      for (const page of numbers)
        if (pages[page - 1])
          pages[page - 1].push({
            id,
            text: sentence.text,
            fragments: fragments.get(page) ?? [],
            ...(numbers.length > 1 ? { pages: numbers } : {}),
          });
    });
    return { pages, translations, work: { complete } };
  };
}
