import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export function useViewZoom(view: RefObject<HTMLDivElement | null>) {
  const [zoom, setZoom] = useState(1);
  const current = useRef(1);
  const anchor = useRef<{ element: HTMLElement | null; fraction: number; x: number; y: number; left: number; top: number; previous: number } | null>(null);
  function change(next: number, clientX?: number, clientY?: number) {
    const root = view.current;
    if (!root) return;
    next = Math.round(Math.max(.5, Math.min(3, next)) * 100) / 100;
    if (next === current.current) return;
    const bounds = root.getBoundingClientRect();
    const x = clientX ?? bounds.left + root.clientWidth / 2, y = clientY ?? bounds.top + Math.min(120, root.clientHeight / 2);
    const element = [...root.querySelectorAll<HTMLElement>('.pdf-page-slot, .sentence')].find(e => { const r = e.getBoundingClientRect(); return r.top <= y && r.bottom >= y; }) ?? null;
    const rect = element?.getBoundingClientRect();
    anchor.current = { element, fraction: rect ? (y - rect.top) / rect.height : 0, x: x - bounds.left, y: y - bounds.top, left: root.scrollLeft, top: root.scrollTop, previous: current.current };
    current.current = next; setZoom(next);
  }
  useEffect(() => {
    const root = view.current!;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? root.clientHeight : 1);
      change(current.current * Math.exp(-Math.max(-100, Math.min(100, delta)) * .002), event.clientX, event.clientY);
    };
    root.addEventListener('wheel', wheel, { passive: false });
    return () => root.removeEventListener('wheel', wheel);
  }, [view]);
  useLayoutEffect(() => {
    const root = view.current, saved = anchor.current;
    if (!root || !saved) return;
    root.scrollLeft = (saved.left + saved.x) * zoom / saved.previous - saved.x;
    if (saved.element?.isConnected) {
      const rect = saved.element.getBoundingClientRect();
      root.scrollTop += rect.top + rect.height * saved.fraction - root.getBoundingClientRect().top - saved.y;
    } else root.scrollTop = (saved.top + saved.y) * zoom / saved.previous - saved.y;
    anchor.current = null;
  }, [zoom, view]);
  return { zoom, reset: () => change(1) };
}
