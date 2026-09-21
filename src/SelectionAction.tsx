import { useEffect, useState } from 'react';
import type { TextPage } from './codex';

export type SelectionQuote = {
  pages: TextPage[];
  serial: number;
  position?: { x: number; y: number };
  boxes?: QuoteBox[];
  image?: { page: number; dataUrl: string };
};
export type QuoteBox = { page: number; x: number; y: number; width: number; height: number };
export function quoteBoxes(range: Range): QuoteBox[] {
  const boxes: QuoteBox[] = [];
  for (const stage of document.querySelectorAll<HTMLElement>('.pdf-stage')) {
    const origin = stage.getBoundingClientRect(),
      page = Number(stage.closest('[data-page]')?.getAttribute('data-page'));
    if (!origin.width || !origin.height) continue;
    for (const span of stage.querySelectorAll('.textLayer span')) {
      if (span.querySelector('span') || !range.intersectsNode(span)) continue;
      const part = document.createRange();
      part.selectNodeContents(span);
      if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0)
        part.setStart(range.startContainer, range.startOffset);
      if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0)
        part.setEnd(range.endContainer, range.endOffset);
      for (const r of part.getClientRects())
        if (r.width > 0 && r.height > 0)
          boxes.push({
            page,
            x: (r.left - origin.left) / origin.width,
            y: (r.top - origin.top) / origin.height,
            width: r.width / origin.width,
            height: r.height / origin.height,
          });
    }
  }
  return boxes;
}
export function selectedPdfPages(): TextPage[] {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return [];
  const range = selection.getRangeAt(0);
  if (
    !selection.anchorNode?.parentElement?.closest('.textLayer') ||
    !selection.focusNode?.parentElement?.closest('.textLayer')
  )
    return [];
  const pages: TextPage[] = [];
  let remaining = 12000;
  const intersect = (element: Element) => {
    const part = document.createRange();
    part.selectNodeContents(element);
    if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0)
      part.setStart(range.startContainer, range.startOffset);
    if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0)
      part.setEnd(range.endContainer, range.endOffset);
    return part.toString();
  };
  for (const slot of document.querySelectorAll<HTMLElement>('.pdf-page-slot[data-page]')) {
    const layer = slot.querySelector('.textLayer');
    if (!layer || !range.intersectsNode(layer) || remaining <= 0) continue;
    const text = [...layer.querySelectorAll('span')]
      .filter((span) => !span.querySelector('span') && range.intersectsNode(span))
      .map(intersect)
      .filter(Boolean)
      .join(' ')
      .trim()
      .slice(0, remaining);
    if (text) {
      pages.push({ page: Number(slot.dataset.page), text });
      remaining -= text.length;
    }
  }
  if (
    pages.length === 1 &&
    selection.anchorNode?.parentElement?.closest('[data-page]') ===
      selection.focusNode?.parentElement?.closest('[data-page]')
  )
    pages[0].text = selection.toString().trim().slice(0, 12000);
  return pages;
}
export function SelectionAction({ onAsk }: { onAsk: (quote: SelectionQuote) => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number; pages: TextPage[]; boxes: QuoteBox[] } | null>(
    null,
  );
  useEffect(() => {
    const hide = () => setMenu(null);
    const collapse = () => {
      if (window.getSelection()?.isCollapsed) hide();
    };
    const update = (event: Event) => {
      if ((event.target as Element)?.closest?.('.selection-action')) return;
      const pages = selectedPdfPages();
      if (!pages.length) {
        hide();
        return;
      }
      const rect = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
      setMenu({
        pages,
        boxes: quoteBoxes(window.getSelection()!.getRangeAt(0)),
        x: Math.max(8, Math.min(innerWidth - 160, rect.left)),
        y: Math.max(8, Math.min(innerHeight - 44, rect.bottom + 8)),
      });
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
      else if (event.shiftKey) update(event);
    };
    document.addEventListener('pointerup', update);
    document.addEventListener('keyup', keyboard);
    document.addEventListener('selectionchange', collapse);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('pointerup', update);
      document.removeEventListener('keyup', keyboard);
      document.removeEventListener('selectionchange', collapse);
      document.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, []);
  if (!menu) return null;
  return (
    <button
      className="selection-action"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => {
        onAsk({
          pages: menu.pages,
          boxes: menu.boxes,
          serial: Date.now(),
          position: { x: menu.x, y: menu.y },
        });
        setMenu(null);
        window.getSelection()?.removeAllRanges();
      }}
    >
      Codex에게 질문
    </button>
  );
}
