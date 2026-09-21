import type { SourceUnit } from './codexSentences';
import { OPS, Util, type PDFDocumentProxy } from 'pdfjs-dist';
import { extractSentences, type Word, type Sentence } from './layout';
import { buildBodyProfile, filterBody, type BodyProfile, type Rect } from './bodyFilter';
import { graphicRegions } from './graphics';
import { linkPageContinuations } from './pageContinuations';

type Mode = 'auto' | 'single' | 'double';
type Structure = { role?: string; type?: string; id?: string; children?: Structure[] };
export function nonBodyTags(tree: Structure | null): Set<string> {
  const ids = new Set<string>();
  const visit = (node: Structure, hidden = false) => {
    hidden ||= ['Figure', 'Caption', 'Table', 'Artifact'].includes(node.role ?? '');
    if (hidden && node.id) ids.add(node.id);
    node.children?.forEach((child) => visit(child, hidden));
  };
  if (tree) visit(tree);
  return ids;
}
async function loadText(doc: PDFDocumentProxy, number: number) {
  const page = await doc.getPage(number),
    base = page.getViewport({ scale: 1 });
  const [content, tree] = await Promise.all([
    page.getTextContent({ includeMarkedContent: true }),
    page.getStructTree().catch(() => null),
  ]);
  const hiddenIds = nonBodyTags(tree),
    taggedExcluded = new Set<number>(),
    stack: boolean[] = [];
  const words: Word[] = [];
  for (const item of content.items) {
    if (!('str' in item)) {
      if (item.type === 'endMarkedContent') stack.pop();
      else
        stack.push(
          stack.at(-1) === true || ('tag' in item && item.tag === 'Artifact') || hiddenIds.has(item.id ?? ''),
        );
      continue;
    }
    const index = words.length,
      transform = Util.transform(base.transform, item.transform);
    const height = Math.hypot(transform[2], transform[3]) || item.height || 10;
    if (stack.at(-1)) taggedExcluded.add(index);
    words.push({
      index,
      str: item.str,
      x: transform[4],
      y: transform[5] - height,
      baseline: transform[5],
      width: item.width,
      height,
      angle: Math.atan2(transform[1], transform[0]),
      font: item.fontName,
    });
  }
  return { page, base, content, words, taggedExcluded, width: base.width, height: base.height };
}
type AnalyzedPage = {
  content: Awaited<ReturnType<typeof loadText>>['content'];
  sentences: Sentence[];
  excluded: Map<number, string>;
  graphics: Rect[];
};
type DocumentCache = {
  raw: Map<number, ReturnType<typeof loadText>>;
  profile?: Promise<BodyProfile>;
  analyzed: Map<string, Promise<AnalyzedPage>>;
  linked: Map<Mode, Promise<AnalyzedPage[]>>;
};
const documents = new WeakMap<PDFDocumentProxy, DocumentCache>();
function cacheFor(doc: PDFDocumentProxy): DocumentCache {
  let cache = documents.get(doc);
  if (!cache) {
    cache = { raw: new Map(), analyzed: new Map(), linked: new Map() };
    documents.set(doc, cache);
  }
  return cache;
}
export function rawPage(doc: PDFDocumentProxy, number: number): ReturnType<typeof loadText> {
  const cache = cacheFor(doc);
  if (!cache.raw.has(number)) cache.raw.set(number, loadText(doc, number));
  return cache.raw.get(number)!;
}
function profileFor(doc: PDFDocumentProxy): Promise<BodyProfile> {
  const cache = cacheFor(doc);
  if (!cache.profile)
    cache.profile = (async () => {
      const pages = [];
      // Text-only pass: recurring margin text and dominant sizes, no page rendering.
      for (let number = 1; number <= doc.numPages; number++) pages.push(await rawPage(doc, number));
      return buildBodyProfile(pages);
    })();
  return cache.profile;
}
async function analyze(doc: PDFDocumentProxy, number: number, mode: Mode): Promise<AnalyzedPage> {
  const [raw, profile] = await Promise.all([rawPage(doc, number), profileFor(doc)]);
  const operatorList = await raw.page.getOperatorList();
  const graphics = graphicRegions(operatorList, OPS, raw.base.transform, raw.width, raw.height);
  const context = { profile, graphics, taggedExcluded: raw.taggedExcluded };
  const filtered = filterBody(raw, context);
  return {
    content: raw.content,
    sentences: extractSentences(raw.words, number, raw.width, mode, raw.height, context),
    excluded: filtered.excluded,
    graphics,
  };
}
// Original text indices survive filtering, keeping source highlighting aligned.
function unlinkedPage(doc: PDFDocumentProxy, page: number, mode: Mode) {
  const cache = cacheFor(doc),
    key = `${mode}:${page}`;
  if (!cache.analyzed.has(key)) {
    const task = analyze(doc, page, mode);
    cache.analyzed.set(key, task);
    void task.catch(() => cache.analyzed.delete(key));
  }
  return cache.analyzed.get(key)!;
}
export async function readPage(doc: PDFDocumentProxy, page: number, mode: Mode) {
  const cache = cacheFor(doc);
  if (!cache.linked.has(mode)) {
    const task = (async () => {
      const analyzed = [],
        metadata = [];
      for (let number = 1; number <= doc.numPages; number++) {
        const result = await unlinkedPage(doc, number, mode),
          raw = await rawPage(doc, number);
        analyzed.push(result);
        metadata.push({ number, height: raw.height, words: raw.words, sentences: result.sentences });
      }
      const linked = linkPageContinuations(metadata);
      return analyzed.map((result, index) => ({ ...result, sentences: linked[index] }));
    })();
    cache.linked.set(mode, task);
    void task.catch(() => cache.linked.delete(mode));
  }
  const result = (await cache.linked.get(mode)!)[page - 1];
  const override = codexPages.get(doc)?.get(mode);
  return override ? { ...result, sentences: override[page - 1] ?? [] } : result;
}

