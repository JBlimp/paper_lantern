import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const context=await chromium.launchPersistentContext('',{channel:'chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
try {
 await context.grantPermissions(['clipboard-read']);
 await context.addInitScript(()=>{Object.defineProperty(window,'Translator',{configurable:true,value:{availability:async()=>'available',create:async()=>({translate:async t=>t,destroy(){}})}});});
 const cdp=await context.browser().newBrowserCDPSession();const {id}=await cdp.send('Extensions.loadUnpacked',{path:resolve('dist')});
 const page=await context.newPage();await page.goto(pathToFileURL(resolve('artifacts/codex-sample.pdf')).href);
 const reader=page.frameLocator('#paper-lantern-reader');await reader.getByRole('button',{name:'Codex 설정',exact:true}).click();
 await expect(reader.locator('.connection-status strong')).toContainText('연결됨',{timeout:45000});
 await reader.getByRole('button',{name:'확장 ID 복사',exact:true}).click();await expect(reader.locator('.extension-id [role=status]')).toHaveText('복사됨');
 const standalone=await context.newPage();await standalone.goto(`chrome-extension://${id}/index.html`);
 expect(await standalone.evaluate(()=>navigator.clipboard.readText())).toBe(id);
 console.log('PASS: real native connection inside PDF iframe and actual clipboard ID copy.');
}finally{await context.close();}
