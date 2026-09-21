export type CodexModel = { id: string; name: string; isDefault: boolean };
export class CodexClient {
  private port: chrome.runtime.Port | null = null;
  private serial = 0;
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void; cleanup: () => void }
  >();
  private healthTimer: ReturnType<typeof setTimeout> | undefined;
  private checkingHealth = false;
  onDisconnect: ((error: Error) => void) | undefined;
  private checkHealth = async () => {
    const port = this.port;
    if (!port || this.checkingHealth) return;
    clearTimeout(this.healthTimer);
    this.checkingHealth = true;
    try {
      await this.request('status', {}, undefined, 10000);
    } catch (error) {
      if (this.port === port)
        this.disconnect(error instanceof Error ? error : new Error('Codex 연결 확인에 실패했습니다.'));
    } finally {
      this.checkingHealth = false;
      if (this.port === port) this.healthTimer = setTimeout(this.checkHealth, 5000);
    }
  };
  private checkWhenVisible = () => {
    if (document.visibilityState === 'visible') void this.checkHealth();
  };
  async connect() {
    this.disconnect();
    if (!globalThis.chrome?.runtime?.id)
      throw new Error('Chrome에 설치한 확장 프로그램에서 Codex를 연결해 주세요.');
    const port = chrome.runtime.connect({ name: 'paper-lantern-codex' });
    this.port = port;
    port.onMessage.addListener((message) => {
      if (this.port !== port) return;
      if (message.disconnected) {
        this.disconnect(
          new Error(message.error || 'Codex 연결 프로그램을 확인해 주세요. 설치 후 다시 연결할 수 있습니다.'),
        );
        return;
      }
      const item = this.pending.get(message.id);
      if (!item) return;
      item.cleanup();
      this.pending.delete(message.id);
      message.error ? item.reject(new Error(message.error)) : item.resolve(message.result);
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      if (this.port === port)
        this.disconnect(
          new Error('Codex 연결이 종료되었습니다. 연결 프로그램 설치와 Codex 로그인을 확인해 주세요.'),
        );
    });
    try {
      const result = await this.request<{ models: CodexModel[]; protocolVersion?: number }>('status', {});
      if (this.port !== port) throw new Error('Codex 연결이 변경되었습니다. 다시 연결해 주세요.');
      this.healthTimer = setTimeout(this.checkHealth, 5000);
      document.addEventListener('visibilitychange', this.checkWhenVisible);
      return result;
    } catch (error) {
      if (this.port === port) this.disconnect(error instanceof Error ? error : new Error('Codex 연결 실패'));
      throw error;
    }
  }
  request<T>(method: string, params: object, signal?: AbortSignal, timeoutMs?: number): Promise<T> {
    if (!this.port) return Promise.reject(new Error('먼저 Codex를 연결해 주세요.'));
    if (signal?.aborted) return Promise.reject(new DOMException('요청 중단', 'AbortError'));
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      const sendCancel = () => {
        try {
          this.port?.postMessage({ method: 'cancel', params: { id } });
        } catch {
          /* Port may already be closed. */
        }
      };
      const cancel = () => {
        sendCancel();
        done(new DOMException('요청 중단', 'AbortError'));
      };
      const done = (error: Error) => {
        this.pending.get(id)?.cleanup();
        this.pending.delete(id);
        reject(error);
      };
      const timer = window.setTimeout(
        () => {
          sendCancel();
          done(new Error('Codex 요청 시간이 초과되었습니다. 다시 연결해 주세요.'));
        },
        timeoutMs ?? (method === 'status' ? 45000 : method === 'translateDocument' ? 960000 : 220000),
      );
      this.pending.set(id, {
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', cancel);
        },
      });
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        this.port!.postMessage({ id, method, params });
      } catch {
        done(new Error('Codex에 연결하지 못했습니다.'));
      }
    });
  }
  disconnect(error = new Error('Codex 연결 해제')) {
    clearTimeout(this.healthTimer);
    document.removeEventListener('visibilitychange', this.checkWhenVisible);
    const port = this.port;
    this.port = null;
    for (const p of this.pending.values()) {
      p.cleanup();
      p.reject(error);
    }
    this.pending.clear();
    try {
      port?.disconnect();
    } finally {
      if (port) this.onDisconnect?.(error);
    }
  }
}

export type TextPage = { page: number; text: string };
