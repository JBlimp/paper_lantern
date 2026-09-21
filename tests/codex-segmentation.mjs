import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
const server = await preview({ preview: { host: '127.0.0.1', port: 4189, strictPort: true } });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__segment = 0; window.__translated = [];
    window.chrome ??= {};
    window.chrome.runtime = { id: 'test', connect() {
      const listeners = [], disconnected = []; let closed = false;
      return { onMessage: { addListener(f) { listeners.push(f); } }, onDisconnect: { addListener(f) { disconnected.push(f); } }, disconnect() { if (!closed) { closed = true; disconnected.forEach(f => f()); } }, postMessage(m) {
        if (m.method === 'cancel') return;
        let result = {state:'ready'};
        if (m.method === 'status') result = { protocolVersion: 8, models: [{ id: 'test', name: 'Test', isDefault: true }] };
        if (m.method === 'translateDocument') {
          window.__segment++;
          result = { sentences: [
            { text: 'Cross-page experiments', translation: '페이지 경계 실험', pages: [1] },
            { text: 'This method uses approximate neighbor search to find similar vectors.', translation: '번역: This method uses approximate neighbor search to find similar vectors.', pages: [1, 2] },
            { text: 'The algorithm stores a graph index.', translation: '그래프 인덱스', pages: [2] }
          ] };
          window.__translated.push(...result.sentences.map(s => s.text));
        }
        if (m.method === 'translate') { window.__translated.push(...m.params.sentences.map(s => s.text)); result = Object.fromEntries(m.params.sentences.map(s => [s.id, '번역: ' + s.text])); }
        setTimeout(() => { if (!closed) listeners.forEach(f => f({ id: m.id, result })); }, 15);
      } };
    } };
  });
  await page.goto('http://127.0.0.1:4189');
  await page.getByLabel('번역 엔진').selectOption('codex');
  await page.getByLabel('PDF 파일 선택').setInputFiles('artifacts/continuation.pdf');
  await expect(page.locator('.ai-status')).toContainText('번역 완료');
  const sentence = 'This method uses approximate neighbor search to find similar vectors.';
  expect(await page.evaluate(() => window.__translated)).toContain(sentence);
  expect((await page.evaluate(() => window.__translated)).filter(s => s === sentence)).toHaveLength(1);
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(page.locator('.sentence').first()).toContainText(sentence);
  await page.locator('.sentence').first().hover();
  await expect(page.locator('[data-page="1"] .highlight-box').first()).toBeAttached();
  await expect(page.locator('[data-page="2"] .highlight-box').first()).toBeAttached();
  await expect.poll(() => page.evaluate(() => new Promise(resolve => {
    const open = indexedDB.open('paper-lantern-sessions'); open.onsuccess = () => { const get = open.result.transaction('sessions').objectStore('sessions').getAll(); get.onsuccess = () => { resolve(get.result[0]?.codexSentences?.length); open.result.close(); }; };
  }))).toBe(2);
  await page.reload();
  await page.getByLabel('PDF 파일 선택').setInputFiles('artifacts/continuation.pdf');
  await expect(page.locator('.ai-status')).toContainText('번역 완료');
  expect(await page.evaluate(() => window.__segment)).toBe(0);
  expect(await page.evaluate(() => window.__translated)).toEqual([]);
  await expect(page.locator('.sentence').first()).toContainText(sentence);
  expect(errors).toEqual([]);
  console.log('PASS: Codex source reconstruction, cross-page translation once, exact highlights and cached alignment restoration.');
} finally { await browser.close(); await new Promise(r => server.httpServer.close(r)); }
