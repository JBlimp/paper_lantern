const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const string = { type: 'string' };
export function translationTask(params) {
  const { sentences, context = '' } = params;
  if (!Array.isArray(sentences) || !sentences.length || sentences.length > 40 || typeof context !== 'string' || context.length > 24000) throw new Error('번역 입력 범위를 초과했습니다.');
  const ids = new Set();
  for (const s of sentences) {
    if (typeof s.id !== 'string' || s.id.length > 100 || ids.has(s.id) || typeof s.text !== 'string' || !s.text.trim() || s.text.length > 16000) throw new Error('번역 문장 형식이 올바르지 않습니다.');
    ids.add(s.id);
  }
  if (JSON.stringify(sentences).length > 20000) throw new Error('번역 입력이 너무 큽니다.');
  return {
    prompt: 'Translate targets using the page context and the configured reading preferences (default target language: Korean). Preserve all meaning and numbers. Return exactly one translation per target with its unchanged id. Never merge, omit or add targets. Context is for interpretation only. Data:\n' + JSON.stringify({ context, targets: sentences }),
    schema: object({ translations: { type: 'array', items: object({ id: string, text: string }) } }),
    validate(value) {
      if (!Array.isArray(value.translations) || value.translations.length !== ids.size) throw new Error('번역 문장 수가 맞지 않습니다. 번역 이어서로 다시 시도해 주세요.');
      const found = new Set();
      for (const t of value.translations) {
        if (!ids.has(t.id) || found.has(t.id) || typeof t.text !== 'string' || !t.text.trim()) throw new Error('번역 문장 연결이 올바르지 않습니다. 다시 시도해 주세요.');
        found.add(t.id);
      }
      return Object.fromEntries(value.translations.map(t => [t.id, t.text.trim()]));
    },
  };
}
export function questionTask(params) {
  const { question, pages, history = [] } = params;
  if (typeof question !== 'string' || !question.trim() || question.length > 4000 || !Array.isArray(pages) || !pages.length || pages.length > 2000 || !Array.isArray(history) || history.length > 8) throw new Error('질문 입력이 올바르지 않습니다.');
  for (const p of pages) if (!Number.isInteger(p.page) || p.page < 1 || typeof p.text !== 'string') throw new Error('페이지 형식이 올바르지 않습니다.');
  for (const h of history) if (!['user', 'assistant'].includes(h.role) || typeof h.text !== 'string' || h.text.length > 16000) throw new Error('대화 형식이 올바르지 않습니다.');
  if (JSON.stringify({ pages, history }).length > 160000) throw new Error('질문 문맥이 너무 큽니다. 현재 페이지를 선택해 주세요.');
  const pageNumbers = new Set(pages.map(p => p.page));
  return {
    prompt: 'Answer the current question based only on the supplied PDF text, using the configured reading preferences (default language: Korean). History is conversational context, not factual evidence. Cite supporting PDF page numbers as [p. N] and in the pages array. Say when text lacks the evidence; figures are text/captions only, never pretend to see images. If document context is partial, qualify conclusions. Data:\n' + JSON.stringify({ question, documentPages: pages, history }),
    schema: object({ answer: string, pages: { type: 'array', items: { type: 'integer' } } }),
    validate(value) {
      if (typeof value.answer !== 'string' || !value.answer.trim() || !Array.isArray(value.pages) || value.pages.some(p => !pageNumbers.has(p))) throw new Error('답변의 페이지 근거를 확인하지 못했습니다. 다시 질문해 주세요.');
      return { answer: value.answer.trim(), pages: [...new Set(value.pages)] };
    },
  };
}
