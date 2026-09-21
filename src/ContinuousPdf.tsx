import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Sentence } from './layout';
import { PdfView } from './PdfView';
import { useViewZoom } from './useViewZoom';

type Props = {
  doc: PDFDocumentProxy; mode: 'auto' | 'single' | 'double'; active: string | null;
  jump: { page: number; serial: number }; onPage(page: number): void;
  onReady(sentences: Sentence[], page: number): void; onActive(id: string | null): void; onError(error: unknown): void;
};
function PageSlot({ number, near, ...props }: Props & { number: number; near: boolean }) {
  const [aspect, setAspect] = useState(612 / 792);
  const ready = useCallback((sentences: Sentence[]) => props.onReady(sentences, number), [props.onReady, number]);
  const size = useCallback((width: number, height: number) => setAspect(width / height), []);
  return <div className="pdf-page-slot" data-page={number} style={{ aspectRatio: aspect }} aria-label={`PDF ${number}페이지`}>
    {near ? <PdfView doc={props.doc} page={number} mode={props.mode} active={props.active} onActive={props.onActive} onReady={ready} onError={props.onError} onSize={size}/> : <div className="page-placeholder">{number}</div>}
  </div>;
}
export function ContinuousPdf(props: Props) {
  const scroll = useRef<HTMLDivElement>(null);
  const { zoom, reset } = useViewZoom(scroll);
  const [near, setNear] = useState<Set<number>>(() => new Set([1, 2]));
  const latest = useRef(props); latest.current = props;
  const current = useRef(1);
  useEffect(() => {
    const root = scroll.current!;
    const observer = new IntersectionObserver(entries => {
      setNear(previous => {
        const next = new Set(previous);
        for (const entry of entries) { const number = Number((entry.target as HTMLElement).dataset.page); if (entry.isIntersecting) next.add(number); else next.delete(number); }
        return next;
      });
    }, { root, rootMargin: '900px 0px' });
    root.querySelectorAll('.pdf-page-slot').forEach(slot => observer.observe(slot));
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (root.scrollHeight <= root.clientHeight + 2) return;
      const target = root.getBoundingClientRect().top + Math.min(120, root.clientHeight * .25);
      const slots = [...root.querySelectorAll<HTMLElement>('.pdf-page-slot')];
      const atBottom = root.scrollTop >= root.scrollHeight - root.clientHeight - 2;
      const slot = atBottom ? slots.at(-1) : slots.find(s => s.getBoundingClientRect().bottom > target) ?? slots.at(-1);
      if (slot) {
        const number = Number(slot.dataset.page);
        if (current.current !== number) { current.current = number; latest.current.onPage(number); }
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    root.addEventListener('scroll', schedule, { passive: true });
    const resize = new ResizeObserver(schedule); resize.observe(root);
    return () => { observer.disconnect(); resize.disconnect(); root.removeEventListener('scroll', schedule); cancelAnimationFrame(frame); };
  }, [props.doc]);
  useEffect(() => {
    const root = scroll.current!, slot = root.querySelector<HTMLElement>(`[data-page="${props.jump.page}"]`);
    if (!slot) return;
    setNear(previous => new Set([...previous, props.jump.page]));
    root.scrollTop += slot.getBoundingClientRect().top - root.getBoundingClientRect().top - 8;
    current.current = props.jump.page;
  }, [props.jump]);
  return <><div className="pane-heading"><h2>원문</h2><button className="zoom-reset" onClick={reset} title="Ctrl+휠로 원문 확대·축소 · 클릭하면 100%" aria-label="원문 배율 초기화">{Math.round(zoom * 100)}%</button></div><div className="pdf-scroll" ref={scroll}><div className="pdf-pages" style={{ width: `${zoom * 100}%` }}>{Array.from({ length: props.doc.numPages }, (_, index) => <PageSlot key={index + 1} {...props} number={index + 1} near={near.has(index + 1)}/>)}</div></div></>;
}
