import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translationTask, questionTask } from '../companion/tasks.mjs';

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
test('selected passage is a focus alongside whole-paper evidence and cannot exceed its limit', () => {
  const params = { question: '이 부분을 설명해줘', pages: [{ page: 1, text: 'Introduction defines the method.' }, { page: 2, text: 'Selected result.' }, { page: 3, text: 'Other experiments.' }], selection: [{ page: 2, text: 'Selected result.' }], coverage: 'full' };
  const task = questionTask(params);
  const data = JSON.parse(task.prompt.split('Data:\n')[1]);
  assert.deepEqual(data.documentPages, params.pages);
  assert.deepEqual(data.selectedPassages, params.selection);
  assert.equal(data.documentCoverage, 'full');
  assert.deepEqual(task.validate({ answer: 'Introduction explains the result.', pages: [1, 2] }).pages, [1, 2]);
  assert.throws(() => questionTask({ ...params, selection: [{ page: 2, text: 'x'.repeat(12001) }] }));
  assert.throws(() => questionTask({ ...params, selection: [{ page: -1, text: 'x' }] }));
  assert.throws(() => questionTask({ ...params, coverage: 'invented' }));
});

test('figure questions attach image pixels separately from the full-paper prompt', () => {
 const pages = [{page:1,text:'Paper context'}], image = {page:1,dataUrl:'data:image/jpeg;base64,/9j/AA=='};
 const task = questionTask({question:'Describe the figure',pages,image});
 assert.deepEqual(task.images,[image.dataUrl]);
 assert(!task.prompt.includes(image.dataUrl));
 assert.equal(JSON.parse(task.prompt.split('Data:\n')[1]).selectedImagePage,1);
 for (const invalid of [{...image,page:2},{...image,dataUrl:'https://example.com/x.jpg'},{...image,dataUrl:'data:image/jpeg;base64,YWJj'}]) assert.throws(()=>questionTask({question:'x',pages,image:invalid}));
});
