import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';

const bytes = await readFile('artifacts/sample-paper.pdf');
const server = createServer((request, response) => {
  if (request.url === '/normal') {
    response.setHeader('Content-Type', 'text/html'); response.end('<h1>Normal page</h1>'); return;
  }
  response.setHeader('Content-Type', 'application/pdf'); response.end(bytes);
}).listen(4195, '127.0.0.1');
const context = await chromium.launchPersistentContext(resolve('artifacts/pdf-tab-test-profile'), {
  channel: 'chrome', headless: true, ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--enable-unsafe-extension-debugging'],
});
try {
  const session = await context.browser().newBrowserCDPSession();
  await session.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const page = await context.newPage(), errors = [];
  page.on('console', msg => { if(msg.type() === 'error') console.log('Chrome:',msg.text()); });
  page.on('pageerror', error => errors.push(error.message));
  for (const url of ['http://127.0.0.1:4195/test.pdf', pathToFileURL(resolve('artifacts/sample-paper.pdf')).href]) {
    await page.goto(url);
    const reader = page.frameLocator('#paper-lantern-reader');
    await expect(reader.locator('.sentence').first()).toBeVisible({ timeout: 30000 });
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => document.contentType)).toBe('application/pdf');
    await expect(page.locator('#paper-lantern-reader')).toHaveCount(1);
    await expect(reader.getByRole('button', { name: '파일 선택 (독립 리더)' })).toHaveCount(0);
    // A new profile may require a user gesture to download its first language model.
    await expect.poll(async () => (await reader.locator('.ai-status').innerText()).includes('번역 완료') || await reader.getByRole('button', { name: '번역 이어서', exact: true }).isVisible(), { timeout: 60000 }).toBe(true);
    if (await reader.getByRole('button', { name: '번역 이어서', exact: true }).count()) {
      await reader.getByRole('button', { name: '번역 이어서', exact: true }).click();
    }
    await expect.poll(async () => (await reader.locator('.ai-status').innerText()).includes('번역 완료') || await reader.getByRole('button', { name: '번역 이어서', exact: true }).isVisible(), { timeout: 60000 }).toBe(true);
    console.log('Translation result:', await reader.locator('.ai-status').innerText(), await reader.locator('[role=alert]').allTextContents());
    await expect(reader.locator('.ai-status')).toContainText('번역 완료');
    await expect(reader.locator('[role=alert]')).toHaveCount(0);
    await reader.locator('.sentence').nth(2).hover();
    await expect(reader.locator('.highlight-box').first()).toBeVisible();
    await page.screenshot({ path: url.startsWith('file:') ? 'artifacts/local-pdf-tab-reader.png' : 'artifacts/pdf-tab-reader.png' });
    const toggle = page.getByRole('switch', { name: 'Paper Lantern 리더' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await reader.getByRole('button', { name: '다음 페이지', exact: true }).click();
    const translated = await reader.locator('.sentence p').allTextContents();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#paper-lantern-reader')).toBeHidden();
    expect(await page.evaluate(() => document.contentType)).toBe('application/pdf');
    expect(page.url()).toBe(url);
    await page.screenshot({ path: url.startsWith('file:') ? 'artifacts/local-native-toggle.png' : 'artifacts/native-toggle.png' });
    await toggle.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(reader.locator('.page-controls')).toContainText('2');
    expect(await reader.locator('.sentence p').allTextContents()).toEqual(translated);
    await expect(reader.locator('.ai-status')).toContainText('번역 완료');
    console.log('PASS: original PDF URL/MIME, translation, hover and reversible toggle:', new URL(url).protocol);
  }
  await page.goto('http://127.0.0.1:4195/normal');
  await expect(page.locator('#paper-lantern-reader')).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log('PASS: HTML pages untouched; no page errors. Gemini panel inference is not tested here.');
} finally {
  await context.close(); server.close();
}
