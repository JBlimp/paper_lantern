import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
const server = await preview({ preview: { host: '127.0.0.1', port: 4177, strictPort: true } });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__requests = []; window.__delay = 50; window.__failConnect = true;
    Object.defineProperty(window, 'Translator', { configurable: true, value: { availability: async () => 'available', create: async () => ({ translate: async text => 'Chrome: ' + text, destroy() {} }) } });
    window.chrome ??= {};
    window.chrome.runtime = { id: 'test', connect() {
      const listeners = [], disconnected = []; let closed = false;
      return { onMessage: { addListener(f) { listeners.push(f); } }, onDisconnect: { addListener(f) { disconnected.push(f); } },
        disconnect() { if (!closed) { closed = true; disconnected.forEach(f => f()); } },
        postMessage(m) {
          window.__requests.push(m);
          if (m.method === 'cancel') return;
          // Deliberately emit even cancelled results: client must discard them.
          setTimeout(() => {
            if (closed) return;
            let result;
            if (m.method === 'status' && window.__failConnect) { window.__failConnect = false; listeners.forEach(f => f({ id: m.id, error: '연결 테스트 오류' })); return; }
            if (m.method === 'status') result = { models: [{ id: 'test-model', name: 'Test Codex', isDefault: true }] };
            if (m.method === 'translate') result = Object.fromEntries(m.params.sentences.map(s => [s.id, 'Codex: ' + s.text]));
            if (m.method === 'ask') result = { answer: '**답변**입니다.', pages: [Math.min(2, m.params.pages.length)] };
            listeners.forEach(f => f({ id: m.id, result }));
          }, window.__delay);
        }
      };
    } };
  });
  await page.goto('http://127.0.0.1:4177');
  await page.getByLabel('PDF 파일 선택').setInputFiles('artifacts/sample-paper.pdf');
  await expect(page.locator('.ai-status')).toContainText('번역 완료');
  await page.getByLabel('번역 엔진').selectOption('codex');
  await page.getByRole('button', { name: 'Codex 연결', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('연결 테스트 오류');
  await page.getByRole('button', { name: 'Codex 연결', exact: true }).click();
  await expect(page.locator('.ai-status')).toContainText('번역 완료');
  await expect(page.locator('.sentence p').first()).toContainText('Codex:');
  const batches = await page.evaluate(() => window.__requests.filter(r => r.method === 'translate'));
  expect(batches).toHaveLength(2); expect(batches[0].params.context).toContain('local reading assistant');
  await page.getByLabel('질문 범위').selectOption('paper');
  await page.getByLabel('논문 질문').fill('실험은?');
  await page.getByRole('button', { name: '질문', exact: true }).click();
  await expect(page.locator('.chat-message.assistant strong')).toHaveText('답변');
  expect(await page.evaluate(() => window.__requests.find(r => r.method === 'ask').params.pages.length)).toBe(3);
  await page.getByRole('button', { name: '2쪽', exact: true }).click();
  await expect(page.locator('.page-controls')).toContainText('2 / 3');
  await page.evaluate(() => { window.__delay = 400; });
  await page.getByLabel('논문 질문').fill('이전 문서 질문');
  await page.getByRole('button', { name: '질문', exact: true }).click();
  await page.getByLabel('PDF 파일 선택').setInputFiles('artifacts/replacement.pdf');
  await expect(page.locator('.ai-status')).toContainText('번역 완료');
  await expect(page.locator('.chat-message')).toHaveCount(0);
  await page.getByLabel('PDF 파일 선택').setInputFiles('artifacts/sample-paper.pdf');
  await page.getByRole('button', { name: '번역 중단', exact: true }).click();
  await page.getByLabel('번역 엔진').selectOption('chrome');
  await expect(page.locator('.ai-status')).toContainText('번역 완료');
  await page.waitForTimeout(500);
  await expect(page.locator('.sentence p').first()).toContainText('Chrome:');
  expect(errors).toEqual([]);
  console.log('PASS: connection failure/retry, auto batch translation, provider switching, whole-paper questions, citation navigation, stale request cancellation, safe inline formatting.');
} finally { await browser.close(); await new Promise(r => server.httpServer.close(r)); }
