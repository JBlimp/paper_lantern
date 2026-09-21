// One native host per Chrome profile. Tabs have independent request ID spaces.
export function createCodexBridge(connectNative) {
  let native = null,
    serial = 0;
  const clients = new Set(),
    pending = new Map();
  function disconnectClients(error) {
    const snapshot = [...clients];
    clients.clear();
    pending.clear();
    for (const client of snapshot) {
      client.ids.clear();
      try {
        client.port.postMessage({ disconnected: true, error });
      } catch {}
      try {
        client.port.disconnect();
      } catch {}
    }
  }
  function open() {
    if (native) return native;
    const source = connectNative();
    native = source;
    source.onMessage.addListener((message) => {
      if (native !== source) return;
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      request.client.ids.delete(request.id);
      request.client.port.postMessage({ ...message, id: request.id });
    });
    source.onDisconnect.addListener(() => {
      // Reading lastError prevents Chrome's unchecked runtime error warning.
      const reason = globalThis.chrome?.runtime?.lastError?.message;
      const detail = reason
        ? `Codex 연결 실패: ${reason} · 설치 시 확장 ID를 확인하고 연결 프로그램을 다시 실행해 주세요.`
        : '공유 Codex 연결이 종료되었습니다. 트레이의 연결 프로그램을 확인하고 다시 연결해 주세요.';
      if (native !== source) return;
      native = null;
      disconnectClients(detail);
    });
    return source;
  }
  return {
    restart(ifIdle = false) {
      if (ifIdle && pending.size) return false;
      const previous = native;
      native = null;
      disconnectClients('Codex 연결 프로그램을 다시 시작합니다.');
      previous?.disconnect();
      return true;
    },
    attach(port) {
      const client = { port, ids: new Map() };
      clients.add(client);
      const source = open();
      const cancel = (id) => {
        const wireId = client.ids.get(id);
        if (wireId === undefined) return;
        client.ids.delete(id);
        pending.delete(wireId);
        if (native === source) source.postMessage({ method: 'cancel', params: { id: wireId } });
      };
      port.onMessage.addListener((message) => {
        if (!clients.has(client) || native !== source) return;
        if (message.method === 'cancel') {
          cancel(message.params?.id);
          return;
        }
        if (!Number.isSafeInteger(message.id) || client.ids.has(message.id)) return;
        const wireId = ++serial;
        client.ids.set(message.id, wireId);
        pending.set(wireId, { client, id: message.id });
        source.postMessage({ ...message, id: wireId });
      });
      port.onDisconnect.addListener(() => {
        clients.delete(client);
        for (const id of [...client.ids.keys()]) cancel(id);
        // Keep the shared host alive for the next PDF tab. Chrome owns its lifetime.
      });
    },
  };
}
