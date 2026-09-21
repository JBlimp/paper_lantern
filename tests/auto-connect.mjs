import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
const server=await preview({preview:{host:'127.0.0.1',port:4197,strictPort:true}}),browser=await chromium.launch({channel:'chrome',headless:true});
try { const page=await browser.newPage();await page.clock.install();
 await page.addInitScript(()=>{window.__allow=false;window.__connections=0;window.chrome??={};window.chrome.runtime={id:'test',connect(){window.__connections++;const messages=[],disconnects=[];let closed=false;return{onMessage:{addListener(f){messages.push(f);}},onDisconnect:{addListener(f){disconnects.push(f);}},disconnect(){if(!closed){closed=true;disconnects.forEach(f=>f());}},postMessage(m){if(window.__silent)return;setTimeout(()=>{if(!closed)messages.forEach(f=>f(window.__allow?{id:m.id,result:{protocolVersion:7,models:[{id:'test',name:'Test',isDefault:true}]}}:{id:m.id,error:'Not registered yet'}));},10);}};}};});
 await page.goto('http://127.0.0.1:4197');await page.clock.runFor(100);
 await page.getByRole('button',{name:'Codex 설정',exact:true}).click();await expect(page.locator('.connection-status strong')).toContainText('연결 안 됨');
 await page.evaluate(()=>window.__allow=true);await page.clock.runFor(15100);await expect(page.locator('.connection-status strong')).toContainText('연결됨');
 // Simulate a stopped backend without Chrome emitting onDisconnect.
 await page.evaluate(()=>window.__allow=false);await page.clock.runFor(5200);
 await expect(page.locator('.connection-status strong')).toContainText('연결 안 됨');
 await page.evaluate(()=>window.__allow=true);await page.clock.runFor(15100);
 await expect(page.locator('.connection-status strong')).toContainText('연결됨');
 // A hung pipe must not retain the previous successful status forever.
 await page.evaluate(()=>window.__silent=true);await page.clock.runFor(15200);
 await expect(page.locator('.connection-status strong')).toContainText('연결 안 됨');
 await page.evaluate(()=>window.__silent=false);
 await page.getByRole('button',{name:'모델 목록 다시 불러오기'}).click();await page.clock.runFor(100);
 await expect(page.locator('.connection-status strong')).toContainText('연결됨');
 await page.getByRole('button',{name:'설정 닫기',exact:true}).click();await page.getByRole('button',{name:'Codex 질문',exact:true}).click();await page.getByRole('button',{name:'연결 해제',exact:true}).click();
 const count=await page.evaluate(()=>window.__connections);await page.clock.runFor(30100);expect(await page.evaluate(()=>window.__connections)).toBe(count);
 console.log('PASS: automatic retry, stale connection detection, health timeout, reconnect, explicit disconnect.');
} finally {await browser.close();await new Promise(r=>server.httpServer.close(r));}
