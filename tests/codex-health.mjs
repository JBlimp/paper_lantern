// Read-only real connection check: lists models without running inference.
import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'] });
try {
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const page = await context.newPage(); await page.goto(`chrome-extension://${id}/index.html`);
  await page.getByRole('button', { name: 'Codex 설정', exact: true }).click();
  if (process.argv.includes('--paused')) {
    await expect(page.locator('.connection-status')).toContainText('트레이에서 종료되었습니다', { timeout: 15000 });
    await expect(page.locator('.connection-status strong')).toContainText('연결 안 됨');
    const replies = await page.evaluate(async () => {
      const port = chrome.runtime.connect({ name: 'paper-lantern-codex' });
      return new Promise(resolve => {
        const results = [];
        port.onMessage.addListener(m => { if (m.id) results.push(m); if (results.length === 2) { port.disconnect(); resolve(results); } });
        port.postMessage({ id: 1, method: 'status', params: {} });
        port.postMessage({ id: 2, method: 'health', params: {} });
      });
    });
    expect(replies.every(r => r.error && !r.result)).toBe(true);
    console.log('PASS: real Chrome native host rejects status and health while tray pause is set.');
  } else {
  await expect(page.locator('.connection-status')).toContainText('연결됨', { timeout: 45000 });
  const names = await page.getByLabel('번역 기본 모델').locator('option').allTextContents();
  expect(names.length).toBeGreaterThan(1);
  await page.getByRole('button', { name: '모델 목록 다시 불러오기' }).click();
  await expect(page.locator('.connection-status')).toContainText('연결됨', { timeout: 45000 });
  console.log('PASS real native connection, model list and reconnect:', names.join(', '));
  }
} finally { await context.close(); }
