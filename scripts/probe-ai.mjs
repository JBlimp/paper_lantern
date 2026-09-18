import { chromium } from '@playwright/test';
import { preview } from 'vite';
const server = await preview({ preview: { host: '127.0.0.1', port: 4174 } });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log(m.text()); });
  await page.goto('http://127.0.0.1:4174');
  await page.getByLabel('PDF 파일 선택').setInputFiles('artifacts/sample-paper.pdf');
  for (let i = 0; i < 120; i++) {
    const status = await page.locator('.ai-status').innerText();
    if (i % 5 === 0) console.log(status);
    if (await page.locator('[role=alert]').count()) throw new Error(await page.locator('[role=alert]').innerText());
    if (status.startsWith('번역 완료')) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  await page.waitForFunction(() => document.querySelector('.ai-status')?.textContent?.startsWith('번역 완료'), null, { timeout: 120000 });
  const results = await page.locator('.sentence.translated > div > p').allTextContents();
  await page.screenshot({ path: 'artifacts/real-ai.png', fullPage: true });
  console.log('REAL TRANSLATION RESULTS:', results);
} finally { await browser.close(); server.httpServer.closeAllConnections(); await new Promise(r => server.httpServer.close(r)); }
