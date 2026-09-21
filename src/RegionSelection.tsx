import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { QuoteBox, SelectionQuote } from './SelectionAction';

type Drag = { stage: HTMLElement; page: number; x: number; y: number; endX: number; endY: number };
export function RegionSelection({
  doc,
  onAsk,
  onCancel,
  onError,
}: {
  doc: PDFDocumentProxy;
  onAsk: (quote: SelectionQuote) => void;
  onCancel: () => void;
  onError: (e: unknown) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let current: Drag | null = null,
      pointer: number | null = null,
      alive = true,
      capturing = false;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    document.body.classList.add('selecting-region');
    window.getSelection()?.removeAllRanges();
    const point = (e: PointerEvent, stage: HTMLElement) => {
      const r = stage.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
        y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
      };
    };
    const down = (e: PointerEvent) => {
      const stage = (e.target as Element)?.closest<HTMLElement>('.pdf-stage');
      if (!stage || e.button !== 0 || capturing) return;
      e.preventDefault();
      e.stopPropagation();
      const p = point(e, stage);
      pointer = e.pointerId;
      stage.setPointerCapture(pointer);
      current = {
        stage,
        page: Number(stage.closest('[data-page]')?.getAttribute('data-page')),
        x: p.x,
        y: p.y,
        endX: p.x,
        endY: p.y,
      };
      setDrag(current);
    };
    const move = (e: PointerEvent) => {
      if (!current || pointer !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      const p = point(e, current.stage);
      current = { ...current, endX: p.x, endY: p.y };
      setDrag(current);
    };
    const up = async (e: PointerEvent) => {
      if (!current || pointer !== e.pointerId) return;
      move(e);
      const selection = current;
      current = null;
      pointer = null;
      if (selection.stage.hasPointerCapture(e.pointerId)) selection.stage.releasePointerCapture(e.pointerId);
      const box: QuoteBox = {
        page: selection.page,
        x: Math.min(selection.x, selection.endX),
        y: Math.min(selection.y, selection.endY),
        width: Math.abs(selection.x - selection.endX),
        height: Math.abs(selection.y - selection.endY),
      };
      const bounds = selection.stage.getBoundingClientRect();
      if (box.width * bounds.width < 8 || box.height * bounds.height < 8) {
        setDrag(null);
        return;
      }
      capturing = true;
      setBusy(true);
      try {
        const page = await doc.getPage(box.page);
        if (!alive) return;
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(6, 1600 / Math.max(box.width * base.width, box.height * base.height));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(box.width * viewport.width));
        canvas.height = Math.max(1, Math.ceil(box.height * viewport.height));
        render = page.render({
          canvas,
          viewport,
          transform: [1, 0, 0, 1, -box.x * viewport.width, -box.y * viewport.height],
          background: 'white',
        });
        await render.promise;
        let dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        // Bound native-message size while retaining readable figure labels.
        for (let i = 0; dataUrl.length > 600000 && i < 6; i++) {
          const small = document.createElement('canvas');
          small.width = Math.max(1, Math.round(canvas.width * 0.8));
          small.height = Math.max(1, Math.round(canvas.height * 0.8));
          small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height);
          canvas.width = small.width;
          canvas.height = small.height;
          canvas.getContext('2d')!.drawImage(small, 0, 0);
          dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        }
        if (dataUrl.length > 600000)
          throw new Error('이미지 영역이 너무 복잡합니다. 조금 더 작은 영역을 선택해 주세요.');
        if (!alive) return;
        onAsk({
          pages: [{ page: box.page, text: '선택한 그림 영역' }],
          serial: Date.now(),
          boxes: [box],
          image: { page: box.page, dataUrl },
          position: {
            x: bounds.left + box.x * bounds.width,
            y: bounds.top + (box.y + box.height) * bounds.height + 8,
          },
        });
        onCancel();
      } catch (error) {
        if (alive) {
          onError(error);
          onCancel();
        }
      }
    };
    const cancel = () => {
      current = null;
      pointer = null;
      setDrag(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('keydown', key, true);
    return () => {
      alive = false;
      render?.cancel();
      if (current && pointer !== null && current.stage.hasPointerCapture(pointer))
        current.stage.releasePointerCapture(pointer);
      document.body.classList.remove('selecting-region');
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [doc]);
  return (
    <>
      <div className="region-hint" role="status">
        {busy ? '선택한 이미지를 준비하고 있습니다…' : '그림 영역을 드래그하세요 · Esc로 취소'}
      </div>
      {drag &&
        createPortal(
          <div
            className="region-selection-box"
            style={{
              left: `${Math.min(drag.x, drag.endX) * 100}%`,
              top: `${Math.min(drag.y, drag.endY) * 100}%`,
              width: `${Math.abs(drag.endX - drag.x) * 100}%`,
              height: `${Math.abs(drag.endY - drag.y) * 100}%`,
            }}
          />,
          drag.stage,
        )}
    </>
  );
}
