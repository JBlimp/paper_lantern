import { ExtensionId } from './ExtensionId';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { rawPage } from './readPage';
import { CodexClient, type CodexModel } from './codex';
import { type SelectionQuote } from './SelectionAction';
import type { ChatMessage } from './sessions';
import type { Dispatch, SetStateAction } from 'react';

export function CodexPanel({
  doc,
  page,
  client,
  connected,
  connectionError,
  models,
  model,
  onConnect,
  connecting,
  onClose,
  navigate,
  quote,
  systemPrompt,
  onDisconnect,
  messages,
  setMessages,
  onSettings,
  onModelChange,
  draft,
  onDraftChange,
}: {
  doc: PDFDocumentProxy | null;
  page: number;
  client: CodexClient;
  connected: boolean;
  connectionError?: string;
  models: CodexModel[];
  model: string;
  onConnect: () => void;
  connecting: boolean;
  onClose: () => void;
  navigate: (page: number) => void;
  quote: SelectionQuote | null;
  systemPrompt: string;
  onDisconnect: () => void;
  onModelChange: (model: string) => void;
  draft?: string;
  onDraftChange?: (value: string) => void;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  onSettings: () => void;
}) {
  const [question, setQuestion] = useState(draft ?? '');
  const input = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null),
    scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setQuestion(draft ?? '');
    setError('');
    setBusy(false);
    controller.current?.abort();
    return () => controller.current?.abort();
  }, [doc]);
  useEffect(() => {
    onDraftChange?.(question);
  }, [question]);
  useEffect(() => {
    if (quote) input.current?.focus();
  }, [quote?.serial, connected]);
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [messages, busy]);
  async function ask() {
    if (!doc || !connected || busy || !question.trim()) return;
    const request = new AbortController();
    controller.current = request;
    const text = question.trim();
    setQuestion('');
    setBusy(true);
    setError('');
    const history = messages.slice(-8).map((m) => ({ role: m.role, text: m.text.slice(0, 4000) }));
    setMessages((previous) => [...previous, { role: 'user', text }]);
    try {
      const pages = [];
      const focus = quote?.pages.map((p) => ({ ...p })) ?? [];
      const numbers = Array.from({ length: doc.numPages }, (_, i) => i + 1);
      for (const number of numbers) {
        request.signal.throwIfAborted();
        const raw = await rawPage(doc, number);
        pages.push({ page: number, text: raw.words.map((w) => w.str).join(' ') });
      }
      request.signal.throwIfAborted();
      const context = pages,
        coverage = 'full';
      const result = await client.request<{ answer: string; pages: number[] }>(
        'ask',
        {
          question: text,
          history,
          pages: context,
          selection: focus,
          coverage,
          model,
          systemPrompt,
          image: quote?.image,
        },
        request.signal,
      );
      if (!request.signal.aborted)
        setMessages((previous) => [
          ...previous,
          { role: 'assistant', text: result.answer, pages: result.pages },
        ]);
    } catch (e) {
      if (!request.signal.aborted) {
        setError(e instanceof Error ? e.message : String(e));
        setQuestion(text);
      }
    } finally {
      if (controller.current === request) setBusy(false);
    }
  }
  return (
    <aside className="codex-panel" aria-label="Codex 질문">
      <header>
        <strong>Codex</strong>
        <span>{connected ? '연결됨' : '연결 안 됨'}</span>
        {connected && (
          <button
            className="disconnect-button"
            onClick={() => {
              controller.current?.abort();
              setBusy(false);
              onDisconnect();
            }}
          >
            연결 해제
          </button>
        )}
        <button onClick={onClose} aria-label="Codex 패널 닫기">
          ×
        </button>
      </header>
      {!connected ? (
        <div className="codex-setup">
          <p>
            {connecting
              ? '실행 중인 PC 프로그램에 연결하고 있습니다.'
              : '시작 메뉴에서 Paper Lantern을 실행해 주세요.'}
          </p>
          <ExtensionId />
          {connectionError && (
            <p className="chat-error" role="alert">
              {connectionError}
            </p>
          )}
          <p>
            로컬 Paper Lantern을 실행하면 확장을 자동으로 찾아 연결합니다. 연결되지 않으면{' '}
            <strong>확장 자동 연결</strong>을 눌러 주세요. Codex 로그인이 필요합니다.
          </p>
          <button onClick={onConnect} disabled={connecting}>
            {connecting ? '연결 중…' : 'Codex 연결'}
          </button>
        </div>
      ) : null}
      {quote && (
        <div className="selection-preview" title="논문 전체를 참고해 이 부분에 답합니다">
          {quote.image ? (
            <img
              className="figure-preview"
              src={quote.image.dataUrl}
              alt={`${quote.image.page}쪽 선택한 그림`}
            />
          ) : (
            quote.pages.map((p) => p.text).join('\n')
          )}
        </div>
      )}
      <div className="chat-messages" ref={scroll} aria-live="polite">
        {!messages.length && <p className="chat-empty">논문의 핵심 내용, 방법, 실험 결과를 물어보세요.</p>}
        {messages.map((m, i) => (
          <article key={i} className={`chat-message ${m.role}`}>
            <small>{m.role === 'user' ? '나' : 'Codex'}</small>
            {m.role === 'assistant' ? (
              <div className="chat-markdown">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  skipHtml
                  components={{
                    a: ({ children, href }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    ),
                    img: ({ alt }) => <span>{alt}</span>,
                    table: ({ children }) => (
                      <div className="markdown-table">
                        <table>{children}</table>
                      </div>
                    ),
                  }}
                >
                  {m.text}
                </Markdown>
              </div>
            ) : (
              <p>{m.text}</p>
            )}
            {m.pages?.length ? (
              <div className="chat-citations">
                {m.pages.map((p) => (
                  <button key={p} onClick={() => navigate(p)}>
                    {p}쪽
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        ))}
        {busy && <p role="status">답변을 작성하고 있습니다…</p>}
      </div>
      {error && (
        <p className="chat-error" role="alert">
          최근 질문 실패: {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <textarea
          ref={input}
          aria-label="논문 질문"
          placeholder={quote ? '선택한 내용에 대해 질문하세요' : '논문에 대해 질문하세요'}
          value={question}
          maxLength={4000}
          disabled={!doc || !connected}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void ask();
            }
          }}
        />
        <div className="chat-composer-actions">
          <select
            className="chat-model"
            aria-label="질문 모델"
            title="질문 기본 모델"
            value={model}
            disabled={!connected || !models.length}
            onChange={(e) => onModelChange(e.target.value)}
          >
            {!models.length && <option value={model}>연결 안 됨</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="chat-settings"
            aria-label="질문 설정"
            title="시스템 프롬프트와 기본 모델 설정"
            onClick={onSettings}
          >
            ⚙
          </button>
          <button type="button" disabled={busy || !messages.length} onClick={() => setMessages([])}>
            대화 지우기
          </button>
          {busy ? (
            <button
              type="button"
              onClick={() => {
                controller.current?.abort();
                setBusy(false);
              }}
            >
              중단
            </button>
          ) : (
            <button type="submit" className="primary" disabled={!connected || !doc || !question.trim()}>
              질문
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}
