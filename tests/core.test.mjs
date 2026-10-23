import test from 'node:test';
import assert from 'node:assert/strict';
import {count,limit,validateComment} from '../shared/protocol.mjs';
import {Scheduler} from '../shared/scheduler.mjs';
test('graphemes: emoji, combining marks, family and Japanese; 30 character boundary',()=>{
  assert.equal(count('😂👨‍👩‍👧‍👦👍🏽🇯🇵か\u3099'),5);
  assert.equal(count(limit('👩‍🔬'.repeat(31))),30);
  assert.equal(validateComment(' あ😂 '),'あ😂');
  assert.equal(validateComment('🐭'.repeat(30)),'🐭'.repeat(30));
  assert.throws(()=>validateComment('🐭'.repeat(31)));
  for(const value of ['', '　 ', '\u200b', 'a\nb', 'a\rb','a\u2028b','a\u202eb',null])assert.throws(()=>validateComment(value));
  assert.equal(validateComment('<script>alert(1)</script>'),'<script>alert(1)</script>');
  assert.equal(validateComment('https://example.org'),'https://example.org');
  assert.throws(()=>validateComment('a'+'\u0301'.repeat(3000)));
});
test('queue retains newest 50 and releases in FIFO order',()=>{
  const s=new Scheduler(()=>100);s.paused=true;s.tick(0);
  for(let n=0;n<51;n++)s.enqueue(String(n));assert.equal(s.queue.length,50);assert.equal(s.queue[0].text,'1');
  s.tick(60000);assert.equal(s.active.length,0);s.paused=false;s.tick(60016);assert.equal(s.active[0].text,'1');assert.equal(s.queue.length,49);
  s.tick(60032);assert.equal(s.queue.length,49); // No backlog burst.
  s.tick(60160);assert.equal(s.active[1].text,'2');
});
test('same-lane minimum spacing, equal velocity and 2 second fallback',()=>{
  const s=new Scheduler(()=>500);s.configure({width:900,height:40,fontSize:36});s.tick(0);s.enqueue('first');s.tick(1);s.enqueue('second');
  s.tick(1999);assert.equal(s.active.length,1);s.tick(2001);assert.equal(s.active.length,2);
  const positions=s.active.map(i=>i.x);s.tick(3001);assert.deepEqual(s.active.map((i,n)=>Math.round(positions[n]-i.x)),[100,100]);
  const t=new Scheduler(()=>100);t.configure({width:900,height:40});t.tick(0);t.enqueue('a');t.tick(1);t.enqueue('b');t.tick(1500);assert.equal(t.active.length,1);t.tick(1501);assert.equal(t.active.length,2);assert.equal(t.active[1].x-(t.active[0].x+t.active[0].width),50);
});
test('OFF/edit pause movement and waiting clock; clear removes both buffers',()=>{
  const s=new Scheduler(()=>100);s.tick(0);s.enqueue('a');s.tick(10);s.enqueue('b');const x=s.active[0].x,clock=s.clock;
  s.paused=true;s.tick(100000);assert.equal(s.active[0].x,x);assert.equal(s.clock,clock);assert.equal(s.queue.length,1);
  s.paused=false;s.tick(100010);assert.ok(s.active[0].x<x);s.clear();assert.equal(s.active.length,0);assert.equal(s.queue.length,0);
});
test('normal movement crosses region in nine seconds, leaves after tail exits',()=>{
  const s=new Scheduler(()=>100);s.configure({width:900});s.tick(0);s.enqueue('a');s.tick(1);s.tick(9001);assert.equal(s.active[0].x,0);s.tick(10002);assert.equal(s.active.length,0);
});
