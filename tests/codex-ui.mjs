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
            if (m.method === 'status') result = { protocolVersion: 2, models: [{ id: 'test-model', name: 'Test Codex', isDefault: true }] };
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
  await page.getByRole('button', { name: 'Codex 설정', exact: true }).click();
  await page.getByLabel('번역 시스템 프롬프트').fill('번역 설정 테스트: 전문 용어 유지');
  await page.getByLabel('질문 시스템 프롬프트').fill('질문 설정 테스트: 핵심부터 설명');
  await page.screenshot({ path: 'artifacts/white-settings.png' });
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('button', { name: 'Codex 설정', exact: true }).click();
  await page.getByLabel('질문 시스템 프롬프트').fill('취소할 설정');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await page.getByLabel('번역 엔진').selectOption('chrome');
  await page.getByLabel('번역 엔진').selectOption('codex');
  await expect(page.locator('.ai-status')).toContainText('번역 완료');
  expect(await page.evaluate(() => window.__requests.filter(r => r.method === 'translate').at(-1).params.systemPrompt)).toContain('번역 설정 테스트');
  await page.getByRole('button', { name: 'Codex 패널 닫기', exact: true }).click();
  const title = page.locator('.pdf-page-slot[data-page="1"] .textLayer span').filter({ hasText: 'A Local Reader for Research Papers' }).first();
  await expect(title).toBeVisible();
  await page.waitForTimeout(200);
  const bounds = await title.boundingBox();
  await page.mouse.move(bounds.x + 1, bounds.y + bounds.height / 2);
  await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width - 1, bounds.y + bounds.height / 2, { steps: 10 }); await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Codex에게 질문', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Codex에게 질문', exact: true }).click();
  await expect(page.getByLabel('질문 범위')).toHaveValue('selection');
  await expect(page.locator('.selection-preview')).toContainText('Local Reader');
  await expect(page.getByLabel('논문 질문')).toBeFocused();
  await page.getByLabel('논문 질문').fill('선택한 내용을 설명해줘');
  await page.getByRole('button', { name: '질문', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(1);
  const selectionRequest = await page.evaluate(() => window.__requests.filter(r => r.method === 'ask').at(-1).params);
  expect(selectionRequest.pages).toHaveLength(1); expect(selectionRequest.pages[0].page).toBe(1);
  expect(selectionRequest.pages[0].text).toContain('Local Reader');
  expect(selectionRequest.systemPrompt).toContain('질문 설정 테스트');
  expect(await page.locator('.toolbar').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
  expect(await page.locator('.codex-panel').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.screenshot({ path: 'artifacts/white-reader.png' });
  await page.getByRole('button', { name: '대화 지우기', exact: true }).click();
  await expect(page.locator('[data-page="2"] .textLayer span').first()).toBeAttached();
  await page.evaluate(() => {
    const start = document.querySelector('[data-page="1"] .textLayer span').firstChild;
    const end = document.querySelector('[data-page="2"] .textLayer span').firstChild;
    const range = document.createRange(); range.setStart(start, 0); range.setEnd(end, end.textContent.length);
    const selected = getSelection(); selected.removeAllRanges(); selected.addRange(range);
    start.parentElement.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await page.getByRole('button', { name: 'Codex에게 질문', exact: true }).click();
  await page.getByLabel('논문 질문').fill('두 페이지에 걸친 선택');
  await page.getByRole('button', { name: '질문', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(1);
  expect(await page.evaluate(() => window.__requests.filter(r => r.method === 'ask').at(-1).params.pages.map(p => p.page))).toEqual([1, 2]);
  await page.getByRole('button', { name: '대화 지우기', exact: true }).click();
  await page.getByLabel('질문 범위').selectOption('paper');
  await page.getByLabel('논문 질문').fill('실험은?');
  await page.getByRole('button', { name: '질문', exact: true }).click();
  await expect(page.locator('.chat-message.assistant strong')).toHaveText('답변');
  expect(await page.evaluate(() => window.__requests.filter(r => r.method === 'ask').at(-1).params.pages.length)).toBe(3);
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
  await page.getByRole('button', { name: '연결 해제', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Codex 연결', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Codex 설정', exact: true }).click();
  await expect(page.getByLabel('질문 시스템 프롬프트')).toHaveValue('질문 설정 테스트: 핵심부터 설명');
  await page.getByRole('button', { name: '기본값 복원', exact: true }).click();
  await expect(page.getByLabel('질문 시스템 프롬프트')).toContainText('연구 조교');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  expect(errors).toEqual([]);
  console.log('PASS: white UI, PDF drag-to-ask, multi-page selection, prompt save/cancel/reset/persistence, prompt forwarding, disconnect, provider switching, citation navigation and cancellation.');
} finally { await browser.close(); await new Promise(r => server.httpServer.close(r)); }
