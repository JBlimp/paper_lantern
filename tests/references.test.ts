import {test} from 'node:test';
import assert from 'node:assert/strict';
import {citationNumbers,parseReferences} from '../src/references.ts';
test('citation groups and ranges',()=>{assert.deepEqual(citationNumbers('[2, 4–6]'),[2,4,5,6]);assert.deepEqual(citationNumbers('[9-2]'),[]);});
test('numbered bibliography spans rows and pages',()=>{const refs=parseReferences([{page:1,rows:['Body [1].','References','[1] Author. 2025. A complete paper title.','Published in a conference.']},{page:2,rows:['[2] Another author. 2026. Another paper title.','Appendix A','Text that is not a reference.']}]);assert.match(refs.get(1).text,/conference/);assert.equal(refs.get(2).page,2);assert.doesNotMatch(refs.get(2).text,/Appendix|Text that/);});
test('unknown sections and duplicate labels never invent a match',()=>{assert.equal(parseReferences([{page:1,rows:['[1] Not a bibliography section at all.']}]).size,0);assert.equal(parseReferences([{page:1,rows:['References','[1] First complete reference entry.','[1] Conflicting second reference entry.']}]).size,0);});
