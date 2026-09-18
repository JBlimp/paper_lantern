import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBodyProfile, filterBody, type PageText } from '../src/bodyFilter.ts';
import { graphicRegions } from '../src/graphics.ts';
import type { Word } from '../src/layout.ts';
const w = (index: number, str: string, x: number, y: number, width = 240, height = 11): Word => ({ index, str, x, y, width, height });
test('document-wide repeated margins are removed at either alignment; body prose remains', () => {
  const pages: PageText[] = [1,2,3].map(n => ({ width:600, height:800, words:[
    w(0,'Journal of Independent Research',50,28,300,9), w(1,`${n}`,550,760,7,10),
    w(2,`The body discusses a different method on page ${n}.`,50,150,480),
    w(3,'A short but meaningful footnote is retained.',50,690,270,8),
  ] }));
  const profile = buildBodyProfile(pages);
  for (const page of pages) assert.deepEqual(filterBody(page,{profile}).words.map(w => w.index),[2,3]);
});
test('horizontal arXiv margin metadata excluded without removing arxiv mentions in body', () => {
  const page = { width:600,height:800,words:[w(0,'arXiv:1234.56789v2 [cs.IR]',30,30),w(1,'We compare with results published on arxiv.org.',50,180)] };
  assert.deepEqual(filterBody(page).words.map(w => w.index),[1]);
});
test('unlabelled graphic with body-sized text uses graphic geometry, not font size', () => {
  const page = { width:600,height:800,words:[w(0,'This paragraph is the actual scientific explanation.',50,130,450),w(1,'Input features',90,310,90),w(2,'Output results',90,360,100),w(3,'The analysis resumes below the diagram.',50,540,420)] };
  const result = filterBody(page,{graphics:[{x:70,y:280,width:250,height:170}]});
  assert.deepEqual(result.words.map(w => w.index),[0,3]);
});
test('figure captions excluded, but sentences citing a figure and inline math retained', () => {
  const page = {width:600,height:800,words:[w(0,'Figure 2: Experimental accuracy across settings.',50,250,470,10),w(1,'Figure 2 shows that x + y = 2 is insufficient.',50,420,460,11),w(2,'A small paragraph can still be important.',50,600,250,8)]};
  assert.deepEqual(filterBody(page).words.map(w => w.index),[1,2]);
});
test('semantic exclusions preserve source indices and never drop neighbouring prose', () => {
  const page={width:600,height:800,words:[w(5,'Long diagram description using normal prose and normal size.',50,200,490),w(8,'The actual body has a similar font and length.',50,400,480)]};
  assert.deepEqual(filterBody(page,{taggedExcluded:new Set([5])}).words.map(w => w.index),[8]);
});
test('full-page background and isolated underline do not remove body paragraphs', () => {
  const page={width:600,height:800,words:[w(0,'This text is laid over a full-page background.',50,200,480)]};
  assert.equal(filterBody(page,{graphics:[{x:0,y:0,width:600,height:800}]}).words.length,1);
  const ops={save:1,restore:2,transform:3,constructPath:4,stroke:5,paintImageXObject:6};
  assert.deepEqual(graphicRegions({fnArray:[4],argsArray:[[5,[],[50,180,500,180]]]},ops,[1,0,0,1,0,0],600,800),[]);
});
test('connected axes/bar strokes form a graphic; transforms are applied', () => {
  const ops={save:1,restore:2,transform:3,constructPath:4,stroke:5,paintImageXObject:6};
  const regions=graphicRegions({fnArray:[1,3,4,4,4,2],argsArray:[[],[1,0,0,1,50,100],[5,[],[0,0,200,0]],[5,[],[0,0,0,100]],[5,[],[10,0,30,60]],[]]},ops,[1,0,0,1,0,0],600,800);
  // The bar joins the baseline; the vertical axis joins its left endpoint.
  assert.equal(regions.length,1);
  assert.equal(regions[0].x,50); assert.equal(regions[0].y,100);
});
test('a bordered prose callout is retained when there is no figure evidence', () => {
  const page={width:600,height:800,words:[
    w(0,'The theorem gives an important guarantee about the algorithm and its convergence properties.',60,220,450),
    w(1,'The proof follows by considering each independent sample and applying the stated assumptions.',60,236,450),
  ]};
  assert.equal(filterBody(page,{graphics:[{x:50,y:200,width:480,height:80}]}).words.length,2);
});
