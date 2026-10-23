import {count,limit,validateComment} from '/shared/protocol.mjs';
import {languageFor,localize,translate} from '/shared/i18n.mjs';
const $=id=>document.getElementById(id);let session,socket,retry,toastTimer,ended=false,composing=false,busy=false,expiration;
let savedLanguage;try{savedLanguage=localStorage.getItem('seminar-language');}catch{}
let language=languageFor(navigator.language,savedLanguage),statusText='',sentComment='';
const t=text=>translate(text,language);
function renderLanguage(){
  localize(document,language);$('language').value=language;$('status').textContent=t(statusText);
  if(sentComment)$('sentText').textContent=t('コメント：')+sentComment;
  if(!session&&ended)$('sessionName').textContent=t('セッション終了');
  document.title=`${session?.name||'SeminarComment'} — ${t('匿名コメント')}`;
}
$('language').onchange=()=>{language=$('language').value;try{localStorage.setItem('seminar-language',language);}catch{}renderLanguage();};
renderLanguage();
const capable=typeof Intl.Segmenter==='function';
async function api(route,options={}){const response=await fetch(route,{...options,headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(10000)});const data=await response.json();if(!response.ok){const e=new Error(data.error);e.status=response.status;throw e;}return data;}
function setStatus(text){statusText=text;$('status').textContent=t(text);}
function finish(){ended=true;clearTimeout(retry);clearTimeout(expiration);socket?.close();$('comment').disabled=true;$('send').disabled=true;setStatus('このセッションは終了しました。');}
function trimInput(){if(composing)return;$('comment').value=limit($('comment').value.replace(/[\r\n\u2028\u2029]/gu,''));$('count').textContent=`${count($('comment').value)} / 30`;}
function connect(){
  if(ended)return;
  const ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/live`);socket=ws;
  ws.onopen=()=>ws.send(JSON.stringify({role:'participant',id:session.id}));
  ws.onmessage=e=>{let msg;try{msg=JSON.parse(e.data);}catch{return;}if(!msg||typeof msg!=='object')return;if(msg.type==='ended')finish();else if(msg.type==='ready')setStatus('');};
  ws.onclose=e=>{if(ended)return;if(e.code===4001){finish();return;}setStatus('接続を確認しています。送信は引き続き試せます。');retry=setTimeout(async()=>{await refresh();if(!ended)connect();},3000+Math.random()*1000);};
  ws.onerror=()=>{};
}
async function refresh(){if(!session||ended)return;try{await api(`/api/sessions/${session.id}`);}catch(e){if(e.status===410)finish();}}
async function enter(info){session=info;ended=false;$('join').hidden=true;$('posting').hidden=false;$('sessionName').textContent=info.name;renderLanguage();history.replaceState(null,'',`/join/${info.id}`);expiration=setTimeout(finish,Math.max(0,info.expiresAt-Date.now()));connect();}
$('joinForm').onsubmit=async e=>{e.preventDefault();$('joinButton').disabled=true;setStatus('');try{await enter(await api(`/api/rooms/${encodeURIComponent($('room').value.trim().toUpperCase())}`));}catch(error){setStatus(error.message||'通信できません。再試行してください。');}finally{$('joinButton').disabled=false;}};
$('comment').addEventListener('compositionstart',()=>composing=true);
$('comment').addEventListener('compositionend',()=>{composing=false;trimInput();});
$('comment').addEventListener('input',trimInput);
$('commentForm').onsubmit=async e=>{
  e.preventDefault();if(ended||busy||composing)return;let text;try{text=validateComment($('comment').value);}catch(error){setStatus(error.message);return;}
  busy=true;$('send').disabled=true;$('comment').disabled=true;setStatus('');
  try{await api(`/api/sessions/${session.id}/comments`,{method:'POST',body:JSON.stringify({text})});$('comment').value='';trimInput();sentComment=text;$('sentText').textContent=t('コメント：')+text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
  catch(error){if(error.status===410)finish();else setStatus(error.name==='TimeoutError'?'送信結果を確認できませんでした。画面に流れていなければ再送してください。':error.message||'通信できません。再試行してください。');}
  finally{busy=false;$('send').disabled=ended;$('comment').disabled=ended;if(!ended)$('comment').focus();}
};
if(!capable){setStatus('このブラウザでは絵文字の文字数を正確に数えられません。OSとブラウザを更新してください。');$('joinButton').disabled=true;}
else{const match=location.pathname.match(/^\/join\/([A-Za-z0-9_-]{32})$/);if(match)api(`/api/sessions/${match[1]}`).then(enter).catch(error=>{if(error.status===410){$('join').hidden=true;$('posting').hidden=false;finish();renderLanguage();}else setStatus('通信できません。ページを再読み込みしてください。');});}
window.addEventListener('online',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});setInterval(refresh,30000);
