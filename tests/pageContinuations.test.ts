import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkPageContinuations } from '../src/pageContinuations.ts';
function page(number: number, text: string, y: number, height = 12) {
  return { number, height: 800, words: [{ index: 0, str: text, x: 50, y, width: 500, height }], sentences: [{ id: `p${number}-s0`, text, fragments: [{ item: 0, start: 0, end: text.length }] }] };
}
test('joins page-split sentence once while keeping local highlight fragments', () => {
  const original = [page(1, 'We compare our results with the', 710), page(2, 'previous approach in our experiment.', 60)];
  const linked = linkPageContinuations(original);
  assert.equal(linked[0][0].text, 'We compare our results with the previous approach in our experiment.');
  assert.equal(linked[0][0].id, linked[1][0].id); assert.deepEqual(linked[1][0].pages, [1, 2]);
  assert.deepEqual(linked[1][0].fragments, original[1].sentences[0].fragments);
  assert.equal(original[1].sentences[0].id, 'p2-s0');
});
test('dehyphenates a page break and handles a sentence spanning three pages', () => {
  const linked = linkPageContinuations([page(1, 'Our approximate nearest neigh-', 700), page(2, 'bor search algorithm uses the', 510), page(3, 'graph index.', 60)]);
  assert.equal(linked[0][0].text, 'Our approximate nearest neighbor search algorithm uses the graph index.');
  assert.deepEqual(linked[2][0].pages, [1, 2, 3]);
});
test('preserves proper nouns across pages but rejects a different text size', () => {
  const linked = linkPageContinuations([page(1, 'Our method outperforms', 710), page(2, 'DiskANN on this dataset.', 60)]);
  assert.equal(linked[0][0].text, 'Our method outperforms DiskANN on this dataset.');
  const separate = linkPageContinuations([page(1, 'Our method outperforms', 710), page(2, 'DiskANN on this dataset.', 60, 20)]);
  assert.notEqual(separate[0][0].id, separate[1][0].id);
});
test('does not join completed sentences, headings, captions, lists or unrelated sparse pages', () => {
  for (const next of ['2 Related Work', 'References', 'Figure 1: A graph', '1) A new item', 'Experimental Results']) {
    const linked = linkPageContinuations([page(1, 'We evaluate the', 710), page(2, next, 60)]);
    assert.notEqual(linked[0][0].id, linked[1][0].id);
  }
  assert.notEqual(...linkPageContinuations([page(1, 'The result is complete.', 710), page(2, 'another paragraph begins.', 60)]).map(p => p[0].id) as [string, string]);
  assert.notEqual(...linkPageContinuations([page(1, 'A sparse page with no ending', 200), page(2, 'a new paragraph.', 60)]).map(p => p[0].id) as [string, string]);
});
