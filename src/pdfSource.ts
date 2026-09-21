/// <reference types="chrome" />
export const embedded =
  new URLSearchParams(location.search).get('embedded') === '1' && window.parent !== window;

// File bytes travel only between this extension's frame and service worker.
// The worker chooses the actual parent tab URL; the frame cannot request another file.
export function readTabPdf(signal: AbortSignal): Promise<File> {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: 'read-tab-pdf' });
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let settled = false;
    const finish = (error?: Error, file?: File) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', cancel);
      port.disconnect();
      if (error) reject(error);
      else resolve(file!);
    };
    const cancel = () => finish(new DOMException('PDF 열기 취소', 'AbortError'));
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) {
      cancel();
      return;
    }
    port.onMessage.addListener((message) => {
      if (message.error) finish(new Error(message.error));
      else if (typeof message.chunk === 'string') {
        const binary = atob(message.chunk),
          bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        chunks.push(bytes);
      } else if (message.done)
        finish(undefined, new File(chunks, message.name || 'paper.pdf', { type: 'application/pdf' }));
    });
    port.onDisconnect.addListener(() => {
      if (!settled)
        finish(
          new Error(chrome.runtime.lastError?.message || 'PDF 연결이 끊겼습니다. 탭을 새로고침해 주세요.'),
        );
    });
  });
}
