export type CodexModel = { id: string; name: string; isDefault: boolean };
export class CodexClient {
  private port: chrome.runtime.Port | null = null;
  private serial = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; cleanup: () => void }>();
  onDisconnect: (() => void) | undefined;
  connect() {
    if (!globalThis.chrome?.runtime?.id) throw new Error('Chrome에 설치한 확장 프로그램에서 Codex를 연결해 주세요.');
    const port = chrome.runtime.connect({ name: 'paper-lantern-codex' }); this.port = port;
    port.onMessage.addListener(message => {
      if (this.port !== port) return;
      if (message.disconnected) { this.disconnect(new Error('Codex 연결 프로그램을 확인해 주세요. 설치 후 다시 연결할 수 있습니다.')); return; }
      const item = this.pending.get(message.id);
      if (!item) return;
      item.cleanup(); this.pending.delete(message.id);
      message.error ? item.reject(new Error(message.error)) : item.resolve(message.result);
    });
    port.onDisconnect.addListener(() => { void chrome.runtime.lastError; if (this.port === port) this.disconnect(new Error('Codex 연결이 종료되었습니다. 연결 프로그램 설치와 Codex 로그인을 확인해 주세요.')); });
    return this.request<{ models: CodexModel[]; protocolVersion?: number }>('status', {});
  }
  request<T>(method: string, params: object, signal?: AbortSignal): Promise<T> {
    if (!this.port) return Promise.reject(new Error('먼저 Codex를 연결해 주세요.'));
    if (signal?.aborted) return Promise.reject(new DOMException('요청 중단', 'AbortError'));
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      const cancel = () => { this.port?.postMessage({ method: 'cancel', params: { id } }); done(new DOMException('요청 중단', 'AbortError')); };
      const done = (error: Error) => { this.pending.get(id)?.cleanup(); this.pending.delete(id); reject(error); };
      const timer = window.setTimeout(() => { this.port?.postMessage({ method: 'cancel', params: { id } }); done(new Error('Codex 요청 시간이 초과되었습니다. 다시 연결해 주세요.')); }, 220000);
      this.pending.set(id, { resolve, reject, cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); } });
      signal?.addEventListener('abort', cancel, { once: true });
      try { this.port!.postMessage({ id, method, params }); } catch { done(new Error('Codex에 연결하지 못했습니다.')); }
    });
  }
  disconnect(error = new Error('Codex 연결 해제')) {
    const port = this.port; this.port = null;
    for (const p of this.pending.values()) { p.cleanup(); p.reject(error); }
    this.pending.clear(); port?.disconnect(); if (port) this.onDisconnect?.();
  }
}

export type TextPage = { page: number; text: string };
// Whole papers fit in the usual case. For long PDFs, retrieve matching passages
// across ALL pages, with introduction/current page as anchors and explicit limits.
export function questionContext(pages: TextPage[], question: string, current: number): TextPage[] {
  if (pages.reduce((n, p) => n + p.text.length, 0) <= 90000) return pages;
  const terms = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])];
  const passages = pages.flatMap(p => {
    const result = [];
    for (let offset = 0; offset < p.text.length; offset += 3000) {
      const text = p.text.slice(offset, offset + 3400), lower = text.toLowerCase();
      const score = terms.reduce((n, term) => n + (lower.includes(term) ? 1 : 0), 0) + (p.page === current ? 0.5 : 0) + (p.page === 1 ? 0.2 : 0);
      result.push({ page: p.page, text, offset, score });
    }
    return result;
  }).sort((a, b) => b.score - a.score || a.page - b.page);
  const selected = passages.slice(0, 24).sort((a, b) => a.page - b.page || a.offset - b.offset);
  return selected.map(p => ({ page: p.page, text: '[발췌 / excerpt]\n' + p.text }));
}
