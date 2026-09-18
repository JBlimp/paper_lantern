import { chromium, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb, PDFName, PDFOperator } from 'pdf-lib';
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('artifacts', { recursive: true });
const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.TimesRoman);
for (let n=1;n<=3;n++) {
  const p = pdf.addPage([600,800]);
  p.drawText('Journal of General Layout Research', { x:45,y:768,size:9,font });
  p.drawText(String(n), {x:550,y:25,size:10,font});
  p.drawText(`Independent study ${n}`, { x:45,y:695,size:18,font });
  p.drawText('This main paragraph explains an independent scientific method.', { x:45,y:640,size:12,font });
  p.drawText('Small footnotes are meaningful prose and should remain.', { x:45,y:100,size:8,font });
  if (n===1) {
    p.drawLine({ start:{x:80,y:420},end:{x:300,y:420},thickness:1 });
    p.drawLine({ start:{x:80,y:420},end:{x:80,y:545},thickness:1 });
    p.drawRectangle({x:100,y:420,width:50,height:80,color:rgb(.3,.4,.5)});
    p.drawText('GRAPH LABEL NOT PROSE', {x:100,y:510,size:12,font});
    p.drawText('Figure 1: A graphical comparison.', {x:60,y:380,size:10,font});
  } else if (n===2) {
    // Captionless vector diagram, with the same font and size as the prose.
    p.drawRectangle({x:80,y:420,width:220,height:120,borderWidth:1});
    p.drawLine({start:{x:80,y:480},end:{x:300,y:480},thickness:1});
    p.drawLine({start:{x:190,y:420},end:{x:190,y:540},thickness:1});
    p.drawText('DIAGRAM INPUT', {x:95,y:500,size:12,font});
    p.drawText('DIAGRAM OUTPUT', {x:95,y:450,size:12,font});
  } else {
    p.drawText('Table 1: Measurements.', {x:60,y:550,size:10,font});
    for (const y of [500,465,430]) p.drawLine({start:{x:80,y},end:{x:380,y},thickness:1});
    for (const x of [80,230,380]) p.drawLine({start:{x,y:430},end:{x,y:500},thickness:1});
    p.drawText('TABLE CELL', {x:90,y:480,size:12,font});
    p.drawText('TABLE VALUE', {x:240,y:445,size:12,font});
  }
  p.drawText('Figure 1 shows that the method preserves important context.', {x:45,y:300,size:12,font});
  p.drawText('The final body paragraph must not disappear after a figure.', {x:45,y:270,size:12,font});
}
await writeFile('artifacts/general-layout.pdf',await pdf.save());

const tagged = await PDFDocument.create(), tf = await tagged.embedFont(StandardFonts.Helvetica), tp = tagged.addPage([600,800]);
const ctx = tagged.context;
const rootRef=ctx.nextRef(), figureRef=ctx.nextRef(), bodyRef=ctx.nextRef();
tp.node.set(PDFName.of('StructParents'),ctx.obj(0));
ctx.assign(figureRef,ctx.obj({Type:'StructElem',S:'Figure',P:rootRef,Pg:tp.ref,K:0}));
ctx.assign(bodyRef,ctx.obj({Type:'StructElem',S:'P',P:rootRef,Pg:tp.ref,K:1}));
const parentTree = ctx.register(ctx.obj({Nums:[0,[figureRef,bodyRef]]}));
ctx.assign(rootRef,ctx.obj({Type:'StructTreeRoot',K:[figureRef,bodyRef],ParentTree:parentTree}));
tagged.catalog.set(PDFName.of('StructTreeRoot'),rootRef);
tagged.catalog.set(PDFName.of('MarkInfo'),ctx.obj({Marked:true}));
for (const [id,text,y] of [[0,'Tagged figure text that otherwise resembles a normal paragraph.',600],[1,'Tagged body text must be preserved in its original reading order.',400]]) {
  tp.pushOperators(PDFOperator.of('BDC',[PDFName.of(id===0?'Figure':'P'),ctx.obj({MCID:id})]));
  tp.drawText(text,{x:45,y,size:12,font:tf}); tp.pushOperators(PDFOperator.of('EMC',[]));
}
await writeFile('artifacts/tagged-layout.pdf',await tagged.save());
const server=await preview({preview:{host:'127.0.0.1',port:4175}}), browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1500,height:1000}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.__inputs=[];
    Object.defineProperty(window,'Translator',{value:{availability:async()=>'available',create:async()=>({destroy(){},translate:async text=>{window.__inputs.push(text);return text;}})}});
  });
  await page.goto('http://127.0.0.1:4175');
  await page.getByLabel('PDF 파일 선택').setInputFiles('artifacts/general-layout.pdf');
  await expect(page.locator('.ai-status')).toContainText('번역 완료 · 3 / 3 페이지');
  let inputs=await page.evaluate(()=>window.__inputs);
  expect(inputs.join('\n')).not.toMatch(/Journal of General|GRAPH LABEL|DIAGRAM INPUT|DIAGRAM OUTPUT|TABLE CELL|TABLE VALUE|Figure 1:|Table 1:/);
  expect(inputs.filter(s=>s.includes('main paragraph')).length).toBe(3);
  expect(inputs.filter(s=>s.includes('Figure 1 shows')).length).toBe(3);
  expect(inputs.filter(s=>s.includes('final body')).length).toBe(3);
  expect(inputs.filter(s=>s.includes('Small footnotes')).length).toBe(3);
  await page.screenshot({path:'artifacts/body-filter.png',fullPage:true});
  await page.evaluate(()=>window.__inputs=[]);
  await page.getByLabel('PDF 파일 선택').setInputFiles('artifacts/tagged-layout.pdf');
  await expect(page.locator('.ai-status')).toContainText('번역 완료 · 1 / 1 페이지');
  inputs=await page.evaluate(()=>window.__inputs);
  expect(inputs.join('\n')).not.toContain('Tagged figure');
  expect(inputs.join('\n')).toContain('Tagged body text');
  expect(errors).toEqual([]);
  console.log('PASS: independent PDF fixtures: recurring margins, captioned graph, captionless same-font diagram, ruled table, body figure references, small footnote, tagged Figure/P.');
} finally {await browser.close(); server.httpServer.closeAllConnections();await new Promise(r=>server.httpServer.close(r));}
