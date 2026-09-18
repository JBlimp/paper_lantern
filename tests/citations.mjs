import {chromium,expect} from '@playwright/test';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {preview} from 'vite';
import {mkdir} from 'node:fs/promises';
await mkdir('artifacts', {recursive:true});
const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);
const a=pdf.addPage([612,792]);a.drawText('We compare previous studies [1, 2].',{x:50,y:650,size:12,font});
const b=pdf.addPage([612,792]);for(const [i,text] of ['References','[1] A. Researcher. 2025. First Paper on Graph Search.','Conference on Search, pages 10-20.','[2] B. Author. 2026. Second Paper on Vector Search.'].entries())b.drawText(text,{x:50,y:700-i*20,size:12,font});
const server=await preview({preview:{host:'127.0.0.1',port:4186}});const browser=await chromium.launch({channel:'chrome',headless:true});
try{const p=await browser.newPage();await p.addInitScript(()=>Object.defineProperty(window,'Translator',{value:{availability:async()=>'available',create:async()=>({destroy(){},translate:async t=>t})}}));await p.goto('http://127.0.0.1:4186');await p.getByLabel('PDF 파일 선택').setInputFiles({name:'citations.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await p.getByRole('button',{name:'인용 논문 1, 2',exact:true}).first().click();await expect(p.getByRole('dialog')).toContainText('First Paper on Graph Search');await expect(p.getByRole('dialog')).toContainText('Second Paper on Vector Search');await p.keyboard.press('Escape');await expect(p.getByRole('dialog')).toHaveCount(0);
if (process.argv[2]) {
await p.getByLabel('PDF 파일 선택').setInputFiles(process.argv[2]);await p.getByRole('button',{name:'인용 논문 2, 19',exact:true}).first().click();await expect(p.getByRole('dialog')).not.toContainText('찾지 못했습니다');await expect(p.getByRole('dialog')).toContainText('참고문헌');console.log(await p.getByRole('dialog').innerText());await p.screenshot({path:'artifacts/citation-popup.png'});}
console.log('PASS citation popup tests.');}finally{await browser.close();server.httpServer.close();}
