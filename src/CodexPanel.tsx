import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { rawPage } from './readPage';
import { CodexClient, questionContext, type CodexModel } from './codex';

type Message = { role: 'user' | 'assistant'; text: string; pages?: number[] };
function AnswerText({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part)}</>;
}
export function CodexPanel({ doc, page, client, connected, models, model, onModel, onConnect, connecting, onClose, navigate }: {
  doc: PDFDocumentProxy | null; page: number; client: CodexClient; connected: boolean; models: CodexModel[]; model: string;
  onModel: (model: string) => void; onConnect: () => void; connecting: boolean; onClose: () => void; navigate: (page: number) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]), [question, setQuestion] = useState('');
  const [scope, setScope] = useState('page'), [selection, setSelection] = useState('');
  const [selectionPage, setSelectionPage] = useState(1);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null), scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { setMessages([]); setQuestion(''); setSelection(''); setError(''); setBusy(false); controller.current?.abort(); return () => controller.current?.abort(); }, [doc]);
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }, [messages, busy]);
  useEffect(() => {
    const change = () => {
      const selected = window.getSelection();
      const node = selected?.anchorNode?.parentElement;
      if (node?.closest('.reader') && selected?.toString().trim()) {
        setSelection(selected.toString().trim().slice(0, 12000));
        const slot = node.closest<HTMLElement>('[data-page]');
        setSelectionPage(slot ? Number(slot.dataset.page) : page);
      }
    };
    document.addEventListener('selectionchange', change); return () => document.removeEventListener('selectionchange', change);
  }, [page]);
  async function ask() {
    if (!doc || !connected || busy || !question.trim()) return;
    const request = new AbortController(); controller.current = request;
    const text = question.trim(); setQuestion(''); setBusy(true); setError('');
    const history = messages.slice(-8).map(m => ({ role: m.role, text: m.text.slice(0, 4000) }));
    setMessages(previous => [...previous, { role: 'user', text }]);
    try {
      const pages = [];
      if (scope === 'selection') {
        if (!selection) throw new Error('PDF나 번역문에서 질문할 부분을 먼저 선택해 주세요.');
        pages.push({ page: selectionPage, text: selection });
      } else {
        const numbers = scope === 'paper' ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : [page];
        for (const number of numbers) {
          request.signal.throwIfAborted();
          const raw = await rawPage(doc, number);
          pages.push({ page: number, text: raw.words.map(w => w.str).join(' ') });
        }
      }
      request.signal.throwIfAborted();
      const result = await client.request<{ answer: string; pages: number[] }>('ask', { question: text, history, pages: questionContext(pages, text + ' ' + history.filter(h => h.role === 'user').map(h => h.text).join(' '), page), model }, request.signal);
      if (!request.signal.aborted) setMessages(previous => [...previous, { role: 'assistant', text: result.answer, pages: result.pages }]);
    } catch (e) { if (!request.signal.aborted) { setError(e instanceof Error ? e.message : String(e)); setQuestion(text); } }
    finally { if (controller.current === request) setBusy(false); }
  }
  return <aside className="codex-panel" aria-label="Codex 질문">
    <header><strong>Codex</strong><span>{connected ? '연결됨' : '연결 안 됨'}</span><button onClick={onClose} aria-label="Codex 패널 닫기">×</button></header>
    {!connected ? <div className="codex-setup"><p>Codex 연결 프로그램을 설치한 뒤 연결하세요.</p><p>확장 ID <code>{globalThis.chrome?.runtime?.id || '확장 프로그램에서 열어 주세요'}</code></p><p>배포 폴더의 <code>companion/install.cmd</code>를 실행하고 이 ID를 입력하세요. Codex 로그인이 필요합니다.</p><button onClick={onConnect} disabled={connecting}>{connecting ? '연결 중…' : 'Codex 연결'}</button></div> : <div className="codex-options"><select aria-label="Codex 모델" value={model} disabled={busy} onChange={e => onModel(e.target.value)}>{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><select aria-label="질문 범위" value={scope} onChange={e => setScope(e.target.value)}><option value="page">현재 페이지</option><option value="paper">논문 전체</option><option value="selection">선택한 텍스트</option></select></div>}
    {scope === 'selection' && <div className="selection-preview">{selection || 'PDF 또는 번역문에서 텍스트를 드래그해 선택하세요.'}</div>}
    <div className="chat-messages" ref={scroll} aria-live="polite">
      {!messages.length && <p className="chat-empty">논문의 핵심 내용, 방법, 실험 결과를 물어보세요.</p>}
      {messages.map((m, i) => <article key={i} className={`chat-message ${m.role}`}><small>{m.role === 'user' ? '나' : 'Codex'}</small><p><AnswerText text={m.text}/></p>{m.pages?.length ? <div className="chat-citations">{m.pages.map(p => <button key={p} onClick={() => navigate(p)}>{p}쪽</button>)}</div> : null}</article>)}
      {busy && <p role="status">답변을 작성하고 있습니다…</p>}
    </div>
    {error && <p className="chat-error" role="alert">{error}</p>}
    <form onSubmit={e => { e.preventDefault(); void ask(); }}><textarea aria-label="논문 질문" placeholder="논문에 대해 질문하세요" value={question} maxLength={4000} disabled={!doc || !connected} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(); } }}/><div><button type="button" disabled={busy || !messages.length} onClick={() => setMessages([])}>대화 지우기</button>{busy ? <button type="button" onClick={() => { controller.current?.abort(); setBusy(false); }}>중단</button> : <button type="submit" className="primary" disabled={!connected || !doc || !question.trim()}>질문</button>}</div></form>
  </aside>;
}
