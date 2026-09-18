import { useRef, type ReactNode, type CSSProperties } from 'react';
import { useViewZoom } from './useViewZoom';

export function TranslationView({ children, done, total, hydrating }: { children: ReactNode; done: number; total: number; hydrating: boolean }) {
  const view = useRef<HTMLDivElement>(null);
  const { zoom, reset } = useViewZoom(view);
  return <><div className="pane-heading"><h2>번역</h2><div className="translation-tools"><span>{hydrating ? '불러오는 중…' : `${done} / ${total}`}</span><button className="zoom-reset" onClick={reset} title="Ctrl+휠로 번역 확대·축소 · 클릭하면 100%" aria-label="번역 배율 초기화">{Math.round(zoom * 100)}%</button></div></div><div ref={view} className="translation-scroll" style={{ '--reader-font-size': `${14 * zoom}px` } as CSSProperties}>{children}</div></>;
}
