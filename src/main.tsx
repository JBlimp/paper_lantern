import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import './style.css';
import { ContinuousPdf } from './ContinuousPdf';
import { SplitPane } from './SplitPane';
import { TranslationView } from './TranslationView';
import type { Sentence } from './layout';
import { availability, createTranslator, errorMessage, type LocalTranslator } from './ai';
import { readPage } from './readPage';
import { embedded, readTabPdf } from './pdfSource';
import { removeLegacyCache } from './removeLegacyCache';
import { CodexClient, type CodexModel } from './codex';
import { CodexPanel } from './CodexPanel';
import { CodexSettings } from './CodexSettings';
import { readPrompts, settingsKey } from './settings';
import { SelectionAction, type SelectionQuote } from './SelectionAction';
GlobalWorkerOptions.workerSrc = workerUrl;

function App() {
  const [provider, setProvider] = useState('chrome'), providerRef = useRef('chrome');
  const [chatOpen, setChatOpen] = useState(false), [connected, setConnected] = useState(false), [connecting, setConnecting] = useState(false);
  const [models, setModels] = useState<CodexModel[]>([]), [model, setModel] = useState(''), modelRef = useRef('');
  const codex = useRef(new CodexClient());
  const [settingsOpen, setSettingsOpen] = useState(false), [prompts, setPrompts] = useState(readPrompts);
  const promptsRef = useRef(prompts);
  const [quote, setQuote] = useState<SelectionQuote | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null), [name, setName] = useState('');
  const [page, setPage] = useState(1);
  const [jump, setJump] = useState({ page: 1, serial: 0 });
  const pageRef = useRef(1);
  const pageSentences = useRef(new Map<number, Sentence[]>());
  const [mode, setMode] = useState<'auto' | 'single' | 'double'>('auto');
  const [sentences, setSentences] = useState<Sentence[]>([]), [translations, setTranslations] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null), [ai, setAi] = useState('checking');
  const [progress, setProgress] = useState(0), [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [drag, setDrag] = useState(false);
  const translator = useRef<LocalTranslator | null>(null), run = useRef(0);
  const translated = useRef<Record<string, string>>({});
  const [completedPages, setCompletedPages] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null), documentRef = useRef<PDFDocumentProxy | null>(null);
  const abort = useRef<AbortController | null>(null);
  const onError = useCallback((e: unknown) => setError(errorMessage(e)), []);
  const onReady = useCallback((s: Sentence[], number: number) => { pageSentences.current.set(number, s); if (number !== pageRef.current) return; setParsed(true); setSentences(previous => JSON.stringify(previous) === JSON.stringify(s) ? previous : s); }, []);
  const onPdfActive = useCallback((id: string | null) => {
    setActive(id);
    if (!id) return;
    const card = document.querySelector<HTMLElement>(`[data-sentence="${id}"]`), panel = card?.closest('.translation-scroll');
    if (!card || !panel) return;
    const a = card.getBoundingClientRect(), b = panel.getBoundingClientRect();
    if (a.top < b.top) panel.scrollTop += a.top - b.top - 12;
    else if (a.bottom > b.bottom) panel.scrollTop += a.bottom - b.bottom + 12;
  }, []);
  useEffect(() => {
    availability().then(value => setAi(previous => previous === 'checking' ? value : previous)).catch(onError);
    removeLegacyCache(setNotice);
    codex.current.onDisconnect = () => setConnected(false);
    return () => { run.current++; abort.current?.abort(); translator.current?.destroy(); codex.current.disconnect(); };
  }, [onError]);

  useEffect(() => {
    if (!embedded) return;
    const controller = new AbortController();
    setLoading(true);
    readTabPdf(controller.signal).then(file => { if (!controller.signal.aborted) void open(file); }).catch(e => { if (!controller.signal.aborted) { setLoading(false); onError(e); } });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (connected && providerRef.current === 'codex' && documentRef.current) resume(mode, true);
  }, [connected]);

  function stop() {
    run.current++; abort.current?.abort(); translator.current?.destroy(); translator.current = null;
    setBusy(false); setPreparing(false); setLoading(false); setAi('available');
  }
  async function prepare(ticket: number): Promise<LocalTranslator | null> {
    setPreparing(true); setProgress(0);
    try {
      // Invoked immediately by file selection/drop or retry, before PDF I/O.
      const session: LocalTranslator = providerRef.current === 'codex' ? (() => {
        if (!connected) throw new Error('Codex 질문 패널에서 먼저 연결해 주세요.');
        return {
          translate: async () => { throw new Error('Codex는 문맥 단위로 번역합니다.'); },
          translateBatch: (targets, context, signal) => codex.current.request<Record<string, string>>('translate', { sentences: targets.map(s => ({ id: s.id, text: s.text })), context, model: modelRef.current, systemPrompt: promptsRef.current.translation }, signal),
          destroy() {},
        };
      })() : await createTranslator(value => { if (run.current === ticket) setProgress(value); });
      if (ticket !== run.current) { session.destroy(); return null; }
      translator.current = session; setAi('ready'); return session;
    } catch (e) {
      if (ticket === run.current) { onError(e); setAi('unavailable'); }
      return null;
    } finally { if (ticket === run.current) setPreparing(false); }
  }
  async function translateAll(document: PDFDocumentProxy, layout: typeof mode, ticket: number, ready: Promise<LocalTranslator | null>) {
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); setCompletedPages(0);
    try {
      // Extract every page, including pages never scrolled into view.
      for (let number = 1; number <= document.numPages; number++) {
        const result = await readPage(document, number, layout);
        if (ticket !== run.current) return;
        onReady(result.sentences, number);
      }
      const session = await ready;
      if (!session || ticket !== run.current) return;
      for (let number = 1; number <= document.numPages; number++) {
        if (session.translateBatch) {
          const all = pageSentences.current.get(number) ?? [];
          const remaining = all.filter(s => !translated.current[s.id]);
          while (remaining.length) {
            const batch: Sentence[] = []; let size = 0;
            while (remaining.length && batch.length < 16 && (!batch.length || size + remaining[0].text.length < 7000)) { const s = remaining.shift()!; batch.push(s); size += s.text.length; }
            const result = await session.translateBatch(batch, all.map(s => s.text).join('\n').slice(0, 24000), controller.signal);
            if (ticket !== run.current) return;
            Object.assign(translated.current, result); setTranslations(previous => ({ ...previous, ...result }));
          }
          if (ticket !== run.current) return;
          setCompletedPages(number); continue;
        }
        for (const sentence of pageSentences.current.get(number) ?? []) {
          if (ticket !== run.current) return;
          if (translated.current[sentence.id]) continue;
          const result = (await session.translate(sentence.text, { signal: controller.signal })).trim();
          if (ticket !== run.current) return;
          if (!result) throw new Error('빈 번역 결과를 받았습니다. 번역 이어서 버튼을 눌러 주세요.');
          translated.current[sentence.id] = result;
          setTranslations(previous => ({ ...previous, [sentence.id]: result }));
        }
        if (ticket !== run.current) return;
        setCompletedPages(number);
      }
    } catch (e) { if (ticket === run.current) onError(e); }
    finally { if (ticket === run.current) setBusy(false); }
  }
  async function open(file?: File) {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { setError('100MB 이하의 PDF를 열어 주세요.'); return; }
    stop(); const ticket = run.current;
    setQuote(null); window.getSelection()?.removeAllRanges();
    setLoading(true); setError(''); setNotice('');
    const ready = prepare(ticket);
    try {
      const data = await file.arrayBuffer();
      const next = await getDocument({ data: new Uint8Array(data), cMapUrl: new URL('cmaps/', location.href).href, cMapPacked: true, standardFontDataUrl: new URL('standard_fonts/', location.href).href, wasmUrl: new URL('wasm/', location.href).href }).promise;
      if (ticket !== run.current) { await next.loadingTask.destroy(); return; }
      const old = documentRef.current;
      documentRef.current = next; setDoc(next); setName(file.name); setPage(1); pageRef.current = 1;
      pageSentences.current.clear(); translated.current = {}; setTranslations({}); setCompletedPages(0);
      setJump(previous => ({ page: 1, serial: previous.serial + 1 })); setSentences([]); setParsed(false); setActive(null);
      void translateAll(next, mode, ticket, ready);
      if (old) await old.loadingTask.destroy();
    } catch (e) { if (ticket === run.current) { stop(); onError(e); } }
    finally { if (ticket === run.current) setLoading(false); }
  }
  function resume(layout = mode, reset = false) {
    if (!documentRef.current) return;
    stop(); const ticket = run.current; setError('');
    if (reset) { pageSentences.current.clear(); translated.current = {}; setTranslations({}); setSentences([]); setParsed(false); }
    const ready = prepare(ticket);
    void translateAll(documentRef.current, layout, ticket, ready);
  }
  function selectPage(next: number) {
    if (pageRef.current === next) return;
    pageRef.current = next; setPage(next); setActive(null);
    const saved = pageSentences.current.get(next); setSentences(saved ?? []); setParsed(!!saved);
    document.querySelector('.translation-scroll')?.scrollTo({ top: 0 });
  }
  async function connectCodex() {
    setConnecting(true); setError(''); codex.current.disconnect();
    try {
      const result = await codex.current.connect();
      if (result.protocolVersion !== 2) throw new Error('Codex 연결 프로그램을 업데이트해 주세요. 새 배포 폴더의 companion/install.cmd를 다시 실행하면 됩니다.');
      if (!result.models.length) throw new Error('사용 가능한 Codex 모델이 없습니다.');
      setModels(result.models); const selected = result.models.find(m => m.isDefault)?.id || result.models[0].id;
      modelRef.current = selected; setModel(selected); setConnected(true);
    } catch (e) { codex.current.disconnect(); onError(e); }
    finally { setConnecting(false); }
  }
  function navigate(next: number) { selectPage(next); setJump(previous => ({ page: next, serial: previous.serial + 1 })); }
  const done = sentences.filter(s => translations[s.id]).length;
  const status: Record<string, string> = { checking: '환경 확인 중', missing: '번역 API 없음', unavailable: '이 환경에서 사용 불가', downloadable: '최초 다운로드 필요', downloading: '모델 다운로드 필요', available: '모델 시작 가능', ready: '로컬 번역 준비됨' };
  return <div className="app" onDragOver={e => { e.preventDefault(); if (!embedded && !loading) setDrag(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false); }} onDrop={e => { e.preventDefault(); setDrag(false); if (!embedded && !loading) void open(e.dataTransfer.files[0]); }}>
    <main>
      <div className="toolbar" role="toolbar" aria-label="논문 읽기 도구">
        {!embedded && <button onClick={() => fileInput.current?.click()} disabled={loading}>파일 선택 (독립 리더)</button>}
        <div className="filename" title={name}>{loading ? 'PDF 여는 중…' : name}</div>
        <select aria-label="번역 엔진" value={provider} disabled={loading} onChange={e => {
          const next = e.target.value; providerRef.current = next; setProvider(next);
          if (next === 'codex' && !connected) { stop(); setChatOpen(true); translated.current = {}; setTranslations({}); setCompletedPages(0); }
          else resume(mode, true);
        }}><option value="chrome">Chrome 번역</option><option value="codex">Codex 번역</option></select>
        <button onClick={() => setChatOpen(previous => !previous)} aria-pressed={chatOpen}>Codex 질문</button>
        <button onClick={() => setSettingsOpen(true)} aria-label="Codex 설정">설정</button>
        {provider === 'codex' && connected && <span className="model-label" title="다음 번역 요청에 사용할 모델">{models.find(m => m.id === model)?.name || model}</span>}
        {doc && <><div className="page-controls"><button aria-label="이전 페이지" disabled={page <= 1 || loading} onClick={() => navigate(page - 1)}>‹</button><span>{page} <em>/ {doc.numPages}</em></span><button aria-label="다음 페이지" disabled={page >= doc.numPages || loading} onClick={() => navigate(page + 1)}>›</button></div><select aria-label="읽기 순서" title="PDF 읽기 순서" value={mode} disabled={loading} onChange={e => { const next = e.target.value as typeof mode; setMode(next); resume(next, true); }}><option value="auto">자동</option><option value="single">1단</option><option value="double">2단</option></select></>}
        <span className="ai-status" role="status" title={status[ai]}>{preparing ? `모델 준비 중 · ${progress}%` : doc ? `${busy ? '전체 번역' : completedPages === doc.numPages ? '번역 완료' : '번역 대기'} · ${completedPages} / ${doc.numPages} 페이지` : ''}</span>
        {doc && (busy || preparing ? <button onClick={stop}>번역 중단</button> : completedPages < doc.numPages ? <button className="primary" onClick={() => resume()}>번역 이어서</button> : null)}
      </div>
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" aria-label="PDF 파일 선택" className="file-input" onChange={e => { void open(e.target.files?.[0]); e.target.value = ''; }}/>
      {error && <div className="message error" role="alert">{error}<button onClick={() => setError('')} aria-label="오류 닫기">×</button></div>}
      {notice && <div className="message" role="status">{notice}<button onClick={() => setNotice('')} aria-label="알림 닫기">×</button></div>}
      <div className="workspace"><div className="reading-area">{!doc ? <section className="empty"><button onClick={() => embedded ? location.reload() : fileInput.current?.click()} disabled={loading}>{loading ? 'PDF를 여는 중입니다…' : embedded ? '원본 PDF 다시 읽기' : 'PDF 파일 선택 (독립 리더)'}</button><p>Gemini와 함께 읽으려면 Ctrl+O로 PDF를 Chrome 탭에 직접 여세요.</p><p>확장 설정에서 ‘파일 URL에 대한 액세스 허용’을 켜야 로컬 PDF에 적용됩니다.</p></section> : <section className="reader">
        <SplitPane><section className="pane"><ContinuousPdf key={doc.fingerprints[0]} doc={doc} jump={jump} onPage={selectPage} mode={mode} active={active} onActive={onPdfActive} onReady={onReady} onError={onError}/></section>
        <section className="pane translation-pane"><TranslationView done={done} total={sentences.length} hydrating={!parsed}>
          {!sentences.length && <div className="text-empty">{parsed ? '번역할 본문이 없는 페이지입니다.' : '텍스트를 분석하고 있습니다.'}<br/><small>그림·표 등은 제외됩니다. 스캔 페이지의 OCR은 아직 지원하지 않습니다.</small></div>}
          {sentences.map((sentence, index) => <article key={sentence.id} data-sentence={sentence.id} tabIndex={0} className={`sentence ${active === sentence.id ? 'active' : ''} ${translations[sentence.id] ? 'translated' : ''}`} onMouseEnter={() => setActive(sentence.id)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(sentence.id)} onBlur={() => setActive(null)}><span className="sentence-number">{String(index + 1).padStart(2, '0')}</span><div>{translations[sentence.id] ? <p lang="ko" title={sentence.text}>{translations[sentence.id]}</p> : <><p lang="en" className="source-preview">{sentence.text}</p></>}</div></article>)}
        </TranslationView></section></SplitPane>
      </section>}</div><div className="chat-container" hidden={!chatOpen}><CodexPanel doc={doc} page={page} client={codex.current} connected={connected} models={models} model={model} onModel={next => { modelRef.current = next; setModel(next); }} onConnect={() => void connectCodex()} connecting={connecting} onClose={() => setChatOpen(false)} navigate={navigate} quote={quote} systemPrompt={prompts.question} onDisconnect={() => { if (providerRef.current === 'codex') stop(); codex.current.disconnect(); }}/></div></div>
      {doc && <SelectionAction key={doc.fingerprints[0]} onAsk={selection => { setQuote(selection); setChatOpen(true); }}/>}
      {settingsOpen && <CodexSettings value={prompts} onClose={() => setSettingsOpen(false)} onSave={next => {
        promptsRef.current = next; setPrompts(next); setSettingsOpen(false);
        try { localStorage.setItem(settingsKey, JSON.stringify(next)); } catch { setNotice('설정은 현재 탭에 적용했지만 저장 공간에 보관하지 못했습니다.'); }
      }}/>}
    </main>{drag && <div className="drop-overlay">PDF를 놓아 열기</div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
