import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLibrary } from '../companion/library.mjs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
test('explicit library transfer copies exact bytes once and rejects invalid input',async()=>{
 const root=await mkdtemp(resolve('artifacts/library-transfer-')),library=createLibrary(root),bytes=await readFile('artifacts/sample-paper.pdf');
 try {
  await assert.rejects(library.handle('libraryBegin',{name:'../escape.pdf',size:10}));
  const transfer=async()=>{const {id}=await library.handle('libraryBegin',{name:'논문 sample.pdf',size:bytes.length});
   await assert.rejects(library.handle('libraryChunk',{id,offset:1,data:bytes.toString('base64')}));
   await assert.rejects(library.handle('libraryFinish',{id}));
   for(let offset=0;offset<bytes.length;offset+=2048)await library.handle('libraryChunk',{id,offset,data:bytes.subarray(offset,offset+2048).toString('base64')});
   return library.handle('libraryFinish',{id});};
  const first=await transfer(),second=await transfer();assert.equal(first.id,second.id);assert.equal(first.id,createHash('sha256').update(bytes).digest('hex'));
  const index=JSON.parse((await readFile(join(root,'index.json'),'utf8')).replace(/^\uFEFF/,''));assert.equal(index.papers.length,1);
  assert.deepEqual(await readFile(join(root,'files',first.id,'논문 sample.pdf')),bytes);
 }finally{await library.close();}
});
