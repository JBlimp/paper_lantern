// Read-only real connection check: lists models without running inference.
import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'] });
try {
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const page = await context.newPage(); await page.goto(`chrome-extension://${id}/index.html`);
  await page.getByRole('button', { name: 'Codex 설정', exact: true }).click();
  if (process.argv.includes('--offline')) {
    await expect(page.locator('.connection-status')).toContainText('PC 프로그램이 실행 중이 아닙니다', { timeout: 15000 });
    await expect(page.locator('.connection-status strong')).toContainText('연결 안 됨');
    console.log('PASS: real Chrome reports PC app is off without starting a service.');
  } else {
  await expect(page.locator('.connection-status')).toContainText('연결됨', { timeout: 45000 });
  await expect(page.locator('.connection-status')).toContainText('v0.6.0');
  const names = await page.getByLabel('번역 기본 모델').locator('option').allTextContents();
  expect(names.length).toBeGreaterThan(1);
  await page.getByRole('button', { name: '모델 목록 다시 불러오기' }).click();
  await expect(page.locator('.connection-status')).toContainText('연결됨', { timeout: 45000 });
  console.log('PASS real native connection, model list and reconnect:', names.join(', '));
  }
} finally { await context.close(); }
