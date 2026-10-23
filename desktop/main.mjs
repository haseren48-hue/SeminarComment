import {app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, globalShortcut, dialog, shell} from 'electron';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createService} from '../server/app.mjs';
import {startTunnel} from './tunnel.mjs';
import QRCode from 'qrcode';
import WebSocket from 'ws';
import {languageFor,translate} from '../shared/i18n.mjs';
const dir = path.dirname(fileURLToPath(import.meta.url));
const smoke = !app.isPackaged && process.argv.includes('--smoke');
const selfTest = !app.isPackaged && process.argv.includes('--self-test');
if(selfTest){const testRoot=path.resolve(dir,'../../../work/electron-test');fs.mkdirSync(testRoot,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(testRoot,'run-')));}
let control, overlay, qrWindow, tray, ws, reconnectTimer, authTimer, qrGeometryTimer, quitting=false, session=null, qrImage='', visible=true, qrVisible=false, editing=false, status='セッション未開始', requestBusy=false;
let settings={language:'ja',fontSize:36,speed:'normal',region:{x:0,y:.05,w:1,h:.5},displayId:null,qr:{x:1,y:1,width:380,height:520,collapsed:false}};
const t=text=>translate(text,settings.language);
let config={mode:'local',serverUrl:'',presenterKey:''};
let backend=null,tunnel=null,testCount=0,shortcutErrors=[];
let configPath, settingsPath;
const safeRead = file => {try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return {};}};
function runtimeUrl(){return config.mode==='external'?config.serverUrl:backend?.url;}
function runtimeKey(){return config.mode==='external'?config.presenterKey:backend?.key;}
async function stopBackend(){if(tunnel){tunnel.stop();tunnel=null;}if(backend){const old=backend;backend=null;await old.service.close();}}
async function ensureBackend(){
  if(config.mode==='external'){
    if(!config.serverUrl||!config.presenterKey)throw new Error('接続設定に公開サーバーのURLと作成キーを入力してください。');
    return;
  }
  if(!backend){
    const key=randomBytes(32).toString('base64url');
    const service=createService({presenterKey:key,publicUrl:'http://127.0.0.1'});
    await new Promise((resolve,reject)=>{service.server.once('error',reject);service.server.listen(0,'127.0.0.1',resolve);});
    const url=`http://127.0.0.1:${service.server.address().port}`;service.setPublicUrl(url);backend={service,key,url};
  }
  if(config.mode==='quick'&&!tunnel){
    status='スマホ参加用のURLを準備しています…';broadcast();
    const platform=process.platform==='darwin'?'mac':'win';
    const binary=path.join(app.isPackaged?path.join(process.resourcesPath,'tunnel'):path.resolve(dir,`../resources/${platform}-${process.arch}`),process.platform==='win32'?'cloudflared.exe':'cloudflared');
    tunnel=await startTunnel({binary,url:backend.url,directory:path.join(app.getPath('userData'),'tunnel'),onExit:()=>{expireLocal();status='スマホ接続が停止したためセッションを終了しました。再度開始してください。';broadcast();stopBackend().catch(report);}});
    backend.service.setPublicUrl(tunnel.url);

  }
}
function testComment(){
  testCount++;visible=true;if(editing)edit(false);position();
  status=`テストコメントを送信しました（${testCount}回）`;broadcast();
  overlay.webContents.send('comment',t('コメント表示テストです 🐭'));
}
function displayList(){return screen.getAllDisplays().map(d=>({id:d.id,label:d.label||`Display ${d.id}`,bounds:d.bounds}));}
function currentDisplay(){return screen.getAllDisplays().find(d=>d.id===settings.displayId)||screen.getPrimaryDisplay();}
function state(){return {version:app.getVersion(),testCount,shortcutErrors,mode:config.mode,settings,config:{mode:config.mode,serverUrl:config.serverUrl,keyConfigured:!!config.presenterKey},session:session?{id:session.id,name:session.name,roomCode:session.roomCode,joinUrl:session.joinUrl,expiresAt:session.expiresAt}:null,qrImage,visible,qrVisible,editing,status,requestBusy,displays:displayList()};}
function broadcast(){for(const win of [control,overlay,qrWindow])if(win&&!win.isDestroyed())win.webContents.send('state',state());syncQr();updateMenu();}
function writeSettings(){try{fs.writeFileSync(settingsPath,JSON.stringify(settings,null,2));}catch{status='設定を保存できません。端末の書き込み権限を確認してください。';}}
function clear(){overlay.webContents.send('clear');}
function qrBounds(){
  const d=currentDisplay().bounds,q=settings.qr;
  const width=Math.min(d.width,q.collapsed?184:Math.max(280,q.width));
  const height=Math.min(d.height,q.collapsed?44:Math.max(380,q.height));
  return {x:Math.round(d.x+Math.min(Math.max(0,q.x*d.width),d.width-width)),y:Math.round(d.y+Math.min(Math.max(0,q.y*d.height),d.height-height)),width:Math.round(width),height:Math.round(height)};
}
function syncQr(layout=false){
  if(!qrWindow||qrWindow.isDestroyed())return;
  if(layout){
    clearTimeout(qrGeometryTimer);
    qrWindow.setMinimumSize(settings.qr.collapsed?184:Math.min(280,currentDisplay().bounds.width),settings.qr.collapsed?44:Math.min(380,currentDisplay().bounds.height));
    qrWindow.setResizable(!settings.qr.collapsed);qrWindow.setBounds(qrBounds());
  }
  if(qrVisible&&session&&!editing){if(!qrWindow.isVisible())qrWindow.showInactive();qrWindow.moveTop();}
  else qrWindow.hide();
}
function rememberQrBounds(){
  clearTimeout(qrGeometryTimer);
  qrGeometryTimer=setTimeout(()=>{
    if(quitting||qrWindow.isDestroyed())return;
    const b=qrWindow.getBounds(),d=currentDisplay().bounds,q=settings.qr;
    q.x=Math.max(0,Math.min(1,(b.x-d.x)/d.width));q.y=Math.max(0,Math.min(1,(b.y-d.y)/d.height));
    if(!q.collapsed){q.width=Math.max(280,b.width);q.height=Math.max(380,b.height);}
    const clamped=qrBounds();if(Object.keys(clamped).some(k=>clamped[k]!==b[k]))qrWindow.setBounds(clamped);
    writeSettings();broadcast();
  },200);
}
function position(){const display=currentDisplay();settings.displayId=display.id;overlay.setBounds(display.bounds);overlay.setAlwaysOnTop(true,'screen-saver');overlay.showInactive();syncQr(true);broadcast();}
function edit(value){editing=value;overlay.setIgnoreMouseEvents(!value);overlay.setFocusable(value);syncQr();if(value){overlay.show();overlay.focus();}else overlay.showInactive();broadcast();}
function toggleQr(){if(config.mode==='local'){status='スマホ用QRは「スマホから参加」を選んでセッションを開始すると利用できます。';showControl();return;}if(!session){showControl();return;}qrVisible=!qrVisible;broadcast();}
function showControl(){control.show();control.focus();broadcast();}
function updateMenu(){if(!tray)return;tray.setContextMenu(Menu.buildFromTemplate([
 {label:t('設定・新しいセッション'),click:showControl},
 {label:t('セッションを終了'),enabled:!!session&&!requestBusy,click:()=>perform('end').catch(report)},
 {type:'separator'},
 {label:t('コメントを表示'),type:'checkbox',checked:visible,click:()=>{visible=!visible;broadcast();}},
 {label:t('QRコードを表示'),type:'checkbox',checked:qrVisible,enabled:!!session,click:toggleQr},
 {label:t('表示領域を編集'),click:()=>edit(!editing)},
 {label:t('表示先ディスプレイ'),submenu:displayList().map(d=>({label:d.label,type:'radio',checked:d.id===currentDisplay().id,click:()=>perform('display',d.id).catch(report)}))},
 {label:t('文字サイズ'),submenu:[24,36,48,60,72].map(size=>({label:`${size} px`,type:'radio',checked:settings.fontSize===size,click:()=>perform('fontSize',size).catch(report)}))},
 {label:t('速度'),submenu:[['slow','遅い'],['normal','普通'],['fast','速い']].map(([value,label])=>({label:t(label),type:'radio',checked:settings.speed===value,click:()=>perform('speed',value).catch(report)}))},
 {label:t('全コメント消去'),click:clear},{label:t('テストコメント（⌘/Ctrl+Shift+T）'),click:testComment},
 {type:'separator'},{label:t('アプリを終了'),click:()=>quit().catch(report)}]));}
