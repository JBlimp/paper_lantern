import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { rawPage } from './readPage';
import { parseReferences, referenceRows, type Reference } from './references';
const cache = new WeakMap<PDFDocumentProxy, Promise<Map<number, Reference>>>();
function references(doc: PDFDocumentProxy) {
  if (!cache.has(doc)) {
    const task = (async () => {
      const pages = [];
      for (let page = 1; page <= doc.numPages; page++) {
        const raw = await rawPage(doc, page);
        pages.push({ page, rows: referenceRows(raw.words, raw.width, raw.height) });
      }
      return parseReferences(pages);
    })();
    cache.set(doc, task);
    void task.catch(() => cache.delete(doc));
  }
  return cache.get(doc)!;
}
export function CitationPopup({
  doc,
  numbers,
  close,
}: {
  doc: PDFDocumentProxy;
  numbers: number[];
  close(): void;
}) {
  const [entries, setEntries] = useState<Map<number, Reference> | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let canceled = false;
    references(doc)
      .then((value) => {
        if (!canceled) setEntries(value);
      })
      .catch(() => {
        if (!canceled) setError('참고문헌을 읽지 못했습니다.');
      });
    return () => {
      canceled = true;
    };
  }, [doc]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [close]);
  return createPortal(
    <div className="citation-backdrop" onClick={close}>
      <section
        className="citation-popup"
        role="dialog"
        aria-modal="true"
        aria-label="인용 논문"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
          }
        }}
      >
        <header>
          <strong>인용 논문</strong>
          <button autoFocus onClick={close} aria-label="인용 팝업 닫기">
            ×
          </button>
        </header>
        {!entries ? (
          <p>{error || '참고문헌을 찾고 있습니다…'}</p>
        ) : (
          numbers.map((number) => (
            <article key={number}>
              <b>[{number}]</b>
              <p>{entries.get(number)?.text || '이 번호에 대응하는 참고문헌을 확실하게 찾지 못했습니다.'}</p>
              {entries.has(number) && <small>이 PDF의 {entries.get(number)!.page}페이지 참고문헌</small>}
            </article>
          ))
        )}
      </section>
    </div>,
    document.body,
  );
}
