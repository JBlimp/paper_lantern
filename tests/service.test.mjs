import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createService } from '../companion/service.mjs';
import { pipeName, decoder, frame } from '../companion/ipc.mjs';
function client(path) {
  const socket = connect(path), pending = new Map(); let serial = 0;
  socket.on('error', () => {});
  socket.on('data', decoder(m => { const p = pending.get(m.id); pending.delete(m.id); if(p) m.error ? p.reject(new Error(m.error)) : p.resolve(m.result); }, e => socket.destroy(e)));
  socket.on('close', () => { for(const p of pending.values()) p.reject(new Error('closed')); pending.clear(); });
  return { socket, request(method,params={}) { return new Promise((resolve,reject) => { const id=++serial; pending.set(id,{resolve,reject}); socket.write(frame({id,method,params})); }); } };
}
test('PC owns one Codex across profiles; client close only cancels its own request', async () => {
  const root=await mkdtemp(join(tmpdir(),'lantern-service-')), path=pipeName(root);
  let starts=0, closed=0, calls=0;
  const codex={closed:false,async start(){starts++;},async status(){return {models:[{id:'fake'}]};},async close(){closed++;this.closed=true;},generate(prompt,schema,model,signal){calls++;return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});setTimeout(()=>resolve(JSON.stringify({answer:'answer',pages:[1]})),60);});}};
  const service=createService({}, {makeCodex:()=>codex,library:{async close(){}}});
  let a,b,c;
  try {
    await service.listen(path);a=client(path);b=client(path);await Promise.all([once(a.socket,'connect'),once(b.socket,'connect')]);
    const [sa,sb]=await Promise.all([a.request('status'),b.request('status')]);
    assert.equal(starts,1);assert.equal(sa.serverPid,sb.serverPid);assert.equal(sa.protocolVersion,9);
    const params={question:'Explain',pages:[{page:1,text:'Evidence.'}]};
    const cancelled=assert.rejects(a.request('ask',params),/closed/);const answer=b.request('ask',params);
    a.socket.destroy();await cancelled;assert.equal((await answer).answer,'answer');
    b.socket.destroy();await new Promise(r=>setTimeout(r,10));assert.equal(closed,0);
    c=client(path);await once(c.socket,'connect');assert.equal((await c.request('health')).state,'ready');
    const ended=once(c.socket,'close');await service.close();await ended;assert.equal(closed,1);assert(calls>=1);
    const after=connect(path);await once(after,'error');after.destroy();
  } finally {a?.socket.destroy();b?.socket.destroy();c?.socket.destroy();await service.close();await rm(root,{recursive:true,force:true});}
});
test('owner EOF ends service and relay; relay never starts app when it is off', async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-owner-')), app=join(root,'app'), env={...process.env,LOCALAPPDATA:root};
  await cp(resolve('companion'),app,{recursive:true});await writeFile(join(app,'config.json'),JSON.stringify({codex:process.execPath}));
  let owner,relay;
  try {
    owner=spawn(process.execPath,[join(app,'app-service.mjs')],{env,stdio:['pipe','pipe','pipe'],windowsHide:true});
    let err='';owner.stderr.on('data',d=>err+=d);
    const path=pipeName(join(root,'PaperLantern'));
    let connection;
    for(let i=0;i<100;i++){connection=client(path);const ok=await new Promise(r=>{connection.socket.once('connect',()=>r(true));connection.socket.once('error',()=>r(false));});if(ok)break;connection.socket.destroy();connection=null;await new Promise(r=>setTimeout(r,20));}
    assert(connection,err);assert.equal((await connection.request('health')).state,'ready');connection.socket.destroy();
    relay=spawn(process.execPath,[join(app,'host.mjs')],{env,stdio:['pipe','pipe','pipe'],windowsHide:true});
    const messages=[];let receive;relay.stdout.on('data',decoder(m=>{messages.push(m);receive?.(m);},()=>{}));
    const response=new Promise(r=>receive=r);relay.stdin.write(frame({id:1,method:'health'}));assert.equal((await response).result.serverPid,owner.pid);
    const ownerExit=once(owner,'exit'),relayExit=once(relay,'exit');owner.stdin.end();await ownerExit;await relayExit;
    assert(messages.some(m=>m.disconnected));
    const offline=spawn(process.execPath,[join(app,'host.mjs')],{env,stdio:['pipe','pipe','pipe'],windowsHide:true});
    const denied=[];offline.stdout.on('data',decoder(m=>denied.push(m),()=>{}));await once(offline,'exit');
    assert(denied[0]?.disconnected);assert.match(denied[0].error,/PC 프로그램/);
  } finally {owner?.kill();relay?.kill();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
