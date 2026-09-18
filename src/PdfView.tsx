import { useCallback, useEffect, useRef, useState } from 'react';
import { TextLayer, type PDFDocumentProxy } from 'pdfjs-dist';
import type { Sentence } from './layout';
import { CitationPopup } from './CitationPopup';
import { citationNumbers } from './references';
import { readPage } from './readPage';
type Box = { id: string; x: number; y: number; width: number; height: number };
export function PdfView({ doc, page, mode, active, onActive, onReady, onError, onSize }: {
  doc: PDFDocumentProxy; page: number; mode: 'auto' | 'single' | 'double'; active: string | null;
  onActive(id: string | null): void; onReady(sentences: Sentence[]): void; onError(error: unknown): void;
  onSize?(width: number, height: number): void;
}) {
  const [citations, setCitations] = useState<(Omit<Box, 'id'> & { numbers: number[] })[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<number[] | null>(null);
  const closeCitation = useCallback(() => setSelectedCitation(null), []);
  const host = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null), text = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(650), [height, setHeight] = useState(850), [boxes, setBoxes] = useState<Box[]>([]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(([entry]) => { clearTimeout(timer); timer = setTimeout(() => setWidth(Math.max(80, Math.floor(entry.contentRect.width))), 100); });
    observer.observe(host.current!); return () => { observer.disconnect(); clearTimeout(timer); };
  }, []);
  useEffect(() => {
    let canceled = false;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    let layer: TextLayer | undefined;
    setBoxes([]); setCitations([]); setSelectedCitation(null);
    const task = async () => {
      const pdfPage = await doc.getPage(page);
      if (canceled) return;
      const base = pdfPage.getViewport({ scale: 1 }), scale = width / base.width;
      const viewport = pdfPage.getViewport({ scale });
      onSize?.(viewport.width, viewport.height);
      setHeight(viewport.height);
      // Text spans use percentage positions. Apply the new height before measuring
      // their ranges, rather than waiting for React's next layout commit.
      stage.current!.style.height = `${viewport.height}px`;
      const c = canvas.current!, container = text.current!;
      const ratio = Math.min(devicePixelRatio, 2);
      c.width = Math.floor(viewport.width * ratio); c.height = Math.floor(viewport.height * ratio);
      c.style.width = `${viewport.width}px`; c.style.height = `${viewport.height}px`;
      stage.current!.style.setProperty('--total-scale-factor', String(scale));
      stage.current!.style.setProperty('--scale-factor', String(scale));
      render = pdfPage.render({ canvas: c, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      // A page switch may cancel rendering while text extraction is still awaiting.
      void render.promise.catch(() => {});
      const { content, sentences } = await readPage(doc, page, mode);
      if (canceled) return;
      container.replaceChildren();
      layer = new TextLayer({ textContentSource: content, container, viewport });
      await Promise.all([render.promise, layer.render()]);
      if (canceled) return;
      const origin = stage.current!.getBoundingClientRect();
      const next: Box[] = [];
      for (const sentence of sentences) for (const fragment of sentence.fragments) {
        const node = layer.textDivs[fragment.item]?.firstChild;
        if (!node) continue;
        const range = document.createRange();
        range.setStart(node, fragment.start); range.setEnd(node, fragment.end);
        for (const r of range.getClientRects()) if (r.width > 0) next.push({ id: sentence.id, x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height });
      }
      const nodes = layer.textDivs.map(div => div.firstChild);
      let joined = '';
      const positions = nodes.map(node => { const start = joined.length; joined += (node?.textContent ?? '') + ' '; return { start, end: joined.length - 1 }; });
      const links: (Omit<Box, 'id'> & { numbers: number[] })[] = [];
      for (const match of joined.matchAll(/\[\s*\d{1,4}(?:\s*[,;–-]\s*\d{1,4})*\s*\]/g)) {
        const numbers = citationNumbers(match[0]); if (!numbers.length) continue;
        const start = match.index, end = start + match[0].length;
        positions.forEach((position, index) => {
          const node = nodes[index]; if (!node || position.end <= start || position.start >= end) return;
          const range = document.createRange();
          range.setStart(node, Math.max(0, start-position.start)); range.setEnd(node, Math.min(position.end,end)-position.start);
          for (const r of range.getClientRects()) if (r.width > 0) links.push({ numbers, x:r.left-origin.left, y:r.top-origin.top, width:r.width, height:r.height });
        });
      }
      setCitations(links); setBoxes(next); onReady(sentences);
    };
    task().catch(error => { if (!canceled) onError(error); });
    return () => { canceled = true; render?.cancel(); layer?.cancel(); };
  }, [doc, page, width, mode, onReady, onError, onSize]);
  return <div ref={host} className="pdf-host"><div ref={stage} className="pdf-stage" style={{ width, height }} onMouseLeave={() => onActive(null)} onMouseMove={event => {
    const r = event.currentTarget.getBoundingClientRect(), x = event.clientX - r.left, y = event.clientY - r.top;
    onActive(boxes.find(b => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height)?.id ?? null);
  }}>
    {selectedCitation && <CitationPopup doc={doc} numbers={selectedCitation} close={closeCitation}/>}
    <canvas ref={canvas}/><div ref={text} className="textLayer"/>
    <div className="citation-links">{citations.map((link,i) => <button key={i} className="citation-link" aria-label={`인용 논문 ${link.numbers.join(', ')}`} title={`참고문헌 [${link.numbers.join(', ')}] 보기`} onClick={e => { e.stopPropagation(); setSelectedCitation(link.numbers); }} style={{left:link.x,top:link.y,width:link.width,height:link.height}}/>)}</div>
    <div className="highlights" aria-hidden="true">{boxes.filter(b => b.id === active).map((b, i) => <div key={i} className="highlight-box" style={{ left: b.x, top: b.y, width: b.width, height: b.height }}/>)}</div>
  </div></div>;
}