const codexPages = new WeakMap<PDFDocumentProxy, Map<Mode, Sentence[][]>>();
const listeners = new WeakMap<PDFDocumentProxy, Set<() => void>>();
export function observeSentences(doc: PDFDocumentProxy, listener: () => void) {
  let set = listeners.get(doc);
  if (!set) {
    set = new Set();
    listeners.set(doc, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
  };
}
export function setCodexSentences(doc: PDFDocumentProxy, mode: Mode, pages?: Sentence[][]) {
  let map = codexPages.get(doc);
  if (!map) {
    map = new Map();
    codexPages.set(doc, map);
  }
  if (pages) map.set(mode, pages);
  else map.clear();
  for (const listener of listeners.get(doc) ?? []) listener();
}
export async function sourceUnits(
  doc: PDFDocumentProxy,
  mode: Mode,
  signal: AbortSignal,
): Promise<SourceUnit[]> {
  const units: SourceUnit[] = [];
  for (let page = 1; page <= doc.numPages; page++) {
    signal.throwIfAborted();
    const raw = await rawPage(doc, page),
      analyzed = await unlinkedPage(doc, page, mode);
    const rank = new Map<number, number>();
    for (const sentence of analyzed.sentences)
      for (const fragment of sentence.fragments)
        if (!rank.has(fragment.item)) rank.set(fragment.item, rank.size);
    const words = raw.words
      .filter((w) => !analyzed.excluded.has(w.index))
      .sort((a, b) => (rank.get(a.index) ?? 100000 + a.index) - (rank.get(b.index) ?? 100000 + b.index));
    for (const word of words)
      for (const match of word.str.matchAll(/\S+/g))
        units.push({
          id: `p${page}i${word.index}c${match.index}`,
          page,
          item: word.index,
          start: match.index,
          end: match.index + match[0].length,
          text: match[0],
          x: Math.round(word.x),
          y: Math.round(word.y),
          height: Math.round(word.height),
        });
  }
  return units;
}
