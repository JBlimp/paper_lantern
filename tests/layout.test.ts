import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractSentences, type Word } from '../src/layout.ts';
const word = (index: number, str: string, x: number, y: number, width = 210): Word => ({ index, str, x, y, width, height: 10 });
test('multiple sentences sharing a PDF text item keep exact character offsets', () => {
  const output = extractSentences([word(0, 'First result. Second result.', 20, 20)], 1, 600);
  assert.equal(output.length, 2);
  assert.equal(output[1].text, 'Second result.');
  assert.deepEqual(output[1].fragments, [{ item: 0, start: 14, end: 28 }]);
});
test('line-wrap hyphenation preserves mapping to both source items', () => {
  const output = extractSentences([word(0, 'A trans-', 20, 20), word(1, 'former works.', 20, 33)], 1, 600);
  assert.equal(output[0].text, 'A transformer works.');
  assert.deepEqual(output[0].fragments, [{ item: 0, start: 0, end: 7 }, { item: 1, start: 0, end: 13 }]);
});
test('two-column reading order is down the left then down the right', () => {
  const items = [word(0, 'Left starts', 30, 20), word(1, 'Right starts', 330, 20), word(2, 'and continues', 30, 33), word(3, 'and continues', 330, 33), word(4, 'to finish.', 30, 46), word(5, 'to finish.', 330, 46)];
  const output = extractSentences(items, 2, 600);
  assert.deepEqual(output.map(s => s.text), ['Left starts and continues to finish.', 'Right starts and continues to finish.']);
  assert.equal(output[1].id, 'p2-s1');
});
test('figure abbreviations do not break a sentence', () => {
  const output = extractSentences([word(0, 'See Fig. 2 for the result. Another finding.', 20, 20)], 1, 600);
  assert.equal(output[0].text, 'See Fig. 2 for the result.');
});
test('empty and scanned pages produce no fabricated text', () => {
  assert.deepEqual(extractSentences([], 1, 600), []);
});

test('adjacent PDF fragments reconstruct a word without invented spaces', () => {
  const output = extractSentences([word(0, 'A trans', 20, 20, 35), word(1, 'former', 55, 20, 30), word(2, ' works.', 85, 20, 35)], 1, 600);
  assert.equal(output[0].text, 'A transformer works.');
  assert.deepEqual(output[0].fragments.map(f => f.item), [0, 1, 2]);
});

test('actual word gaps remain spaces when the PDF omits space characters', () => {
  const output = extractSentences([word(0, 'The', 20, 20, 15), word(1, 'model', 38, 20, 25), word(2, '.', 63, 20, 3)], 1, 600);
  assert.equal(output[0].text, 'The model.');
});

test('mixed font sizes and superscript references do not split a body line', () => {
  const typical = extractSentences([
    { ...word(0, 'This method', 20, 20, 55), baseline: 30 },
    { ...word(1, '2', 75, 19, 4), height: 6, baseline: 25 },
    { ...word(2, ' works', 79, 20, 35), baseline: 30 },
    { ...word(3, 'across lines.', 20, 34, 70), height: 11, baseline: 45 },
  ], 1, 600);
  assert.equal(typical.length, 1);
  assert.equal(typical[0].text, 'This method2 works across lines.');
});

test('a continuation across a slightly larger line gap stays one sentence', () => {
  const output = extractSentences([word(0, 'We describe the proposed', 20, 20), word(1, 'method in detail.', 20, 41)], 1, 600);
  assert.deepEqual(output.map(s => s.text), ['We describe the proposed method in detail.']);
});

test('ligatures and discretionary hyphens normalize while preserving source offsets', () => {
  const output = extractSentences([word(0, 'An efﬁcient trans\u00ad', 20, 20), word(1, 'former works.', 20, 33)], 1, 600);
  assert.equal(output[0].text, 'An efficient transformer works.');
  assert.deepEqual(output[0].fragments, [{ item: 0, start: 0, end: 17 }, { item: 1, start: 0, end: 13 }]);
});

test('headings and completed paragraphs remain separate', () => {
  const output = extractSentences([{ ...word(0, 'Introduction', 20, 20), height: 16 }, word(1, 'This is a paragraph.', 20, 44), word(2, 'Another paragraph.', 20, 80)], 1, 600);
  assert.equal(output.length, 3);
});

test('SHEAF page 1: joins column continuation and excludes watermark, footer, chart labels', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/sheaf-page1.json', import.meta.url), 'utf8'));
  const result = extractSentences(fixture.words, 1, fixture.width, 'auto', fixture.height);
  const sentence = result.find(s => s.text.startsWith('First, LID'));
  assert.equal(sentence?.text, 'First, LID is a property of the data alone that is computed independently of the graph index, whereas on a graph the effort to answer a query is governed by connectivity.');
  const mapped = sentence!.fragments.map(f => fixture.words.find((w: Word) => w.index === f.item));
  assert.ok(mapped.some((w: Word) => w.x < 300));
  assert.ok(mapped.some((w: Word) => w.x > 310));
  assert.ok(!result.some(s => s.text.startsWith('Figure 1:')));
  assert.ok(!result.some(s => /arXiv:|hardness skew|^1$/.test(s.text)));
  assert.ok(result.some(s => s.text.startsWith('Therefore, serving each query at its own width')));
});
