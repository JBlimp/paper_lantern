import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
const server = await preview({ preview: { host: '127.0.0.1', port: 4177, strictPort: true } });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [];
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    indexedDB.open = () => { throw new Error('Isolated UI test: storage unavailable'); }; window.__requests = []; window.__delay = 50; window.__failConnect = false;
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
            if (m.method === 'status') result = { protocolVersion: 7, models: [{ id: 'test-model', name: 'Test Codex', isDefault: true }, { id: 'question-model', name: 'Question Model', isDefault: false }] };
            if (m.method === 'translateDocument') result = { sentences: m.params.pages.filter(p => p.text.trim()).map(p => ({ text: p.text, translation: 'Codex: ' + p.text, pages: [p.page] })) };
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
  await page.getByRole('button', { name: 'Codex 질문', exact: true }).click();
  await expect(page.locator('.codex-panel header')).toContainText('연결됨');
  await expect(page.locator('.ai-status')).toContainText('번역 완료');
  await expect(page.locator('.sentence p').first()).toContainText('Codex:');
  const batches = await page.evaluate(() => window.__requests.filter(r => r.method === 'translateDocument'));
  expect(batches).toHaveLength(1); expect(batches[0].params.pages.map(u => u.text).join(' ')).toContain('local reading assistant');
  expect(await page.evaluate(() => window.__requests.some(r => r.method === 'segment' || r.method === 'translate'))).toBe(false);
  await expect(page.getByRole('button', { name: '문장 다시 분석', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '번역 이어서', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await expect(page.locator('.ai-status')).toContainText('번역 완료');
  expect(await page.evaluate(() => window.__requests.filter(r => r.method === 'translateDocument').length)).toBe(2);
  await page.getByRole('button', { name: 'Codex 설정', exact: true }).click();
  await page.getByRole('button', { name: '확장 ID 복사', exact: true }).click();
  await expect(page.locator('.extension-id [role=status]')).toHaveText('복사됨');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('test');
  await page.getByLabel('번역 기본 모델').selectOption('test-model');
  await page.getByLabel('질문 기본 모델').selectOption('question-model');
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
  expect(await page.evaluate(() => window.__requests.filter(r => r.method === 'translateDocument').at(-1).params.systemPrompt)).toContain('번역 설정 테스트');
  await page.getByRole('button', { name: 'Codex 패널 닫기', exact: true }).click();
  await page.getByRole('button', { name: 'Codex 질문', exact: true }).click();
  await expect(page.getByLabel('질문 범위')).toHaveCount(0);
  const priorTranslations = await page.locator('.sentence p').allTextContents();
  await page.getByRole('button', { name: '번역 패널 닫기', exact: true }).click();
  await expect(page.locator('.translation-pane')).toBeHidden();
  await expect(page.getByRole('separator')).toBeHidden();
  await page.getByRole('button', { name: '번역', exact: true }).click();
  await expect(page.locator('.translation-pane')).toBeVisible();
  expect(await page.locator('.sentence p').allTextContents()).toEqual(priorTranslations);
  expect(await page.locator('.toolbar').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
  expect(await page.locator('.codex-panel').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.screenshot({ path: 'artifacts/white-reader.png' });
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
  await page.getByRole('button', { name: 'Codex 설정', exact: true }).click();
  await page.evaluate(() => { window.__failConnect = true; });
  await page.getByRole('button', { name: '모델 목록 다시 불러오기' }).click();
  await expect(page.locator('.connection-status')).toContainText('연결 테스트 오류');
  await expect(page.getByLabel('번역 기본 모델').locator('option')).toHaveCount(1);
  await page.getByRole('button', { name: '모델 목록 다시 불러오기' }).click();
  await expect(page.locator('.connection-status')).toContainText('연결됨 · 모델 2개');
  await expect(page.getByLabel('번역 기본 모델').locator('option')).toHaveCount(3);
  expect(errors).toEqual([]);
  console.log('PASS: white UI, PDF drag-to-ask, multi-page selection, prompt save/cancel/reset/persistence, prompt forwarding, disconnect, provider switching, citation navigation and cancellation.');
} finally { await browser.close(); await new Promise(r => server.httpServer.close(r)); }
