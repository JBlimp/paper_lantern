import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translationTask, questionTask } from '../companion/tasks.mjs';
import { questionContext } from '../src/codex.ts';

test('translation rejects missing, duplicate, invented and blank sentence results', () => {
  const task = translationTask({ sentences: [{ id: 'p1-s1', text: 'Hello.' }, { id: 'p1-s2', text: 'World.' }] });
  assert.deepEqual(task.validate({ translations: [{ id: 'p1-s2', text: '세계.' }, { id: 'p1-s1', text: '안녕.' }] }), { 'p1-s1': '안녕.', 'p1-s2': '세계.' });
  for (const translations of [[], [{ id: 'p1-s1', text: '안녕.' }, { id: 'p1-s1', text: '중복' }], [{ id: 'other', text: '오류' }, { id: 'p1-s2', text: '세계.' }], [{ id: 'p1-s1', text: '' }, { id: 'p1-s2', text: '세계.' }]]) assert.throws(() => task.validate({ translations }));
});
test('questions reject citations outside supplied context and oversize inputs', () => {
  const task = questionTask({ question: '방법은?', pages: [{ page: 7, text: 'Method' }] });
  assert.deepEqual(task.validate({ answer: '내용 없음', pages: [] }), { answer: '내용 없음', pages: [] });
  assert.throws(() => task.validate({ answer: '가짜 근거', pages: [2] }));
  assert.throws(() => questionTask({ question: 'x', pages: [{ page: 1, text: 'x'.repeat(160001) }] }));
});
test('long-document retrieval includes matches late in paper with bounded context', () => {
  const pages = Array.from({ length: 120 }, (_, i) => ({ page: i + 1, text: 'unrelated content. '.repeat(1000) }));
  pages[115].text += 'UNIQUE_METHOD answers the question here.';
  const context = questionContext(pages, 'Explain UNIQUE_METHOD', 2);
  assert(context.some(p => p.page === 116 && p.text.includes('UNIQUE_METHOD')));
  assert(context.reduce((n, p) => n + p.text.length, 0) < 90000);
  assert(context.every(p => p.text.startsWith('[발췌')));
});
