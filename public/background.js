chrome.action.onClicked.addListener(async tab => {
  if (tab.id && /^(https?|file):/.test(tab.url || '')) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.contentType === 'application/pdf' });
      if (result) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['pdf-host.js'] });
        return;
      }
    } catch { /* Restricted pages use the extension's opening instructions. */ }
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'paper-lantern-codex') {
    const url = port.sender?.url;
    if (port.sender?.id !== chrome.runtime.id || !url || new URL(url).pathname !== '/index.html' || !url.startsWith(chrome.runtime.getURL(''))) { port.disconnect(); return; }
    const native = chrome.runtime.connectNative('com.paperlantern.codex');
    let closed = false;
    native.onMessage.addListener(message => { if (!closed) port.postMessage(message); });
    native.onDisconnect.addListener(() => {
      const reason = chrome.runtime.lastError?.message;
      if (!closed) { port.postMessage({ disconnected: true, error: reason || 'Codex 연결이 종료되었습니다.' }); port.disconnect(); }
      closed = true;
    });
    port.onMessage.addListener(message => { if (!closed) native.postMessage(message); });
    port.onDisconnect.addListener(() => { closed = true; native.disconnect(); });
    return;
  }
  if (port.name !== 'read-tab-pdf') return;
  const sender = port.sender;
  const controller = new AbortController();
  let connected = true;
  port.onDisconnect.addListener(() => { connected = false; controller.abort(); });
  const timer = setTimeout(() => controller.abort(), 120000);
  const send = message => { if (connected) port.postMessage(message); };
  (async () => {
    if (!sender?.tab?.id || !sender.frameId || sender.id !== chrome.runtime.id ||
        !sender.url?.startsWith(chrome.runtime.getURL('index.html?')) ||
        !/^(https?|file):/.test(sender.tab.url || '')) throw new Error('원본 PDF 탭에서 실행해 주세요.');
    const url = sender.tab.url;
    const response = await fetch(url, { signal: controller.signal, credentials: 'include' });
    if (!response.ok) throw new Error(`원본 PDF를 읽지 못했습니다 (${response.status}).`);
    const limit = 100 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > limit) throw new Error('100MB 이하의 PDF를 열어 주세요.');
    const reader = response.body.getReader();
    let total = 0, signature = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) throw new Error('100MB 이하의 PDF를 열어 주세요.');
      if (signature.length < 1024) signature += String.fromCharCode(...value.subarray(0, 1024 - signature.length));
      // Small messages avoid Chrome's per-message size limit and large argument lists.
      for (let offset = 0; offset < value.length; offset += 32768) send({ chunk: btoa(String.fromCharCode(...value.subarray(offset, offset + 32768))) });
    }
    if (!signature.includes('%PDF-')) throw new Error('현재 주소에서 PDF 대신 다른 응답을 받았습니다. 로그인이나 파일 주소를 확인해 주세요.');
    let name = 'paper.pdf';
    try { name = decodeURIComponent(new URL(url).pathname.split('/').pop()) || name; } catch {}
    send({ done: true, name });
  })().catch(error => {
    send({ error: error.name === 'AbortError' ? 'PDF 읽기 시간이 초과되었습니다. 탭을 새로고침해 주세요.' : `${error.message} 로컬 PDF라면 확장 설정에서 파일 URL 액세스를 허용해 주세요.` });
  }).finally(() => { clearTimeout(timer); controller.abort(); });
});