function report(error){status=error.message||'操作に失敗しました。';broadcast();}
async function api(route,options={}) {
  let response;
  try{response=await fetch(`${runtimeUrl()}${route}`,{...options,headers:{'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(10000)});}catch{throw new Error('通信できません。サーバーURLとネットワークを確認してください。');}
  const body=await response.json().catch(()=>({error:'サーバーの応答を確認できません。'}));
  if(!response.ok)throw new Error(body.error||'通信に失敗しました。');return body;
}
function disconnect(){clearTimeout(reconnectTimer);clearTimeout(authTimer);const old=ws;ws=null;if(old)old.terminate();}
function expireLocal(){disconnect();session=null;qrImage='';qrVisible=false;clear();status='このセッションは終了しました。';broadcast();}
function connect(){
  if(!session||quitting)return;disconnect();
  if(Date.now()>=session.expiresAt){expireLocal();return;}
  const socket=new WebSocket(runtimeUrl().replace(/^http/,'ws')+'/live',{maxPayload:4096,handshakeTimeout:10000});ws=socket;
  socket.on('open',()=>{if(ws!==socket)return;socket.send(JSON.stringify({role:'host',id:session.id,token:session.hostToken}));authTimer=setTimeout(()=>socket.terminate(),10000);});
  socket.on('message',raw=>{if(ws!==socket)return;let event;try{event=JSON.parse(raw);}catch{return;}if(!event||typeof event!=='object')return;
    if(event.type==='ready'){clearTimeout(authTimer);status='接続中';broadcast();}
    else if(event.type==='comment'&&typeof event.text==='string')overlay.webContents.send('comment',event.text);
    else if(event.type==='ended')expireLocal();
  });
  socket.on('error',()=>{});
  socket.on('close',(code)=>{if(ws!==socket)return;clearTimeout(authTimer);ws=null;if(code===4001){expireLocal();return;}status='接続が切れました。自動再接続中…';broadcast();reconnectTimer=setTimeout(connect,2500+Math.random()*1000);});
}
async function endSession(){
  if(!session)return;
  try{await api(`/api/sessions/${session.id}`,{method:'DELETE',headers:{Authorization:`Bearer ${session.hostToken}`}});}catch(error){throw new Error(`${error.message} セッション終了を確認できないため、再試行してください（最長12時間で失効）。`);}
  expireLocal();
}
async function perform(action,value){
  if(['start','end','configure'].includes(action)) {
    if(requestBusy)throw new Error('処理中です。少し待ってください。');requestBusy=true;broadcast();
    try{
      if(action==='configure'){
        if(session)throw new Error('接続先変更の前にセッションを終了してください。');
        const url=new URL(value.serverUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('サーバーURLには http(s)://ホスト名 のみ指定してください。');
        if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('インターネット上ではHTTPSのURLを使ってください。');
        const key=value.presenterKey||config.presenterKey;if(typeof key!=='string'||key.length<16||key.length>256)throw new Error('作成キーは16〜256文字で設定してください。');
        const next={mode:'external',serverUrl:url.origin,presenterKey:key};await stopBackend();fs.writeFileSync(configPath,JSON.stringify(next,null,2),{mode:0o600});config=next;status='接続設定を保存しました。';
      }
      if(action==='start'){
        if(session)throw new Error('既存のセッションを終了してください。');
        const name=typeof value==='string'?value.trim():'';if(!name||Array.from(name).length>100)throw new Error('セッション名を1〜100文字で入力してください。');
        await ensureBackend();
        const created=await api('/api/sessions',{method:'POST',headers:{'X-Presenter-Key':runtimeKey()},body:JSON.stringify({name})});
        session=created;qrImage=await QRCode.toDataURL(created.joinUrl,{width:720,margin:4,errorCorrectionLevel:'M'});visible=true;clear();connect();
      }
      if(action==='end')await endSession();
    }finally{requestBusy=false;broadcast();}
    return;
  }
  switch(action){
    case 'language':if(!['ja','en'].includes(value))throw new Error('Invalid language.');settings.language=value;writeSettings();break;
    case 'mode':
      if(session||requestBusy)throw new Error('セッションを終了してから接続方法を変更してください。');
      if(!['local','quick','external'].includes(value))throw new Error('接続方法が不正です。');
      await stopBackend();config.mode=value;fs.writeFileSync(configPath,JSON.stringify(config,null,2),{mode:0o600});status=value==='local'?'このPC内で確認できます。':value==='quick'?'スマホから参加できる試験用接続です。開始時にURLを発行します。':'公開サーバーの接続設定を確認してください。';break;
    case 'openParticipant':
      if(!session)throw new Error('セッションを開始してください。');
      await shell.openExternal(session.joinUrl);break;
    case 'visible':visible=!visible;break;
    case 'qr':toggleQr();return;
    case 'qrHide':qrVisible=false;break;
    case 'qrCollapse':
      if(typeof value!=='boolean')throw new Error('QRの表示状態が不正です。');
      // Preserve a just-finished native drag before changing window dimensions.
      {const b=qrWindow.getBounds(),d=currentDisplay().bounds;settings.qr.x=Math.max(0,Math.min(1,(b.x-d.x)/d.width));settings.qr.y=Math.max(0,Math.min(1,(b.y-d.y)/d.height));if(!settings.qr.collapsed){settings.qr.width=b.width;settings.qr.height=b.height;}}
      settings.qr.collapsed=value;syncQr(true);writeSettings();break;
    case 'qrSize':
      if(![.85,1.15].includes(value))throw new Error('QRの大きさが不正です。');
      settings.qr.width=Math.round(Math.max(280,Math.min(currentDisplay().bounds.width,settings.qr.width*value)));
      settings.qr.height=Math.round(Math.max(380,Math.min(currentDisplay().bounds.height,settings.qr.height*value)));
      settings.qr.collapsed=false;syncQr(true);writeSettings();break;
    case 'qrReset':settings.qr={x:1,y:1,width:380,height:520,collapsed:false};syncQr(true);writeSettings();break;
    case 'edit':edit(!editing);return;
    case 'cancelEdit':edit(false);return;
    case 'region':{
      if(!editing)throw new Error('表示領域の編集モードではありません。');
      const r=value;if(!r||!['x','y','w','h'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.w<=0||r.h<=0||r.x+r.w>1.001||r.y+r.h>1.001)throw new Error('表示領域が不正です。');
      settings.region={x:r.x,y:r.y,w:Math.min(r.w,1-r.x),h:Math.min(r.h,1-r.y)};edit(false);writeSettings();break;
    }
    case 'display':if(!screen.getAllDisplays().some(d=>d.id===value))throw new Error('ディスプレイが見つかりません。');settings.displayId=value;writeSettings();position();break;
    case 'fontSize':if(![24,36,48,60,72].includes(value))throw new Error('文字サイズが不正です。');settings.fontSize=value;writeSettings();break;
    case 'speed':if(!['slow','normal','fast'].includes(value))throw new Error('速度が不正です。');settings.speed=value;writeSettings();break;
    case 'clear':clear();break;
    case 'test':testComment();break;
    default:throw new Error('不明な操作です。');
  }
  broadcast();
}
async function quit(){
  if(quitting)return;
  if(requestBusy){report(new Error('処理完了後に終了してください。'));return;}
  if(session){try{await perform('end');}catch(error){report(error);showControl();return;}}
  quitting=true;disconnect();await stopBackend();globalShortcut.unregisterAll();app.quit();
}
if(!app.requestSingleInstanceLock({version:app.getVersion()})){dialog.showErrorBox('SeminarComment is already running / 起動済み','Quit the running copy before opening this version. / 起動中のアプリを終了してから開いてください。');app.quit();}else{
app.on('second-instance',()=>control&&showControl());
app.whenReady().then(async()=>{
  settingsPath=path.join(app.getPath('userData'),'settings.json');configPath=path.join(app.getPath('userData'),'connection.json');
  const saved=safeRead(settingsPath);if([24,36,48,60,72].includes(saved.fontSize))settings.fontSize=saved.fontSize;if(['slow','normal','fast'].includes(saved.speed))settings.speed=saved.speed;
  settings.language=selfTest?'ja':languageFor(app.getLocale(),saved.language);
  if(saved.region&&['x','y','w','h'].every(k=>Number.isFinite(saved.region[k]))&&saved.region.x>=0&&saved.region.y>=0&&saved.region.w>0&&saved.region.h>0&&saved.region.x+saved.region.w<=1&&saved.region.y+saved.region.h<=1)settings.region=saved.region;
  settings.displayId=saved.displayId;
  if(saved.qr&&['x','y','width','height'].every(k=>Number.isFinite(saved.qr[k]))&&saved.qr.x>=0&&saved.qr.x<=1&&saved.qr.y>=0&&saved.qr.y<=1&&saved.qr.width>=280&&saved.qr.height>=380)settings.qr={x:saved.qr.x,y:saved.qr.y,width:saved.qr.width,height:saved.qr.height,collapsed:saved.qr.collapsed===true};
  const adjacent=path.join(path.dirname(app.getPath('exe')),'seminar-config.json');
  Object.assign(config,safeRead(configPath),safeRead(adjacent));
  if(process.env.SEMINAR_SERVER_URL){config.serverUrl=process.env.SEMINAR_SERVER_URL.replace(/\/$/,'');config.mode='external';}if(process.env.SEMINAR_PRESENTER_KEY)config.presenterKey=process.env.SEMINAR_PRESENTER_KEY;
  if(!['local','quick','external'].includes(config.mode))config.mode=config.presenterKey?'external':'local';
  if(config.mode==='local'&&config.presenterKey&&config.serverUrl&&!['http://127.0.0.1:8787',''].includes(config.serverUrl))config.mode='external';
  status=config.mode==='local'?'このPC内で確認できます。セッション名を入れて開始してください。':config.mode==='quick'?'スマホ参加用のURLを開始時に発行します。':'公開サーバーに接続します。';
  const webPreferences={preload:path.join(dir,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false};
  overlay=new BrowserWindow({...currentDisplay().bounds,transparent:true,frame:false,type:process.platform==='darwin'?'panel':'normal',hasShadow:false,alwaysOnTop:true,skipTaskbar:true,focusable:false,resizable:false,enableLargerThanScreen:true,show:false,webPreferences});
  overlay.setIgnoreMouseEvents(true);overlay.setAlwaysOnTop(true,'screen-saver');
  if(process.platform==='darwin')overlay.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  qrWindow=new BrowserWindow({...qrBounds(),frame:false,type:process.platform==='darwin'?'panel':'normal',backgroundColor:'#ffffff',hasShadow:true,alwaysOnTop:true,skipTaskbar:true,focusable:false,resizable:true,minimizable:false,maximizable:false,fullscreenable:false,show:false,title:'SeminarComment 参加QR',webPreferences});
  qrWindow.setAlwaysOnTop(true,'screen-saver');
  if(process.platform==='darwin')qrWindow.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
  qrWindow.on('move',rememberQrBounds);qrWindow.on('resize',rememberQrBounds);
  control=new BrowserWindow({width:620,height:820,minWidth:470,minHeight:600,show:false,title:`SeminarComment ${app.getVersion()}`,autoHideMenuBar:true,webPreferences});
  for(const win of [overlay,control,qrWindow]){win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.session.setPermissionRequestHandler((_,__,callback)=>callback(false));}
  control.on('close',e=>{if(!quitting){e.preventDefault();control.hide();}});
  overlay.on('close',e=>{if(!quitting)e.preventDefault();});
  qrWindow.on('close',e=>{if(!quitting){e.preventDefault();qrVisible=false;broadcast();}});
  overlay.webContents.on('render-process-gone',()=>{status='表示処理が停止しました。再読み込みします（未表示コメントは失われます）。';overlay.reload();broadcast();});
  ipcMain.handle('state',event=>{if(![control.webContents.id,overlay.webContents.id,qrWindow.webContents.id].includes(event.sender.id))throw new Error('許可されていません。');return state();});
  ipcMain.handle('action',async(event,action,value)=>{
    const allowed=event.sender.id===control.webContents.id||event.sender.id===overlay.webContents.id&&['region','cancelEdit'].includes(action)||event.sender.id===qrWindow.webContents.id&&['qrCollapse','qrSize','qrHide'].includes(action);if(!allowed)return {ok:false,error:'許可されていません。'};
    try{await perform(action,value);return {ok:true};}catch(error){report(error);return {ok:false,error:error.message};}
  });
  await overlay.loadFile(path.join(dir,'overlay.html'));await control.loadFile(path.join(dir,'control.html'));await qrWindow.loadFile(path.join(dir,'qr.html'));
  const icon=nativeImage.createFromPath(path.join(dir,'tray.png'));if(process.platform==='darwin')icon.setTemplateImage(true);
  tray=new Tray(icon);tray.setToolTip('SeminarComment');tray.on('click',showControl);updateMenu();
  for(const [key,fn] of [['C',()=>perform('visible')],['Q',toggleQr],['R',()=>edit(!editing)],['T',()=>perform('test')]])if(!globalShortcut.register(`CommandOrControl+Shift+${key}`,fn)){shortcutErrors.push(key);status=`ショートカット ${key} を登録できません。ほかのアプリとの重複を確認してください。`;}
  for(const event of ['display-added','display-removed','display-metrics-changed'])screen.on(event,()=>position());
  setInterval(()=>{if(session&&Date.now()>=session.expiresAt)expireLocal();},1000).unref();
  position();if(!process.argv.includes('--poc'))showControl();else setInterval(()=>overlay.webContents.send('comment','PowerPoint 重ね表示テスト 🐭'),1200);
  if(selfTest){let testExit=0;try{const {run}=await import('./self-test.mjs');await run({perform,state,overlay,qrWindow,control,breakConnection:()=>ws?.terminate(),runtimeUrl,settingsPath});}catch(error){console.error(error);testExit=1;}finally{quitting=true;disconnect();await stopBackend();app.exit(testExit);}return;}
  if(smoke){
    const initial=await overlay.webContents.executeJavaScript(`({transparent:getComputedStyle(document.body).backgroundColor,bridge:typeof window.seminar.action})`);
    overlay.webContents.send('comment','コメント表示テストです 🐭');
    setTimeout(async()=>{const comments=await overlay.webContents.executeJavaScript(`document.querySelectorAll('.comment').length`);console.log(JSON.stringify({smoke:true,alwaysOnTop:overlay.isAlwaysOnTop(),bounds:overlay.getBounds(),displays:displayList(),initial,renderedComments:comments,testShortcutRegistered:globalShortcut.isRegistered('CommandOrControl+Shift+T')}));quitting=true;app.quit();},1800);
  }
}).catch(error=>{dialog.showErrorBox(t('起動できません'),t(error.message));quitting=true;app.quit();});
app.on('before-quit',e=>{if(!quitting){e.preventDefault();quit().catch(report);}});
app.on('will-quit',()=>globalShortcut.unregisterAll());
app.on('activate',()=>control&&showControl());
}
