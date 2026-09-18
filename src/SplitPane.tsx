import { useRef, useState, type ReactNode } from 'react';

export function SplitPane({ children }: { children: [ReactNode, ReactNode] }) {
  const host = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(() => {
    try { const saved = Number(localStorage.getItem('reader-split')); return saved >= 20 && saved <= 80 ? saved : 50; }
    catch { return 50; }
  });
  const [dragging, setDragging] = useState(false);
  function update(next: number) {
    const value = Math.max(20, Math.min(80, next));
    setRatio(value);
    try { localStorage.setItem('reader-split', String(value)); } catch { /* Reading still works without settings storage. */ }
  }
  return <div ref={host} className={`panes ${dragging ? 'resizing' : ''}`} style={{ gridTemplateColumns: `minmax(0, ${ratio}fr) 7px minmax(0, ${100 - ratio}fr)` }}>
    {children[0]}
    <div className="splitter" role="separator" aria-label="원문과 번역 너비 조절" aria-orientation="vertical" aria-valuemin={20} aria-valuemax={80} aria-valuenow={Math.round(ratio)} tabIndex={0}
      title="드래그하여 너비 조절 · 더블클릭하면 반반"
      onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); }}
      onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; const rect = host.current!.getBoundingClientRect(); update((e.clientX - rect.left) / rect.width * 100); }}
      onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); setDragging(false); }}
      onLostPointerCapture={() => setDragging(false)} onPointerCancel={() => setDragging(false)}
      onDoubleClick={() => update(50)}
      onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) { e.preventDefault(); update(e.key === 'Home' ? 50 : ratio + (e.key === 'ArrowLeft' ? -2 : 2)); } }}/>
    {children[1]}
  </div>;
}
