import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import WebSocket from 'ws';
import {createService} from '../server/app.mjs';
const key='test-presenter-key-1234567890';
async function setup(t,options={}){
  const service=createService({presenterKey:key,publicUrl:'https://comments.example.org',...options});
  service.server.listen(0,'127.0.0.1');await once(service.server,'listening');t.after(()=>service.close());
  const base=`http://127.0.0.1:${service.server.address().port}`;
  const call=async(route,method='GET',data,headers={})=>{const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)});return {status:response.status,data:await response.json()};};
  const create=async(name='研究室セミナー')=>(await call('/api/sessions','POST',{name},{'X-Presenter-Key':key})).data;
  const socket=async auth=>{const ws=new WebSocket(base.replace('http:','ws:')+'/live');await once(ws,'open');const event=once(ws,'message');ws.send(JSON.stringify(auth));await event;return ws;};
  return {...service,base,call,create,socket};
}
test('create key, random ids, room resolution, isolated host token',async t=>{
  const {call,create}=await setup(t);
  assert.equal((await call('/api/sessions','POST',{name:'n'})).status,401);
  const a=await create(),b=await create();assert.notEqual(a.id,b.id);assert.match(a.id,/^[A-Za-z0-9_-]{32}$/);assert.match(a.roomCode,/^[23456789A-HJ-NP-Z]{6}$/);
  const room=await call('/api/rooms/'+a.roomCode.toLowerCase());assert.equal(room.data.id,a.id);assert.equal(room.data.hostToken,undefined);assert.equal(room.data.joinUrl,`https://comments.example.org/join/${a.id}`);
  assert.equal((await call('/api/sessions/'+a.id,'DELETE',undefined,{Authorization:`Bearer ${b.hostToken}`})).status,403);
  assert.equal((await call('/api/sessions','POST',{name:'\n'},{'X-Presenter-Key':key})).status,400);
});
test('live comments only to authorized hosts; no participant feed or stored bodies',async t=>{
  const {create,call,socket,sessions}=await setup(t);const s=await create();
  const host=await socket({role:'host',id:s.id,token:s.hostToken}),participant=await socket({role:'participant',id:s.id});
  const other=await create();const isolated=await socket({role:'host',id:other.id,token:other.hostToken});
  let participantMessages=0,isolatedMessages=0;participant.on('message',()=>participantMessages++);isolated.on('message',()=>isolatedMessages++);
  const received=once(host,'message');assert.equal((await call(`/api/sessions/${s.id}/comments`,'POST',{text:'<script>alert(1)</script>'})).status,200);
  assert.equal(JSON.parse((await received)[0]).text,'<script>alert(1)</script>');assert.equal(participantMessages,0);assert.equal(isolatedMessages,0);
  assert.equal(JSON.stringify({...sessions.get(s.id),hosts:[],participants:[]}).includes('<script>'),false);
  assert.equal((await call(`/api/sessions/${s.id}/comments`,'POST',{text:'x'.repeat(31)})).status,400);
  assert.equal((await call(`/api/sessions/${s.id}/comments`,'POST',{text:'a\nb'})).status,400);
  const hostEnd=once(host,'message'),participantEnd=once(participant,'message');
  assert.equal((await call(`/api/sessions/${s.id}`,'DELETE',undefined,{Authorization:`Bearer ${s.hostToken}`})).status,200);
  assert.equal(JSON.parse((await hostEnd)[0]).type,'ended');assert.equal(JSON.parse((await participantEnd)[0]).type,'ended');
  assert.equal((await call(`/api/sessions/${s.id}/comments`,'POST',{text:'late'})).status,410);assert.equal(sessions.has(s.id),false);
});
test('expiry is enforced at submission and room resolution, invalid host rejected',async t=>{
  let now=0;const {create,call,base}=await setup(t,{now:()=>now,ttl:1000});const s=await create();
  const ws=new WebSocket(base.replace('http:','ws:')+'/live');await once(ws,'open');const closed=once(ws,'close');ws.send(JSON.stringify({role:'host',id:s.id,token:'wrong'}));assert.equal((await closed)[0],4003);
  now=1001;assert.equal((await call(`/api/sessions/${s.id}/comments`,'POST',{text:'late'})).status,410);assert.equal((await call('/api/rooms/'+s.roomCode)).status,404);
});
test('50 participant sockets and 50 posts preserve delivery order',async t=>{
  const {create,socket,call}=await setup(t);const s=await create();const host=await socket({role:'host',id:s.id,token:s.hostToken});
  await Promise.all(Array.from({length:50},()=>socket({role:'participant',id:s.id})));
  const received=[];host.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='comment')received.push(m.text);});
  for(let i=0;i<50;i++)assert.equal((await call(`/api/sessions/${s.id}/comments`,'POST',{text:`投稿${i}`})).status,200);
  assert.deepEqual(received,Array.from({length:50},(_,i)=>`投稿${i}`));
});
test('origin guard, creation throttling, bounded body and static CSP',async t=>{
  const {call,base}=await setup(t);
  assert.equal((await call('/api/sessions','POST',{name:'x'},{Origin:'https://evil.example','X-Presenter-Key':key})).status,403);
  assert.equal((await call('/api/sessions','POST',{name:'x'.repeat(5000)},{'X-Presenter-Key':key})).status,413);
  for(let i=0;i<12;i++)assert.equal((await call('/api/sessions','POST',{name:'x'},{'X-Presenter-Key':key})).status,201);
  assert.equal((await call('/api/sessions','POST',{name:'x'},{'X-Presenter-Key':key})).status,429);
  const page=await fetch(base);assert.equal(page.status,200);assert.match(page.headers.get('Content-Security-Policy'),/script-src 'self'/);assert.equal((await fetch(base+'/server/app.mjs')).status,404);
});
test('malformed websocket messages cannot crash the server',async t=>{
  const {base}=await setup(t);
  for(const payload of ['null','[]','42','{','"text"']){
    const ws=new WebSocket(base.replace('http:','ws:')+'/live');await once(ws,'open');const closed=once(ws,'close');ws.send(payload);assert.ok([4001,4003].includes((await closed)[0]));
    assert.equal((await fetch(base+'/healthz')).status,200);
  }
});
test('bundled backend can advertise its assigned port and later a public tunnel',async t=>{
  const service=createService({presenterKey:key,publicUrl:'http://127.0.0.1'});service.server.listen(0,'127.0.0.1');await once(service.server,'listening');t.after(()=>service.close());
  const local=`http://127.0.0.1:${service.server.address().port}`;service.setPublicUrl(local);
  const created=await fetch(local+'/api/sessions',{method:'POST',headers:{'Content-Type':'application/json','X-Presenter-Key':key},body:JSON.stringify({name:'内蔵サーバー'})});const session=await created.json();assert.ok(session.joinUrl.startsWith(local+'/join/'));
  service.setPublicUrl('https://sample-test.trycloudflare.com');const info=await (await fetch(local+'/api/sessions/'+session.id)).json();assert.equal(info.joinUrl,`https://sample-test.trycloudflare.com/join/${session.id}`);
  assert.throws(()=>service.setPublicUrl('file:///etc/passwd'));assert.throws(()=>service.setPublicUrl('https://test.example/path'));
});
