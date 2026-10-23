import assert from 'node:assert/strict';
import {once} from 'node:events';
import {requestTunnel} from './tunnel.mjs';
import {createService} from '../server/app.mjs';
import fs from 'node:fs';
import {BrowserWindow} from 'electron';
import path from 'node:path';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let n=0;n<120;n++){if(await check())return;await delay(50);}throw new Error('Timed out waiting for expected state');}
export async function run({perform,state,overlay,qrWindow,control,breakConnection,runtimeUrl,settingsPath}){
  const service=createService({presenterKey:'self-test-key-1234567890',publicUrl:'http://127.0.0.1:8787'});service.server.listen(0,'127.0.0.1');await once(service.server,'listening');
  const base=`http://127.0.0.1:${service.server.address().port}`;
  service.setPublicUrl(base);
  const read=expression=>overlay.webContents.executeJavaScript(expression);let s;
  const qrRead=expression=>qrWindow.webContents.executeJavaScript(expression);
  const post=async text=>{const r=await fetch(`${base}/api/sessions/${s.id}/comments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});assert.equal(r.status,200);};
  const results=[];let participant;
  async function screenshot(win,name){if(!process.env.SEMINAR_SCREENSHOT_DIR)return;fs.mkdirSync(process.env.SEMINAR_SCREENSHOT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.SEMINAR_SCREENSHOT_DIR,name),(await win.webContents.capturePage()).toPNG());}
  try{
    await perform('configure',{serverUrl:base,presenterKey:'self-test-key-1234567890'});await perform('start','接続テスト');await until(()=>state().status==='接続中');s=state().session;
    assert.ok(state().qrImage.startsWith('data:image/png;base64,'));results.push('session creation, host authentication, QR generation');
    participant=new BrowserWindow({show:false,width:390,height:844,useContentSize:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    const mobile=expression=>participant.webContents.executeJavaScript(expression);
    await participant.loadURL(`${base}/join/${s.id}`);await until(()=>mobile(`!document.querySelector('#posting').hidden`));
    await mobile(`document.querySelector('#language').value='en';document.querySelector('#language').dispatchEvent(new Event('change'))`);
    assert.equal(await mobile(`document.querySelector('#send').textContent`),'Send');assert.equal(await mobile(`document.querySelector('#sessionName').textContent`),s.name);
    assert.equal(await mobile(`document.documentElement.scrollWidth<=innerWidth`),true);await screenshot(participant,'phone-en.png');
    await mobile(`document.querySelector('#comment').value='Hello 🐭';document.querySelector('#commentForm').requestSubmit()`);
    await until(()=>mobile(`!document.querySelector('#toast').hidden`));assert.equal(await mobile(`document.querySelector('#toast strong').textContent`),'Sent');
    await until(()=>read(`document.querySelector('.comment')?.textContent==='Hello 🐭'`));
    await mobile(`document.querySelector('#comment').value='x'.repeat(31);document.querySelector('#commentForm').requestSubmit()`);
    await until(()=>mobile(`document.querySelector('#status').textContent==='Comments must be 30 characters or fewer.'`));
    await mobile(`document.querySelector('#comment').value='残す 🐭';document.querySelector('#language').value='ja';document.querySelector('#language').dispatchEvent(new Event('change'))`);
    assert.equal(await mobile(`document.querySelector('#comment').value`),'残す 🐭');assert.equal(await mobile(`document.querySelector('#send').textContent`),'送信する');
    await mobile(`document.querySelector('#language').value='en';document.querySelector('#language').dispatchEvent(new Event('change'))`);
    await participant.reload();await until(()=>mobile(`document.documentElement.lang==='en'&&!document.querySelector('#posting').hidden`));
    participant.destroy();participant=null;await perform('clear');await until(()=>read(`document.querySelectorAll('.comment').length===0`));results.push('mobile Japanese/English switching, posting, validation, draft preservation and saved language after reload');
    await post('<script>alert(1)</script>');await until(()=>read(`document.querySelector('.comment')?.textContent === '<script>alert(1)</script>'`));assert.equal(await read(`document.querySelectorAll('#area script').length`),0);results.push('HTTP → WebSocket → native overlay; literal XSS text');
    await perform('clear');await until(()=>read(`document.querySelectorAll('.comment').length===0`));await post('QR表示前から流れる');await until(()=>read(`document.querySelector('.comment')?.textContent==='QR表示前から流れる'`));
    await perform('qr');await until(async()=>qrWindow.isVisible()&&await read(`!document.querySelector('#area').hidden`));
    await until(()=>qrRead(`document.querySelector('#code').complete && document.querySelector('#code').naturalWidth>0`));
    const beforeQrMotion=await read(`document.querySelector('.comment').style.transform`);await delay(200);assert.notEqual(await read(`document.querySelector('.comment').style.transform`),beforeQrMotion);
    await post('QR中も届きます');await until(()=>read(`Array.from(document.querySelectorAll('.comment')).some(n=>n.textContent==='QR中も届きます')`));
    await perform('test');assert.equal(state().qrVisible,true);await until(()=>read(`Array.from(document.querySelectorAll('.comment')).some(n=>n.textContent==='コメント表示テストです 🐭')`));results.push('QR stays visible while existing, incoming and test comments keep moving');
    const beforeSize=qrWindow.getBounds();await qrRead(`document.querySelector('#smaller').click()`);await until(()=>qrWindow.getBounds().width<beforeSize.width);
    await qrRead(`document.querySelector('#larger').click()`);await until(()=>qrWindow.getBounds().width>Math.round(beforeSize.width*.85));
    const d=state().displays.find(d=>d.id===state().settings.displayId).bounds;
    qrWindow.setPosition(d.x+100,d.y+100);await until(()=>Math.abs(state().settings.qr.x-100/d.width)<.002);
    const resized=qrWindow.getBounds();qrWindow.setSize(resized.width+40,resized.height+20);await until(()=>state().settings.qr.width===resized.width+40);
    assert.equal(JSON.parse(fs.readFileSync(settingsPath,'utf8')).qr.width,resized.width+40);results.push('QR resize buttons, native move/resize and persisted geometry');
    const expanded=qrWindow.getBounds();await qrRead(`document.querySelector('#fold').click()`);await until(()=>state().settings.qr.collapsed&&qrWindow.getBounds().height===44);
    assert.equal(qrWindow.getBounds().width,184);assert.equal(qrWindow.isResizable(),false);await until(()=>qrRead(`!document.querySelector('#tab').hidden && document.querySelector('#card').hidden`));
    assert.equal(JSON.parse(fs.readFileSync(settingsPath,'utf8')).qr.collapsed,true);
    await post('タブでも流れます');await until(()=>read(`Array.from(document.querySelectorAll('.comment')).some(n=>n.textContent==='タブでも流れます')`));
    qrWindow.setPosition(d.x+160,d.y+140);await until(()=>Math.abs(state().settings.qr.x-160/d.width)<.002);
    await qrRead(`document.querySelector('#expand').click()`);await until(()=>!state().settings.qr.collapsed&&qrWindow.getBounds().height===expanded.height);
    assert.equal(qrWindow.getBounds().width,expanded.width);assert.equal(qrWindow.getBounds().x,d.x+160);assert.equal(qrWindow.getBounds().y,d.y+140);assert.equal(qrWindow.isResizable(),true);results.push('collapse to draggable tab, comments continue, expand restores size at new location');
    await perform('edit');assert.equal(qrWindow.isVisible(),false);await perform('cancelEdit');assert.equal(qrWindow.isVisible(),true);
    await perform('qrReset');assert.equal(qrWindow.getBounds().width,380);assert.equal(qrWindow.getBounds().height,520);
    await qrRead(`document.querySelector('#hide').click()`);await until(()=>!state().qrVisible&&!qrWindow.isVisible());assert.ok(state().session);await perform('qr');results.push('QR reset, temporary hiding during region edit, close keeps session alive');
    await perform('clear');await perform('visible');await delay(100);for(let n=0;n<51;n++)await post(`待機${n}`);await delay(100);await perform('visible');await until(()=>read(`document.querySelector('.comment')?.textContent==='待機1'`));await perform('qr');results.push('OFF retains newest 50 in FIFO, including when QR is visible');
    await perform('clear');await perform('visible');await delay(100);await post('OFF中');await delay(100);assert.equal(await read(`document.querySelectorAll('.comment').length`),0);await perform('visible');await until(()=>read(`document.querySelector('.comment')?.textContent==='OFF中'`));results.push('OFF queue / ON resume');
    await perform('edit');assert.equal(state().editing,true);await perform('region',{x:.1,y:.1,w:.8,h:.4});assert.equal(state().editing,false);await perform('fontSize',48);await perform('speed','fast');await until(()=>read(`document.querySelector('.comment')?.style.fontSize==='48px'`));results.push('edit mode exit, region, font size, speed');
    breakConnection();await until(()=>state().status.includes('再接続'));await until(()=>state().status==='接続中');await perform('clear');await post('再接続できました');await until(()=>read(`document.querySelector('.comment')?.textContent==='再接続できました'`));results.push('automatic reconnection and new live delivery');
    await perform('clear');await perform('visible');await perform('test');await until(()=>read(`document.querySelector('.comment')?.textContent==='コメント表示テストです 🐭'`));assert.equal(state().visible,true);assert.equal(state().testCount,2);results.push('test action restores visible overlay and records delivery');
    await perform('end');assert.equal(state().session,null);await until(()=>read(`document.querySelectorAll('.comment').length===0`));results.push('session termination and clear');
    await perform('mode','local');await perform('start','設定不要テスト');await until(()=>state().status==='接続中');
    const local=state().session;assert.equal(state().mode,'local');assert.ok(local.joinUrl.startsWith(runtimeUrl()));
    const response=await fetch(runtimeUrl()+`/api/sessions/${local.id}/comments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'内蔵サーバーから届きました'})});assert.equal(response.status,200);
    await until(()=>read(`document.querySelector('.comment')?.textContent==='内蔵サーバーから届きました'`));await perform('end');results.push('bundled backend: session creation and posting with no server configuration');
    await perform('language','en');await until(()=>control.webContents.executeJavaScript(`document.querySelector('#start').textContent==='Start'`));
    assert.equal(await control.webContents.executeJavaScript(`document.querySelector('#testDelayed')===null && document.querySelector('#mode option[value="quick"]').textContent==='Join from phones'`),true);
    await until(()=>qrRead(`document.querySelector('#fold').getAttribute('aria-label')==='Collapse QR to tab'`));
    assert.equal(JSON.parse(fs.readFileSync(settingsPath,'utf8')).language,'en');await perform('test');
    await until(()=>read(`Array.from(document.querySelectorAll('.comment')).some(n=>n.textContent==='Comment display test 🐭')`));
    assert.equal(await read(`document.querySelector('#editor p').textContent`),'Drag to select the comment area · Esc to cancel');
    assert.equal(await control.webContents.executeJavaScript(`document.documentElement.scrollWidth<=innerWidth`),true);await screenshot(control,'desktop-en.png');
    await perform('language','ja');await until(()=>control.webContents.executeJavaScript(`document.querySelector('#start').textContent==='開始'`));results.push('presenter, QR accessibility labels, area editor and test comments switch language and save preference');
    if(process.env.SEMINAR_TEST_TUNNEL==='1'){
      await perform('mode','quick');await perform('start','スマホ参加の接続試験');await until(()=>state().status==='接続中');
      const quick=state().session;assert.match(quick.joinUrl,/^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/join\//);
      const posted=await requestTunnel(quick.joinUrl.replace('/join/','/api/sessions/')+'/comments',{method:'POST',headers:{'Content-Type':'application/json',Origin:new URL(quick.joinUrl).origin},body:JSON.stringify({text:'インターネット経由の投稿です'})});assert.equal(posted.status,200);
      await until(()=>read(`document.querySelector('.comment')?.textContent==='インターネット経由の投稿です'`));await perform('end');results.push('public HTTPS tunnel: real Internet post → authenticated host → overlay');
    }
    console.log(JSON.stringify({selfTest:true,passed:results,bounds:overlay.getBounds(),displays:state().displays},null,2));
  }finally{participant?.destroy();await service.close();}
}
