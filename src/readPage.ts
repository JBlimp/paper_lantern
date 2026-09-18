import { OPS, Util, type PDFDocumentProxy } from 'pdfjs-dist';
import { extractSentences, type Word, type Sentence } from './layout';
import { buildBodyProfile, filterBody, type BodyProfile, type Rect } from './bodyFilter';
import { graphicRegions } from './graphics';

type Mode = 'auto' | 'single' | 'double';
type Structure = { role?: string; type?: string; id?: string; children?: Structure[] };
export function nonBodyTags(tree: Structure | null): Set<string> {
  const ids = new Set<string>();
  const visit = (node: Structure, hidden = false) => {
    hidden ||= ['Figure','Caption','Table','Artifact'].includes(node.role ?? '');
    if (hidden && node.id) ids.add(node.id);
    node.children?.forEach(child => visit(child, hidden));
  };
  if (tree) visit(tree);
  return ids;
}
async function loadText(doc: PDFDocumentProxy, number: number) {
  const page = await doc.getPage(number), base = page.getViewport({ scale: 1 });
  const [content, tree] = await Promise.all([page.getTextContent({ includeMarkedContent: true }), page.getStructTree().catch(() => null)]);
  const hiddenIds = nonBodyTags(tree), taggedExcluded = new Set<number>(), stack: boolean[] = [];
  const words: Word[] = [];
  for (const item of content.items) {
    if (!('str' in item)) {
      if (item.type === 'endMarkedContent') stack.pop();
      else stack.push(stack.at(-1) === true || ('tag' in item && item.tag === 'Artifact') || hiddenIds.has(item.id ?? ''));
      continue;
    }
    const index = words.length, transform = Util.transform(base.transform, item.transform);
    const height = Math.hypot(transform[2], transform[3]) || item.height || 10;
    if (stack.at(-1)) taggedExcluded.add(index);
    words.push({ index, str: item.str, x: transform[4], y: transform[5] - height, baseline: transform[5], width: item.width, height, angle: Math.atan2(transform[1], transform[0]), font: item.fontName });
  }
  return { page, base, content, words, taggedExcluded, width: base.width, height: base.height };
}
type AnalyzedPage = { content: Awaited<ReturnType<typeof loadText>>['content']; sentences: Sentence[]; excluded: Map<number,string>; graphics: Rect[] };
type DocumentCache = { raw: Map<number, ReturnType<typeof loadText>>; profile?: Promise<BodyProfile>; analyzed: Map<string, Promise<AnalyzedPage>> };
const documents = new WeakMap<PDFDocumentProxy, DocumentCache>();
function cacheFor(doc: PDFDocumentProxy): DocumentCache {
  let cache = documents.get(doc);
  if (!cache) { cache = { raw: new Map(), analyzed: new Map() }; documents.set(doc, cache); }
  return cache;
}
export function rawPage(doc: PDFDocumentProxy, number: number): ReturnType<typeof loadText> {
  const cache = cacheFor(doc);
  if (!cache.raw.has(number)) cache.raw.set(number, loadText(doc, number));
  return cache.raw.get(number)!;
}
function profileFor(doc: PDFDocumentProxy): Promise<BodyProfile> {
  const cache = cacheFor(doc);
  if (!cache.profile) cache.profile = (async () => {
    const pages = [];
    // Text-only pass: recurring margin text and dominant sizes, no page rendering.
    for (let number=1; number<=doc.numPages; number++) pages.push(await rawPage(doc,number));
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
  return { content: raw.content, sentences: extractSentences(raw.words, number, raw.width, mode, raw.height, context), excluded: filtered.excluded, graphics };
}
// Original text indices survive filtering, keeping source highlighting aligned.
export function readPage(doc: PDFDocumentProxy, page: number, mode: Mode) {
  const cache = cacheFor(doc), key = `${mode}:${page}`;
  if (!cache.analyzed.has(key)) {
    const task = analyze(doc, page, mode); cache.analyzed.set(key, task);
    void task.catch(() => cache.analyzed.delete(key));
  }
  return cache.analyzed.get(key)!;
}
