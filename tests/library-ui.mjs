import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { readFile } from 'node:fs/promises';
const server=await preview({preview:{host:'127.0.0.1',port:4195,strictPort:true}}),browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
 window.__library=[];window.chrome??={};window.chrome.runtime={id:'test',connect(){const listeners=[];return {onMessage:{addListener(f){listeners.push(f);}},onDisconnect:{addListener(){}},disconnect(){},postMessage(m){
 let result={state:'ready'};if(m.method==='status')result={protocolVersion:8,models:[{id:'test',name:'Test',isDefault:true}]};
 if(m.method.startsWith('library')){window.__library.push(m);result=m.method==='libraryBegin'?{id:'upload'}:{id:'paper'};}
 setTimeout(()=>listeners.forEach(f=>f({id:m.id,result})),10);
 }};}};
 Object.defineProperty(window,'Translator',{value:{availability:async()=>'available',create:async()=>({translate:async text=>text,destroy(){}})}});
 });
 await page.goto('http://127.0.0.1:4195');await expect(page.getByRole('button',{name:'라이브러리에 추가',exact:true})).toBeDisabled();
 await page.getByLabel('PDF 파일 선택').setInputFiles('artifacts/sample-paper.pdf');await expect(page.locator('.ai-status')).toContainText('번역 완료');
 expect(await page.evaluate(()=>window.__library.length)).toBe(0);
 await page.getByRole('button',{name:'라이브러리에 추가',exact:true}).click();await expect(page.getByRole('button',{name:'라이브러리에 추가됨',exact:true})).toBeDisabled();
 const requests=await page.evaluate(()=>window.__library);expect(requests[0].method).toBe('libraryBegin');expect(requests.at(-1).method).toBe('libraryFinish');
 const data=Buffer.concat(requests.filter(r=>r.method==='libraryChunk').map(r=>Buffer.from(r.params.data,'base64')));expect(data.equals(await readFile('artifacts/sample-paper.pdf'))).toBe(true);
 await page.reload();await page.getByLabel('PDF 파일 선택').setInputFiles('artifacts/sample-paper.pdf');await expect(page.locator('.ai-status')).toContainText('번역 완료');expect(await page.evaluate(()=>window.__library.length)).toBe(0);
 expect(errors).toEqual([]);console.log('PASS: opening/reopening does not import, explicit button transmits exact PDF bytes and updates UI.');
}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}
