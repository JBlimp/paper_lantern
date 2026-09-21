import { useEffect, useState } from 'react';
import type { TextPage } from './codex';

export type SelectionQuote = { pages: TextPage[]; serial: number };
export function selectedPdfPages(): TextPage[] {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return [];
  const range = selection.getRangeAt(0);
  if (!selection.anchorNode?.parentElement?.closest('.textLayer') || !selection.focusNode?.parentElement?.closest('.textLayer')) return [];
  const pages: TextPage[] = [];
  let remaining = 12000;
  const intersect = (element: Element) => {
    const part = document.createRange(); part.selectNodeContents(element);
    if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(range.startContainer, range.startOffset);
    if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset);
    return part.toString();
  };
  for (const slot of document.querySelectorAll<HTMLElement>('.pdf-page-slot[data-page]')) {
    const layer = slot.querySelector('.textLayer');
    if (!layer || !range.intersectsNode(layer) || remaining <= 0) continue;
    const text = [...layer.querySelectorAll('span')].filter(span => !span.querySelector('span') && range.intersectsNode(span)).map(intersect).filter(Boolean).join(' ').trim().slice(0, remaining);
    if (text) { pages.push({ page: Number(slot.dataset.page), text }); remaining -= text.length; }
  }
  if (pages.length === 1 && selection.anchorNode?.parentElement?.closest('[data-page]') === selection.focusNode?.parentElement?.closest('[data-page]')) pages[0].text = selection.toString().trim().slice(0, 12000);
  return pages;
}
export function SelectionAction({ onAsk }: { onAsk: (quote: SelectionQuote) => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number; pages: TextPage[] } | null>(null);
  useEffect(() => {
    const hide = () => setMenu(null);
    const collapse = () => { if (window.getSelection()?.isCollapsed) hide(); };
    const update = (event: Event) => {
      if ((event.target as Element)?.closest?.('.selection-action')) return;
      const pages = selectedPdfPages();
      if (!pages.length) { hide(); return; }
      const rect = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
      setMenu({ pages, x: Math.max(8, Math.min(innerWidth - 160, rect.left)), y: Math.max(8, Math.min(innerHeight - 44, rect.bottom + 8)) });
    };
    const keyboard = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); else if (event.shiftKey) update(event); };
    document.addEventListener('pointerup', update); document.addEventListener('keyup', keyboard);
    document.addEventListener('selectionchange', collapse);
    document.addEventListener('scroll', hide, true); window.addEventListener('resize', hide);
    return () => { document.removeEventListener('pointerup', update); document.removeEventListener('keyup', keyboard); document.removeEventListener('selectionchange', collapse); document.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); };
  }, []);
  if (!menu) return null;
  return <button className="selection-action" style={{ left: menu.x, top: menu.y }} onPointerDown={e => e.preventDefault()} onClick={() => { onAsk({ pages: menu.pages, serial: Date.now() }); setMenu(null); }}>Codex에게 질문</button>;
}
