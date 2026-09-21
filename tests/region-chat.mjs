import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const real=process.argv.includes('--real');
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
const first=pdf.addPage([612,792]); first.drawText('Figure reading test',{x:50,y:700,size:18,font});
first.drawRectangle({x:100,y:350,width:55,height:50,color:rgb(1,0,0)});
first.drawRectangle({x:190,y:350,width:55,height:170,color:rgb(0,.65,0)});
first.drawRectangle({x:280,y:350,width:55,height:100,color:rgb(0,0,1)});
first.drawText('Figure 1. Comparison.',{x:85,y:320,size:12,font});
for(let i=0;i<2;i++) pdf.addPage([612,792]).drawText('Additional paper context.',{x:50,y:650,size:14,font});
await writeFile('artifacts/figure-test.pdf',await pdf.save());
const server=real?null:await preview({preview:{host:'127.0.0.1',port:4193,strictPort:true}});
const context=await chromium.launchPersistentContext('',{channel:'chrome',headless:true,viewport:{width:1600,height:1000},...(real?{ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']}: {})});
try {
 let url='http://127.0.0.1:4193';
 if(real){const cdp=await context.browser().newBrowserCDPSession();const {id}=await cdp.send('Extensions.loadUnpacked',{path:resolve('dist')});execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve('companion/install.ps1'),'-ExtensionId',id],{windowsHide:true});url=`chrome-extension://${id}/index.html`;}
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({real})=>{
 Object.defineProperty(window,'Translator',{value:{availability:async()=>'available',create:async()=>({translate:async text=>text,destroy(){}})}});
 if(real)return;
 window.__asked=[];window.chrome??={};window.chrome.runtime={id:'test',connect(){const listeners=[];return{onMessage:{addListener(f){listeners.push(f);}},onDisconnect:{addListener(){}},disconnect(){},postMessage(m){if(m.method==='cancel')return;if(m.method==='ask')window.__asked.push(m.params);const result=m.method==='status'?{protocolVersion:6,models:[{id:'test',name:'Test',isDefault:true}]}:{answer:'초록색',pages:[1]};setTimeout(()=>listeners.forEach(f=>f({id:m.id,result})),20);}};}};
 },{real});
 await page.goto(url);const tool=page.getByRole('button',{name:'이미지 설명',exact:true});await expect(tool).toBeDisabled();
 await page.getByLabel('PDF 파일 선택').setInputFiles('artifacts/figure-test.pdf');
 const stage=page.locator('[data-page="1"] .pdf-stage');await expect(stage.locator('canvas')).toBeVisible();
 await tool.click();await expect(tool).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape');await expect(tool).toHaveAttribute('aria-pressed','false');
 await tool.click();const r=await stage.boundingBox();
 // Drag from bottom-right to top-left to include all three bars and the caption.
 await page.mouse.move(r.x+r.width*.62,r.y+r.height*.62);await page.mouse.down();await page.mouse.move(r.x+r.width*.12,r.y+r.height*.3,{steps:8});
 await expect(page.locator('.region-selection-box')).toBeVisible();await page.mouse.up();
 const popup=page.getByRole('dialog',{name:'선택한 부분 질문'});await expect(popup).toBeVisible();await expect(tool).toHaveAttribute('aria-pressed','false');
 const image=popup.getByAltText('1쪽 선택한 그림');await expect(image).toBeVisible();const dataUrl=await image.getAttribute('src');expect(dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
 expect(dataUrl.length).toBeLessThan(600001);
 await expect(popup.getByLabel('질문 모델')).toBeEnabled({timeout:45000});
 await popup.getByLabel('논문 질문').fill('그림에서 가장 높은 막대의 색이 무엇인가요? 한 단어로 답해주세요.');await popup.getByRole('button',{name:'질문',exact:true}).click();
 await expect(popup.locator('.chat-message.assistant')).toHaveCount(1,{timeout:180000});
 const answer=await popup.locator('.chat-message.assistant').textContent();expect(answer).toMatch(/초록|녹색|green/i);
 await page.screenshot({path:real?'artifacts/figure-chat-real.png':'artifacts/figure-chat.png'});
 if(!real){const req=await page.evaluate(()=>window.__asked[0]);expect(req.pages).toHaveLength(3);expect(req.image.dataUrl).toBe(dataUrl);expect(req.image.page).toBe(1);
 await popup.getByLabel('논문 질문').fill('다른 막대와 비교해줘');await popup.getByRole('button',{name:'질문',exact:true}).click();await expect(popup.locator('.chat-message.assistant')).toHaveCount(2);expect(await page.evaluate(()=>window.__asked[1].image.dataUrl)).toBe(dataUrl);
 await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{const db=indexedDB.open('paper-lantern-sessions');db.onsuccess=()=>{const get=db.result.transaction('sessions').objectStore('sessions').getAll();get.onsuccess=()=>{resolve(get.result[0]?.selectionChats?.[0]?.messages.length);db.result.close();};};}))).toBe(4);
 await page.reload();await page.getByLabel('PDF 파일 선택').setInputFiles('artifacts/figure-test.pdf');await expect(popup.locator('.chat-message.assistant')).toHaveCount(2);await expect(image).toHaveAttribute('src',dataUrl);
 }
 expect(errors).toEqual([]);console.log('PASS:',real?'Real Codex vision identified the tallest bar from the selected crop.':'Region tool, reverse drag, image attachment + full paper, follow-up and restored figure chat.');
}finally{await context.close();if(server)await new Promise(r=>server.httpServer.close(r));}
