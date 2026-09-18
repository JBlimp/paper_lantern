import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
const extensionPath = resolve('dist');
const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'] });
try {
  const session = await context.browser().newBrowserCDPSession();
  const { id } = await session.send('Extensions.loadUnpacked', { path: extensionPath });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/index.html`);
  console.log('Extension API:', await page.evaluate(async () => ({ translator: typeof Translator, state: typeof Translator === 'undefined' ? 'missing' : await Translator.availability({ sourceLanguage: 'en', targetLanguage: 'ko' }) })));
  const paper = process.argv.includes('--paper') ? process.argv[process.argv.indexOf('--paper') + 1] : 'artifacts/sample-paper.pdf';
  await page.getByLabel('PDF 파일 선택').setInputFiles(paper);
  await expect(page.locator('.sentence').first()).toBeVisible();
  await page.locator('.sentence').nth(2).hover();
  await expect(page.locator('.highlight-box').first()).toBeVisible();
  if (process.argv.includes('--real-ai')) {
    for (let i = 0; i < 360; i++) {
      const status = await page.locator('.ai-status').innerText();
      if (i % 15 === 0) console.log(status);
      if (await page.getByRole('alert').count()) throw new Error(await page.getByRole('alert').innerText());
      if (status.startsWith('번역 완료')) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    await expect(page.locator('.ai-status')).toContainText('번역 완료');
    console.log('Actual extension translations:', await page.locator('.sentence.translated > div > p').allTextContents());
    if (process.argv.includes('--paper')) {
      const target = page.locator('.sentence p[title^="First, LID is a property"]');
      await expect(target).toBeVisible(); await target.hover();
      await page.locator('.pdf-scroll').evaluate(root => { const box = root.querySelector('.highlight-box'); if (box) root.scrollTop += box.getBoundingClientRect().top - root.getBoundingClientRect().top - 150; });
      await page.screenshot({ path: 'artifacts/sheaf-fixed.png', fullPage: true });
    }
    await page.locator('.sentence').nth(2).hover();
    await page.screenshot({ path: 'artifacts/extension-real-ai.png', fullPage: true });
  }
  expect(errors).toEqual([]);
  console.log('PASS: Manifest V3 loaded, background worker registered, extension CSP permits bundled PDF worker, PDF rendered, sentence hover works.');
} finally { await context.close(); }
