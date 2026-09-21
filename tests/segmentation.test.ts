import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentTranslationTask } from '../companion/documentTranslation.mjs';
import { translateDocument, type SourceUnit } from '../src/codexSentences.ts';
const units: SourceUnit[] = [
 { id: 'a', page: 1, item: 0, start: 0, end: 8, text: 'approxi-', x: 40, y: 700, height: 12 },
 { id: 'b', page: 2, item: 0, start: 0, end: 4, text: 'mate', x: 40, y: 40, height: 12 },
 { id: 'c', page: 2, item: 1, start: 0, end: 7, text: 'search.', x: 65, y: 40, height: 12 },
];
test('whole-paper result needs valid text, translation and real pages, but no word IDs', () => {
 const task = documentTranslationTask({ pages: [{ page: 1, text: 'Introduction.' }, { page: 2, text: 'Method.' }] });
 const result = { sentences: [{ text: 'Cleaned original.', translation: '번역', pages: [1, 2] }] };
 assert.deepEqual(task.validate(result), result);
 for (const sentence of [{ text: 'x', translation: '', pages: [1] }, { text: 'x', translation: 'y', pages: [9] }]) assert.throws(() => task.validate({ sentences: [sentence] }));
});
test('one request includes every page and a cross-page sentence maps locally', async () => {
 let calls = 0;
 const result = await translateDocument(units, 2, async pages => {
  calls++; assert.equal(pages.length, 2); assert.equal(pages[0].text, 'approxi-');
  assert.equal(pages[1].text, 'mate search.');
  return { sentences: [{ text: 'approximate search.', translation: '근사 검색', pages: [1, 2] }] };
 }, new AbortController().signal);
 assert.equal(calls, 1); assert.equal(result.pages[0][0].id, result.pages[1][0].id);
 assert.deepEqual(result.pages[1][0].fragments, [{ item: 0, start: 0, end: 4 }, { item: 1, start: 0, end: 6 }]);
 assert.equal(result.translations['codex-s0'], '근사 검색');
});
test('an unmatched original still displays its translation without failing the paper', async () => {
 const result = await translateDocument(units, 2, async () => ({ sentences: [{ text: 'Model-cleaned wording differs.', translation: '번역은 유지', pages: [1] }] }), new AbortController().signal);
 assert.deepEqual(result.pages[0][0].fragments, []); assert.equal(result.translations['codex-s0'], '번역은 유지');
});
test('large papers are never silently split into separate model requests', async () => {
 const input = Array.from({ length: 1000 }, (_, i) => ({ ...units[0], id: `u${i}`, item: i, text: 'word' }));
 let calls = 0;
 await translateDocument(input, 1, async pages => { calls++; assert.equal(pages[0].text.split(' ').length, 1000); return { sentences: [{ text: 'word', translation: '단어', pages: [1] }] }; }, new AbortController().signal);
 assert.equal(calls, 1);
});
