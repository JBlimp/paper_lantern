export async function addToLibrary(file: File, progress: (percent: number) => void) {
  const port = chrome.runtime.connect({ name: 'paper-lantern-codex' });
  let serial = 0;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: number }>();
  let disconnected: Error | undefined;
  const failPending = (error: Error) => {
    disconnected = error;
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  };
  port.onMessage.addListener((message) => {
    if (message.disconnected) {
      failPending(new Error(message.error || '연결이 종료되었습니다.'));
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    message.error ? request.reject(new Error(message.error)) : request.resolve(message.result);
  });
  port.onDisconnect.addListener(() => {
    failPending(new Error(chrome.runtime.lastError?.message || '연결 프로그램을 확인해 주세요.'));
  });
  const request = (method: string, params: object): Promise<any> =>
    new Promise((resolve, reject) => {
      if (disconnected) {
        reject(disconnected);
        return;
      }
      const id = ++serial;
      const timer = window.setTimeout(() => {
        pending.delete(id);
        reject(new Error('라이브러리 요청 시간이 초과되었습니다.'));
      }, 180000);
      pending.set(id, { resolve, reject, timer });
      try {
        port.postMessage({ id, method, params });
      } catch {
        failPending(new Error('라이브러리 연결이 종료되었습니다.'));
      }
    });
  let upload: string | undefined;
  try {
    upload = (await request('libraryBegin', { name: file.name, size: file.size })).id;
    for (let offset = 0; offset < file.size; offset += 256 * 1024) {
      const bytes = new Uint8Array(await file.slice(offset, offset + 256 * 1024).arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      await request('libraryChunk', { id: upload, offset, data: btoa(binary) });
      progress(Math.round((Math.min(offset + bytes.length, file.size) / file.size) * 100));
    }
    return await request('libraryFinish', { id: upload });
  } catch (error) {
    if (upload)
      try {
        await request('libraryCancel', { id: upload });
      } catch {}
    throw error;
  } finally {
    port.disconnect();
  }
}
