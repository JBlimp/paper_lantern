import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type Dispatch,
  type SetStateAction,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { CodexPanel } from './CodexPanel';
import type { ChatMessage } from './sessions';
import { quoteBoxes, type SelectionQuote, type QuoteBox } from './SelectionAction';

export type SelectionChat = {
  id: string;
  quote: SelectionQuote;
  messages: ChatMessage[];
  draft: string;
  x: number;
  y: number;
  collapsed: boolean;
  anchor?: { page: number; x: number; y: number };
};
type Shared = Omit<
  ComponentProps<typeof CodexPanel>,
  'messages' | 'setMessages' | 'quote' | 'onClose' | 'draft' | 'onDraftChange'
>;
const slotFor = (page: number) => document.querySelector<HTMLElement>(`.pdf-page-slot[data-page="${page}"]`);
function SourceHighlight({ quote }: { quote: SelectionQuote }) {
  // Older saved conversations have text but no geometry. Recover their first exact occurrence.
  let boxes = quote.boxes;
  if (!boxes?.length) {
    boxes = [];
    for (const passage of quote.pages) {
      const nodes = [...(slotFor(passage.page)?.querySelectorAll('.textLayer span') ?? [])]
        .filter((s) => !s.querySelector('span'))
        .map((s) => s.firstChild)
        .filter((n): n is ChildNode => !!n);
      const positions: { node: ChildNode; offset: number }[] = [];
      let text = '';
      for (const node of nodes)
        for (let i = 0; i < (node.textContent?.length ?? 0); i++)
          if (!/\s/.test(node.textContent![i])) {
            text += node.textContent![i];
            positions.push({ node, offset: i });
          }
      const needle = passage.text.replace(/\s/g, ''),
        start = text.indexOf(needle);
      if (!needle || start < 0) continue;
      const first = positions[start],
        last = positions[start + needle.length - 1],
        range = document.createRange();
      range.setStart(first.node, first.offset);
      range.setEnd(last.node, last.offset + 1);
      boxes.push(...quoteBoxes(range));
    }
  }
  return (
    <>
      {boxes.map((box: QuoteBox, i: number) => {
        const slot = slotFor(box.page);
        if (!slot) return null;
        return createPortal(
          <div
            aria-hidden="true"
            className="quote-source-highlight"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
            }}
          />,
          slot,
          String(i),
        );
      })}
    </>
  );
}
function FloatingChat({
  chat,
  patch,
  remove,
  shared,
  setMessages,
}: {
  chat: SelectionChat;
  patch: (changes: Partial<SelectionChat>) => void;
  remove: () => void;
  shared: Shared;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
}) {
  const host = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [highlight, setHighlight] = useState(false),
    [position, setPosition] = useState({ x: 0, y: 0 });
  const paper = document.querySelector<HTMLElement>('.pdf-pages');
  const page = chat.anchor?.page ?? chat.quote.pages[0].page;
  function move(left: number, top: number) {
    const slot = slotFor(page);
    if (!slot || !paper) return;
    const r = slot.getBoundingClientRect(),
      area = paper.getBoundingClientRect();
    left = Math.max(area.left, Math.min(area.right - 40, left));
    top = Math.max(area.top, Math.min(area.bottom - 40, top));
    patch({ anchor: { page, x: (left - r.left) / r.width, y: (top - r.top) / r.height } });
  }
  useLayoutEffect(() => {
    const slot = slotFor(page);
    if (!slot || !paper) return;
    if (!chat.anchor) {
      const r = slot.getBoundingClientRect();
      const width = chat.collapsed ? 280 : 440;
      const left = Math.max(r.left, Math.min(chat.x, r.right - Math.min(width, r.width)));
      patch({ anchor: { page, x: (left - r.left) / r.width, y: Math.max(0, (chat.y - r.top) / r.height) } });
      return;
    }
    const update = () => {
      const r = slot.getBoundingClientRect(),
        origin = paper.getBoundingClientRect();
      setPosition({
        x: r.left - origin.left + chat.anchor!.x * r.width,
        y: r.top - origin.top + chat.anchor!.y * r.height,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(paper);
    observer.observe(slot);
    return () => observer.disconnect();
  }, [paper, page, chat.anchor, chat.collapsed]);
  const handlers = {
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const r = host.current!.getBoundingClientRect();
      suppressClick.current = false;
      drag.current = { x: event.clientX, y: event.clientY, left: r.left, top: r.top, moved: false };
      setHighlight(true);
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      const d = drag.current;
      if (!d) return;
      const dx = event.clientX - d.x,
        dy = event.clientY - d.y;
      if (Math.hypot(dx, dy) > 4) d.moved = true;
      if (d.moved) move(d.left + dx, d.top + dy);
    },
    onPointerUp() {
      suppressClick.current = !!drag.current?.moved;
      drag.current = null;
      setHighlight(false);
    },
    onPointerCancel() {
      drag.current = null;
      suppressClick.current = false;
      setHighlight(false);
    },
    onLostPointerCapture() {
      drag.current = null;
      setHighlight(false);
    },
    onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-20, 0],
        ArrowRight: [20, 0],
        ArrowUp: [0, -20],
        ArrowDown: [0, 20],
      };
      if (!delta[event.key]) return;
      event.preventDefault();
      const r = host.current!.getBoundingClientRect(),
        [x, y] = delta[event.key];
      move(r.left + x, r.top + y);
      setHighlight(true);
    },
    onBlur() {
      if (!drag.current) setHighlight(false);
    },
  };
  if (!paper) return null;
  return createPortal(
    <div
      ref={host}
      className={`selection-chat ${chat.collapsed ? 'folded' : ''}`}
      style={{ left: position.x, top: position.y }}
    >
      {highlight && <SourceHighlight quote={chat.quote} />}
      {chat.collapsed && (
        <div className="chat-chip">
          <button
            {...handlers}
            className="chat-drag-handle"
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              patch({ collapsed: false });
            }}
            title="클릭하여 열기 · 드래그하여 이동"
          >
            ✦ {chat.quote.pages[0].page}쪽 · {chat.quote.pages[0].text.slice(0, 32)}
          </button>
          <button aria-label="선택 대화 삭제" onClick={remove}>
            ×
          </button>
        </div>
      )}
      <section
        role="dialog"
        aria-label="선택한 부분 질문"
        hidden={chat.collapsed}
        className="selection-chat-window"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            patch({ collapsed: true });
            setHighlight(false);
          }
        }}
      >
        <header className="selection-chat-header">
          <button {...handlers} className="chat-drag-handle" aria-label="선택 대화 이동">
            ✦ {chat.quote.pages.map((p) => p.page).join(', ')}쪽 · Codex
          </button>
          <button aria-label="선택 대화 접기" title="접기 · Esc" onClick={() => patch({ collapsed: true })}>
            —
          </button>
        </header>
        <CodexPanel
          {...shared}
          quote={chat.quote}
          messages={chat.messages}
          draft={chat.draft}
          onDraftChange={(draft) => {
            if (draft !== chat.draft) patch({ draft });
          }}
          setMessages={setMessages}
          onClose={() => patch({ collapsed: true })}
        />
      </section>
    </div>,
    paper,
  );
}
export function FloatingChats({
  chats,
  setChats,
  ...shared
}: Shared & { chats: SelectionChat[]; setChats: Dispatch<SetStateAction<SelectionChat[]>> }) {
  return (
    <>
      {chats.map((chat) => (
        <FloatingChat
          key={chat.id}
          chat={chat}
          shared={shared}
          patch={(changes) =>
            setChats((previous) => previous.map((c) => (c.id === chat.id ? { ...c, ...changes } : c)))
          }
          remove={() => setChats((previous) => previous.filter((c) => c.id !== chat.id))}
          setMessages={(update) =>
            setChats((previous) =>
              previous.map((c) =>
                c.id === chat.id
                  ? { ...c, messages: typeof update === 'function' ? update(c.messages) : update }
                  : c,
              ),
            )
          }
        />
      ))}
    </>
  );
}
