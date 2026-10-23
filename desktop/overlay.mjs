import {Scheduler} from '../shared/scheduler.mjs';
import {localize} from '../shared/i18n.mjs';
const area = document.querySelector('#area'), editor = document.querySelector('#editor'), selection = document.querySelector('#selection');
const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
const scheduler = new Scheduler((text,size) => {ctx.font = `800 ${size}px -apple-system,BlinkMacSystemFont,"Yu Gothic","Meiryo",sans-serif`;return ctx.measureText(text).width + 8;});
const nodes = new Map(); let state, start;
function apply(s) {
  localize(document,s.settings.language);
  state = s; const r = s.settings.region;
  const rect = {left:r.x * innerWidth, top:r.y * innerHeight, width:r.w * innerWidth, height:r.h * innerHeight};
  Object.assign(area.style, Object.fromEntries(Object.entries(rect).map(([k,v])=>[k,`${v}px`])));
  scheduler.configure({width:rect.width,height:rect.height,fontSize:s.settings.fontSize,speed:s.settings.speed});
  scheduler.paused = !s.visible || s.editing;
  area.hidden = scheduler.paused;
  editor.hidden = !s.editing;
  if(s.editing && !start) Object.assign(selection.style, {left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
}
window.seminar.onState(apply); window.seminar.state().then(apply);
window.seminar.onComment(text => scheduler.enqueue(text));
window.seminar.onClear(() => {scheduler.clear(); for(const n of nodes.values()) n.remove();nodes.clear();});
window.addEventListener('resize',()=>state && apply(state));
function frame(now) {
  const active = scheduler.tick(now); const ids = new Set(active.map(i => i.id));
  for(const [id,node] of nodes) if(!ids.has(id)){node.remove();nodes.delete(id);}
  for(const item of active) {
    let node = nodes.get(item.id);
    if(!node){node = document.createElement('span');node.className='comment';node.textContent=item.text;area.append(node);nodes.set(item.id,node);}
    node.style.fontSize = `${scheduler.config.fontSize}px`;
    node.style.transform = `translate(${item.x}px,${item.lane * Math.ceil(scheduler.config.fontSize*1.1)}px)`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
editor.addEventListener('pointerdown', e => {start={x:e.clientX,y:e.clientY};editor.setPointerCapture(e.pointerId);});
editor.addEventListener('pointermove', e => {if(!start)return;Object.assign(selection.style,{left:`${Math.min(start.x,e.clientX)}px`,top:`${Math.min(start.y,e.clientY)}px`,width:`${Math.abs(start.x-e.clientX)}px`,height:`${Math.abs(start.y-e.clientY)}px`});});
editor.addEventListener('pointerup', async e => {
  if(!start)return; const end={x:Math.min(innerWidth,Math.max(0,e.clientX)),y:Math.min(innerHeight,Math.max(0,e.clientY))};
  const r={x:Math.min(start.x,end.x)/innerWidth,y:Math.min(start.y,end.y)/innerHeight,w:Math.abs(start.x-end.x)/innerWidth,h:Math.abs(start.y-end.y)/innerHeight};start=null;
  if(r.w*innerWidth>=100 && r.h*innerHeight>=state.settings.fontSize*1.1) await window.seminar.action('region',r);
});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){start=null;window.seminar.action('cancelEdit');}});
