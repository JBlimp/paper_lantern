import { addToLibrary } from './library';
import { RegionSelection } from './RegionSelection';
import { FloatingChats, type SelectionChat } from './FloatingChats';
import { translateDocument, type PaperTranslation, type CodexWork } from './codexSentences';
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
import { readPage, sourceUnits, setCodexSentences } from './readPage';
import { embedded, readTabPdf } from './pdfSource';
import { CodexClient, type CodexModel } from './codex';
import { CodexPanel } from './CodexPanel';
import { CodexSettings } from './CodexSettings';
import { readPrompts, resolveModel, settingsKey } from './settings';
import { SelectionAction, type SelectionQuote } from './SelectionAction';
import { fileIdentity, loadSession, saveSession, type SavedSession, type ChatMessage } from './sessions';
GlobalWorkerOptions.workerSrc = workerUrl;

function App() {
  const [provider, setProvider] = useState('chrome'),
    providerRef = useRef('chrome');
  const [chatOpen, setChatOpen] = useState(false),
    [connected, setConnected] = useState(false),
    [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [models, setModels] = useState<CodexModel[]>([]),
    modelsRef = useRef<CodexModel[]>([]);
  const reconnectEnabled = useRef(true),
    lastConnectionRepair = useRef(0);
  const connectedRef = useRef(false),
    connectionTask = useRef<Promise<void> | null>(null);
  const codex = useRef(new CodexClient());
  const [settingsOpen, setSettingsOpen] = useState(false),
    [prompts, setPrompts] = useState(readPrompts);
  const promptsRef = useRef(prompts);
  const translationModel = resolveModel(prompts.translationModel, models),
    questionModel = resolveModel(prompts.questionModel, models);
  const [translationOpen, setTranslationOpen] = useState(true);
  const [codexSentenceMap, setCodexSentenceMap] = useState<Sentence[][] | undefined>();
  const codexWorkRef = useRef<CodexWork | undefined>(undefined);
  const [codexWork, setCodexWork] = useState<CodexWork | undefined>();
  const codexSentenceRef = useRef<Sentence[][] | undefined>(undefined);
  const [translatingPaper, setTranslatingPaper] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState(''),
    snapshot = useRef<SavedSession | null>(null);
  const libraryFile = useRef<File | null>(null);
  const [libraryBusy, setLibraryBusy] = useState(false),
    [libraryProgress, setLibraryProgress] = useState(0),
    [libraryAdded, setLibraryAdded] = useState(false);
  const [regionMode, setRegionMode] = useState(false);
  const [selectionChats, setSelectionChats] = useState<SelectionChat[]>([]);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null),
    [name, setName] = useState('');
  const [page, setPage] = useState(1);
  const [jump, setJump] = useState({ page: 1, serial: 0 });
  const pageRef = useRef(1);
  const pageSentences = useRef(new Map<number, Sentence[]>());
  const [mode, setMode] = useState<'auto' | 'single' | 'double'>('auto');
  const [sentences, setSentences] = useState<Sentence[]>([]),
    [translations, setTranslations] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null),
    [ai, setAi] = useState('checking');
  const [progress, setProgress] = useState(0),
    [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [drag, setDrag] = useState(false);
  const translator = useRef<LocalTranslator | null>(null),
    run = useRef(0);
  const translated = useRef<Record<string, string>>({});
  const [completedPages, setCompletedPages] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null),
    documentRef = useRef<PDFDocumentProxy | null>(null);
  const abort = useRef<AbortController | null>(null);
  const onError = useCallback((e: unknown) => setError(errorMessage(e)), []);
  const persist = useCallback(() => {
    if (snapshot.current)
      void saveSession(snapshot.current).catch(() =>
        setNotice('세션을 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.'),
      );
  }, []);
  const onReady = useCallback((s: Sentence[], number: number) => {
    pageSentences.current.set(number, s);
    if (number !== pageRef.current) return;
    setParsed(true);
    setSentences((previous) => (JSON.stringify(previous) === JSON.stringify(s) ? previous : s));
  }, []);
  const onPdfActive = useCallback((id: string | null) => {
    setActive(id);
    if (!id) return;
    const card = document.querySelector<HTMLElement>(`[data-sentence="${id}"]`),
      panel = card?.closest('.translation-scroll');
    if (!card || !panel) return;
    const a = card.getBoundingClientRect(),
      b = panel.getBoundingClientRect();
    if (a.top < b.top) panel.scrollTop += a.top - b.top - 12;
    else if (a.bottom > b.bottom) panel.scrollTop += a.bottom - b.bottom + 12;
  }, []);
  useEffect(() => {
    availability()
      .then((value) => setAi((previous) => (previous === 'checking' ? value : previous)))
      .catch(onError);
    codex.current.onDisconnect = (error) => {
      setConnectionError(error.message);
      connectedRef.current = false;
      setConnected(false);
      modelsRef.current = [];
      setModels([]);
    };
    if (globalThis.chrome?.runtime?.id) void connectCodex(true);
    const settingsChanged = (event: StorageEvent) => {
      if (event.key === settingsKey) {
        const next = readPrompts();
        promptsRef.current = next;
        setPrompts(next);
      }
    };
    window.addEventListener('storage', settingsChanged);
    window.addEventListener('pagehide', persist);
    return () => {
      persist();
      window.removeEventListener('storage', settingsChanged);
      window.removeEventListener('pagehide', persist);
      run.current++;
      abort.current?.abort();
      translator.current?.destroy();
      codex.current.disconnect();
    };
  }, [onError]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (
        globalThis.chrome?.runtime?.id &&
        reconnectEnabled.current &&
        !connectedRef.current &&
        !connectionTask.current &&
        document.visibilityState === 'visible'
      )
        void connectCodex(true);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!embedded) return;
    const controller = new AbortController();
    setLoading(true);
    readTabPdf(controller.signal)
      .then((file) => {
        if (!controller.signal.aborted) void open(file);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setLoading(false);
          onError(e);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (connected && !loading && !busy && providerRef.current === 'codex' && documentRef.current)
      resume(mode);
  }, [connected]);

  useEffect(() => {
    if (!sessionId || !doc || loading) return;
    snapshot.current = {
      id: sessionId,
      schema: 1,
      name,
      updatedAt: Date.now(),
      provider,
      mode,
      page,
      translations,
      completedPages,
      messages,
      translationOpen,
      chatOpen,
      codexSentences: codexSentenceMap,
      codexWork,
      selectionChats,
    };
    const timer = setTimeout(persist, busy ? 250 : 0);
    return () => clearTimeout(timer);
  }, [
    sessionId,
    doc,
    loading,
    name,
    provider,
    mode,
    page,
    translations,
    completedPages,
    messages,
    translationOpen,
    chatOpen,
    busy,
    codexSentenceMap,
    codexWork,
    selectionChats,
    persist,
  ]);

  function stop() {
    run.current++;
    abort.current?.abort();
    translator.current?.destroy();
    translator.current = null;
    setBusy(false);
    setTranslatingPaper(false);
    setPreparing(false);
    setLoading(false);
    setAi('available');
  }
  async function prepare(ticket: number): Promise<LocalTranslator | null> {
    setPreparing(true);
    setProgress(0);
    try {
      // Start only when saved translations do not cover the document.
      if (providerRef.current === 'codex') return null;
      const session = await createTranslator((value) => {
        if (run.current === ticket) setProgress(value);
      });
      if (ticket !== run.current) {
        session.destroy();
        return null;
      }
      translator.current = session;
      setAi('ready');
      return session;
    } catch (e) {
      if (ticket === run.current) {
        onError(e);
        setAi('unavailable');
      }
      return null;
    } finally {
      if (ticket === run.current) setPreparing(false);
    }
  }
  async function translateAll(
    document: PDFDocumentProxy,
    layout: typeof mode,
    ticket: number,
    ready: Promise<LocalTranslator | null>,
  ) {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setCompletedPages(0);
    try {
      // Extract every page, including pages never scrolled into view.
      for (let number = 1; number <= document.numPages; number++) {
        const result = await readPage(document, number, layout);
        if (ticket !== run.current) return;
        onReady(result.sentences, number);
      }
      if (
        (!codexWorkRef.current || codexWorkRef.current.complete) &&
        [...pageSentences.current.values()].every((page) => page.every((s) => translated.current[s.id]))
      ) {
        setCompletedPages(document.numPages);
        return;
      }
      if (providerRef.current === 'codex') {
        if (!connectedRef.current) await connectCodex(true);
        if (ticket !== run.current) return;
        if (!connectedRef.current)
          throw new Error('Codex 연결을 확인해 주세요. 설정에서 모델 목록을 다시 불러올 수 있습니다.');
        setTranslatingPaper(true);
        const units = await sourceUnits(document, layout, controller.signal);
        const apply = (result: Awaited<ReturnType<typeof translateDocument>>) => {
          if (ticket !== run.current) return;
          codexSentenceRef.current = result.pages;
          setCodexSentenceMap(result.pages);
          codexWorkRef.current = result.work;
          setCodexWork(result.work);
          translated.current = result.translations;
          setTranslations(result.translations);
          setCodexSentences(document, layout, result.pages);
          result.pages.forEach((sentences, i) => onReady(sentences, i + 1));
        };
        const result = await translateDocument(
          units,
          document.numPages,
          (pages) =>
            codex.current.request<PaperTranslation>(
              'translateDocument',
              {
                pages,
                model: resolveModel(promptsRef.current.translationModel, modelsRef.current),
                systemPrompt: promptsRef.current.translation,
              },
              controller.signal,
            ),
          controller.signal,
        );
        if (ticket !== run.current) return;
        apply(result);
        setCompletedPages(document.numPages);
        return;
      }
      const session = await ready;
      if (!session || ticket !== run.current) return;
      for (let number = 1; number <= document.numPages; number++) {
        for (const sentence of pageSentences.current.get(number) ?? []) {
          if (ticket !== run.current) return;
          if (translated.current[sentence.id]) continue;
          const result = (await session.translate(sentence.text, { signal: controller.signal })).trim();
          if (ticket !== run.current) return;
          if (!result) throw new Error('빈 번역 결과를 받았습니다. 새로고침 버튼을 눌러 주세요.');
          translated.current[sentence.id] = result;
          setTranslations((previous) => ({ ...previous, [sentence.id]: result }));
        }
        if (ticket !== run.current) return;
        setCompletedPages(number);
      }
    } catch (e) {
      if (ticket === run.current) onError(e);
    } finally {
      if (ticket === run.current) {
        setBusy(false);
        setTranslatingPaper(false);
      }
    }
  }
  async function open(file?: File) {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setError('100MB 이하의 PDF를 열어 주세요.');
      return;
    }
    setRegionMode(false);
    persist();
    stop();
    const ticket = run.current;
    window.getSelection()?.removeAllRanges();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const data = await file.arrayBuffer();
      const id = await fileIdentity(data);
      const saved = await loadSession(id).catch(() => {
        setNotice('저장된 세션을 읽지 못했습니다. 새 세션으로 진행합니다.');
        return null;
      });
      if (ticket !== run.current) return;
      const next = await getDocument({
        data: new Uint8Array(data),
        cMapUrl: new URL('cmaps/', location.href).href,
        cMapPacked: true,
        standardFontDataUrl: new URL('standard_fonts/', location.href).href,
        wasmUrl: new URL('wasm/', location.href).href,
      }).promise;
      if (ticket !== run.current) {
        await next.loadingTask.destroy();
        return;
      }
      const old = documentRef.current;
      const targetProvider = saved?.provider ?? providerRef.current,
        layout = saved?.mode ?? mode;
      providerRef.current = targetProvider;
      setProvider(targetProvider);
      setMode(layout);
      if (targetProvider === 'codex' && !connectedRef.current && saved?.completedPages !== next.numPages)
        await connectCodex(true);
      if (ticket !== run.current) {
        await next.loadingTask.destroy();
        return;
      }
      const restoredPage = Math.max(1, Math.min(next.numPages, saved?.page || 1));
      const restoredSentences = targetProvider === 'codex' ? saved?.codexSentences : undefined;
      codexWorkRef.current = saved?.codexWork;
      setCodexWork(saved?.codexWork);
      codexSentenceRef.current = restoredSentences;
      setCodexSentenceMap(restoredSentences);
      if (restoredSentences) setCodexSentences(next, layout, restoredSentences);
      libraryFile.current = file;
      setLibraryAdded(false);
      documentRef.current = next;
      setDoc(next);
      setName(file.name);
      setPage(restoredPage);
      pageRef.current = restoredPage;
      setSessionId(id);
      pageSentences.current.clear();
      translated.current = saved?.translations ?? {};
      setTranslations({ ...translated.current });
      setCompletedPages(saved?.completedPages ?? 0);
      setMessages(saved?.messages ?? []);
      setSelectionChats(saved?.selectionChats ?? []);
      setTranslationOpen(saved?.translationOpen ?? true);
      if (saved) setChatOpen(saved.chatOpen);
      setJump((previous) => ({ page: restoredPage, serial: previous.serial + 1 }));
      setSentences([]);
      setParsed(false);
      setActive(null);
      const ready = saved?.completedPages === next.numPages ? Promise.resolve(null) : prepare(ticket);
      void translateAll(next, layout, ticket, ready);
      if (old) await old.loadingTask.destroy();
    } catch (e) {
      if (ticket === run.current) {
        stop();
        onError(e);
      }
    } finally {
      if (ticket === run.current) setLoading(false);
    }
  }
  function resume(layout = mode, reset = false) {
    if (!documentRef.current) return;
    stop();
    const ticket = run.current;
    setError('');
    if (reset) {
      codexWorkRef.current = undefined;
      setCodexWork(undefined);
      codexSentenceRef.current = undefined;
      setCodexSentenceMap(undefined);
      setCodexSentences(documentRef.current, layout);
      pageSentences.current.clear();
      translated.current = {};
      setTranslations({});
      setSentences([]);
      setParsed(false);
    }
    const ready = prepare(ticket);
    void translateAll(documentRef.current, layout, ticket, ready);
  }
  function selectPage(next: number) {
    if (pageRef.current === next) return;
    pageRef.current = next;
    setPage(next);
    setActive(null);
    const saved = pageSentences.current.get(next);
    setSentences(saved ?? []);
    setParsed(!!saved);
    document.querySelector('.translation-scroll')?.scrollTo({ top: 0 });
  }
  function connectCodex(silent = false): Promise<void> {
    if (!silent) reconnectEnabled.current = true;
    if (connectionTask.current) return connectionTask.current;
    const task = (async () => {
      setConnecting(true);
      setConnectionError('');
      if (!silent) setError('');
      try {
        let result;
        try {
          result = await codex.current.connect();
        } catch (initialError) {
          if (
            typeof globalThis.chrome?.runtime?.sendMessage !== 'function' ||
            Date.now() - lastConnectionRepair.current < 60000
          )
            throw initialError;
          lastConnectionRepair.current = Date.now();
          const repair = await chrome.runtime.sendMessage({
            type: 'paper-lantern-restart-codex',
            ifIdle: true,
          });
          if (!repair?.restarted) throw initialError;
          codex.current.disconnect();
          result = await codex.current.connect();
        }
        if (
          (result.protocolVersion ?? 0) < 8 &&
          typeof globalThis.chrome?.runtime?.sendMessage === 'function'
        ) {
          await chrome.runtime.sendMessage({ type: 'paper-lantern-restart-codex', ifIdle: true });
          codex.current.disconnect();
          result = await codex.current.connect();
        }
        if ((result.protocolVersion ?? 0) < 8)
          throw new Error(
            `연결 프로그램 버전이 너무 오래되었습니다 (받은 버전: ${result.protocolVersion ?? '없음'}). 로컬 프로그램의 자동 연결 또는 수동 연결을 실행해 주세요.`,
          );
        if (!result.models.length) throw new Error('사용 가능한 Codex 모델이 없습니다.');
        setConnectionError('');
        modelsRef.current = result.models;
        setModels(result.models);
        connectedRef.current = true;
        setConnected(true);
      } catch (e) {
        codex.current.disconnect();
        setConnectionError(errorMessage(e));
        if (!silent) onError(e);
      } finally {
        setConnecting(false);
      }
    })();
    connectionTask.current = task;
    void task.finally(() => {
      connectionTask.current = null;
    });
    return task;
  }
  async function saveToLibrary() {
    const file = libraryFile.current;
    if (!file || libraryBusy) return;
    setLibraryBusy(true);
    setLibraryProgress(0);
    try {
      await addToLibrary(file, setLibraryProgress);
      if (libraryFile.current === file) setLibraryAdded(true);
      setNotice('라이브러리에 추가했습니다. 로컬 프로그램의 라이브러리에서 폴더별로 정리할 수 있습니다.');
    } catch (e) {
      onError(e);
    } finally {
      setLibraryBusy(false);
    }
  }
  function openSelectionChat(selection: SelectionQuote) {
    setSelectionChats((previous) => [
      ...previous.map((chat) => ({ ...chat, collapsed: true })),
      {
        id: crypto.randomUUID(),
        quote: selection,
        messages: [],
        draft: selection.image ? '선택한 그림을 논문 전체 맥락과 함께 설명해줘.' : '',
        x: Math.max(
          8,
          Math.min(selection.position?.x ?? 80, innerWidth - Math.min(440, innerWidth - 16) - 8),
        ),
        y: Math.max(
          8,
          Math.min(selection.position?.y ?? 100, innerHeight - Math.min(540, innerHeight - 40) - 16),
        ),
        collapsed: false,
      },
    ]);
  }
  function changeQuestionModel(model: string) {
    const next = { ...promptsRef.current, questionModel: model };
    localStorage.setItem(settingsKey, JSON.stringify(next));
    promptsRef.current = next;
    setPrompts(next);
  }
  function navigate(next: number) {
    selectPage(next);
    setJump((previous) => ({ page: next, serial: previous.serial + 1 }));
  }
  function showTranslation(open: boolean) {
    const current = pageRef.current;
    setTranslationOpen(open);
    setJump((previous) => ({ page: current, serial: previous.serial + 1 }));
  }
  function showChat(open: boolean) {
    const current = pageRef.current;
    setChatOpen(open);
    setJump((previous) => ({ page: current, serial: previous.serial + 1 }));
  }
  const done = sentences.filter((s) => translations[s.id]).length;
  const status: Record<string, string> = {
    checking: '환경 확인 중',
    missing: '번역 API 없음',
    unavailable: '이 환경에서 사용 불가',
    downloadable: '최초 다운로드 필요',
    downloading: '모델 다운로드 필요',
    available: '모델 시작 가능',
    ready: '로컬 번역 준비됨',
  };
  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault();
        if (!embedded && !loading) setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (!embedded && !loading) void open(e.dataTransfer.files[0]);
      }}
    >
      <main>
        <div className="toolbar" role="toolbar" aria-label="논문 읽기 도구">
          {!embedded && (
            <button onClick={() => fileInput.current?.click()} disabled={loading}>
              파일 선택 (독립 리더)
            </button>
          )}
          <div className="filename" title={name}>
            {loading ? 'PDF 여는 중…' : name}
          </div>
          <select
            aria-label="번역 엔진"
            value={provider}
            disabled={loading}
            onChange={(e) => {
              const next = e.target.value;
              providerRef.current = next;
              setProvider(next);
              if (next === 'codex' && !connected) {
                stop();
                codexWorkRef.current = undefined;
                setCodexWork(undefined);
                codexSentenceRef.current = undefined;
                setCodexSentenceMap(undefined);
                if (documentRef.current) setCodexSentences(documentRef.current, mode);
                setChatOpen(true);
                translated.current = {};
                setTranslations({});
                setCompletedPages(0);
                void connectCodex();
              } else resume(mode, true);
            }}
          >
            <option value="chrome">Chrome 번역</option>
            <option value="codex">Codex 번역</option>
          </select>
          <button
            disabled={!doc || loading || libraryBusy || libraryAdded}
            onClick={() => void saveToLibrary()}
            title="이 PDF를 PC 라이브러리에 복사하여 보관"
          >
            {libraryBusy
              ? `추가 중 · ${libraryProgress}%`
              : libraryAdded
                ? '라이브러리에 추가됨'
                : '라이브러리에 추가'}
          </button>
          <button
            className="region-tool"
            disabled={!doc || loading}
            aria-pressed={regionMode}
            onClick={() => setRegionMode((value) => !value)}
            title="드래그한 그림으로 Codex 질문"
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M7 2H2v5M13 2h5v5M18 13v5h-5M7 18H2v-5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="2 1"
              />
              <path d="m5 13 4-4 3 3 2-2 2 3M12 6h.01" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            이미지 설명
          </button>
          <button onClick={() => showChat(!chatOpen)} aria-pressed={chatOpen}>
            Codex 질문
          </button>
          <button onClick={() => showTranslation(!translationOpen)} aria-pressed={translationOpen}>
            번역
          </button>
          <button onClick={() => setSettingsOpen(true)} aria-label="Codex 설정">
            설정
          </button>
          {provider === 'codex' && connected && (
            <span className="model-label" title="번역 기본 모델">
              {models.find((m) => m.id === translationModel)?.name || translationModel}
            </span>
          )}
          {doc && (
            <>
              <div className="page-controls">
                <button
                  aria-label="이전 페이지"
                  disabled={page <= 1 || loading}
                  onClick={() => navigate(page - 1)}
                >
                  ‹
                </button>
                <span>
                  {page} <em>/ {doc.numPages}</em>
                </span>
                <button
                  aria-label="다음 페이지"
                  disabled={page >= doc.numPages || loading}
                  onClick={() => navigate(page + 1)}
                >
                  ›
                </button>
              </div>
              <select
                aria-label="읽기 순서"
                title="PDF 읽기 순서"
                value={mode}
                disabled={loading}
                onChange={(e) => {
                  const next = e.target.value as typeof mode;
                  setMode(next);
                  resume(next, true);
                }}
              >
                <option value="auto">자동</option>
                <option value="single">1단</option>
                <option value="double">2단</option>
              </select>
            </>
          )}
          <span className="ai-status" role="status" title={status[ai]}>
            {translatingPaper
              ? '논문 전체 번역 중…'
              : preparing
                ? `모델 준비 중 · ${progress}%`
                : doc
                  ? `${busy ? '전체 번역' : completedPages === doc.numPages ? '번역 완료' : '번역 대기'} · ${completedPages} / ${doc.numPages} 페이지`
                  : ''}
          </span>
          {doc &&
            (busy || preparing ? (
              <button onClick={stop}>번역 중단</button>
            ) : (
              <button
                disabled={loading}
                onClick={() => resume(mode, completedPages === doc.numPages)}
                title={
                  provider === 'codex'
                    ? '논문 전체의 문장과 번역을 다시 만듭니다'
                    : completedPages === doc.numPages
                      ? '문장과 번역을 새로 만듭니다'
                      : '완료한 결과는 유지하고 남은 문장과 번역을 이어갑니다'
                }
              >
                새로고침
              </button>
            ))}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          aria-label="PDF 파일 선택"
          className="file-input"
          onChange={(e) => {
            void open(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {error && (
          <div className="message error" role="alert">
            {error}
            <button onClick={() => setError('')} aria-label="오류 닫기">
              ×
            </button>
          </div>
        )}
        {notice && (
          <div className="message" role="status">
            {notice}
            <button onClick={() => setNotice('')} aria-label="알림 닫기">
              ×
            </button>
          </div>
        )}
        <div className="workspace">
          <div className="reading-area">
            {!doc ? (
              <section className="empty">
                <button
                  onClick={() => (embedded ? location.reload() : fileInput.current?.click())}
                  disabled={loading}
                >
                  {loading
                    ? 'PDF를 여는 중입니다…'
                    : embedded
                      ? '원본 PDF 다시 읽기'
                      : 'PDF 파일 선택 (독립 리더)'}
                </button>
                <p>Gemini와 함께 읽으려면 Ctrl+O로 PDF를 Chrome 탭에 직접 여세요.</p>
                <p>확장 설정에서 ‘파일 URL에 대한 액세스 허용’을 켜야 로컬 PDF에 적용됩니다.</p>
              </section>
            ) : (
              <section className="reader">
                <SplitPane collapsed={!translationOpen}>
                  <section className="pane">
                    <ContinuousPdf
                      key={doc.fingerprints[0]}
                      doc={doc}
                      jump={jump}
                      onPage={selectPage}
                      mode={mode}
                      active={active}
                      onActive={onPdfActive}
                      onReady={onReady}
                      onError={onError}
                    />
                  </section>
                  <section
                    className="pane translation-pane"
                    aria-hidden={!translationOpen}
                    inert={!translationOpen}
                  >
                    <TranslationView
                      done={done}
                      total={sentences.length}
                      hydrating={!parsed}
                      onClose={() => showTranslation(false)}
                    >
                      {!sentences.length && (
                        <div className="text-empty">
                          {parsed ? '번역할 본문이 없는 페이지입니다.' : '텍스트를 분석하고 있습니다.'}
                          <br />
                          <small>그림·표 등은 제외됩니다. 스캔 페이지의 OCR은 아직 지원하지 않습니다.</small>
                        </div>
                      )}
                      {sentences.map((sentence, index) => (
                        <article
                          key={sentence.id}
                          data-sentence={sentence.id}
                          tabIndex={0}
                          className={`sentence ${active === sentence.id ? 'active' : ''} ${translations[sentence.id] ? 'translated' : ''}`}
                          onMouseEnter={() => setActive(sentence.id)}
                          onMouseLeave={() => setActive(null)}
                          onFocus={() => setActive(sentence.id)}
                          onBlur={() => setActive(null)}
                        >
                          <span className="sentence-number">{String(index + 1).padStart(2, '0')}</span>
                          <div>
                            {sentence.pages && (
                              <small className="continuation-label">
                                {sentence.pages.join('–')}쪽에 이어지는 문장
                              </small>
                            )}
                            {translations[sentence.id] ? (
                              <p lang="ko" title={sentence.text}>
                                {translations[sentence.id]}
                              </p>
                            ) : (
                              <>
                                <p lang="en" className="source-preview">
                                  {sentence.text}
                                </p>
                              </>
                            )}
                          </div>
                        </article>
                      ))}
                    </TranslationView>
                  </section>
                </SplitPane>
              </section>
            )}
          </div>
          <div className="chat-container" hidden={!chatOpen}>
            <CodexPanel
              doc={doc}
              page={page}
              client={codex.current}
              connected={connected}
              connectionError={connectionError}
              models={models}
              model={questionModel}
              onModelChange={changeQuestionModel}
              messages={messages}
              setMessages={setMessages}
              onSettings={() => setSettingsOpen(true)}
              onConnect={() => void connectCodex()}
              connecting={connecting}
              onClose={() => showChat(false)}
              navigate={navigate}
              quote={null}
              systemPrompt={prompts.question}
              onDisconnect={() => {
                reconnectEnabled.current = false;
                if (providerRef.current === 'codex') stop();
                codex.current.disconnect();
              }}
            />
          </div>
        </div>
        {doc && !regionMode && <SelectionAction key={doc.fingerprints[0]} onAsk={openSelectionChat} />}
        {doc && regionMode && (
          <RegionSelection
            key={doc.fingerprints[0]}
            doc={doc}
            onAsk={openSelectionChat}
            onCancel={() => setRegionMode(false)}
            onError={onError}
          />
        )}

        {doc && (
          <FloatingChats
            chats={selectionChats}
            setChats={setSelectionChats}
            doc={doc}
            page={page}
            client={codex.current}
            connected={connected}
            connectionError={connectionError}
            models={models}
            model={questionModel}
            onModelChange={changeQuestionModel}
            onSettings={() => setSettingsOpen(true)}
            onConnect={() => void connectCodex()}
            connecting={connecting}
            navigate={navigate}
            systemPrompt={prompts.question}
            onDisconnect={() => {
              reconnectEnabled.current = false;
              if (providerRef.current === 'codex') stop();
              codex.current.disconnect();
            }}
          />
        )}
        {settingsOpen && (
          <CodexSettings
            companionVersion={codex.current.version}
            value={prompts}
            models={models}
            connected={connected}
            connecting={connecting}
            connectionError={connectionError}
            onConnect={() => {
              reconnectEnabled.current = true;
              void connectCodex(true);
            }}
            onClose={() => setSettingsOpen(false)}
            onSave={(next) => {
              promptsRef.current = next;
              setPrompts(next);
              setSettingsOpen(false);
              try {
                localStorage.setItem(settingsKey, JSON.stringify(next));
              } catch {
                setNotice('설정은 현재 탭에 적용했지만 저장 공간에 보관하지 못했습니다.');
              }
            }}
          />
        )}
      </main>
      {drag && <div className="drop-overlay">PDF를 놓아 열기</div>}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
