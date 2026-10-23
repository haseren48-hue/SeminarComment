import {localize,translate} from '../shared/i18n.mjs';
const $=id=>document.getElementById(id);let initial=true,language='ja';
const t=text=>translate(text,language);
async function action(name,value){const result=await window.seminar.action(name,value);if(!result.ok)$('status').textContent=t(result.error);return result;}
function apply(s){
  language=s.settings.language;localize(document,language);$('language').value=language;
  document.title=`SeminarComment ${s.version}`;$('version').textContent=s.version;$('mode').value=s.mode;$('mode').disabled=!!s.session||s.requestBusy;
  $('modeNotice').textContent=s.mode==='local'?'このPCのブラウザーから投稿できます。スマホ参加は「スマホから参加」を選んでください。':s.mode==='quick'?'Cloudflare経由の一時URLを発行します。URLを知る人が参加でき、アプリ終了で閉じます。試験用のため稼働保証はありません。':'下の接続設定でHTTPS URLと作成キーを設定してください。';
  $('testCount').textContent=`テスト送信 ${s.testCount}回`;$('shortcutErrors').textContent=s.shortcutErrors.length?`登録できなかったキー：${s.shortcutErrors.join(', ')}。別のアプリとの重複を確認してください。`:'';$('externalConfig').hidden=s.mode!=='external';$('qr').disabled=s.mode==='local';
  $('status').textContent=s.status;$('sessionForm').hidden=!!s.session;$('session').hidden=!s.session;
  if(s.session){$('sessionName').textContent=s.session.name;$('roomCode').textContent=s.session.roomCode;$('joinUrl').textContent=s.session.joinUrl;$('expiry').textContent=`有効期限 ${new Date(s.session.expiresAt).toLocaleString(language)}`;}
  $('visible').textContent=`コメント表示 ${s.visible?'ON':'OFF'}`;$('qr').textContent=s.qrVisible?'QRを閉じる':'QRを表示';$('edit').textContent=s.editing?'領域編集をキャンセル':'表示領域を編集';
  $('qrTools').hidden=!s.session||s.mode==='local';$('qrFold').disabled=!s.qrVisible;$('qrFold').textContent=s.settings.qr.collapsed?'QRを展開':'QRをタブにしまう';
  $('display').replaceChildren(...s.displays.map(d=>{const option=document.createElement('option');option.value=d.id;option.textContent=`${d.label} (${d.bounds.width} × ${d.bounds.height})`;return option;}));
  if(s.settings.displayId!==null)$('display').value=s.settings.displayId;
  $('fontSize').value=s.settings.fontSize;$('speed').value=s.settings.speed;
  $('start').disabled=s.requestBusy;$('end').disabled=s.requestBusy;$('save').disabled=s.requestBusy||!!s.session;
  if(initial){$('serverUrl').value=s.config.serverUrl;initial=false;}$('presenterKey').placeholder=s.config.keyConfigured?'設定済み（空欄なら変更なし）':'未設定';
  for(const id of ['status','modeNotice','testCount','shortcutErrors','expiry','visible','qr','edit','qrFold'])$(id).textContent=t($(id).textContent);
  $('presenterKey').placeholder=t($('presenterKey').placeholder);
  const mod=navigator.userAgent.includes('Mac')?'⌘':'Ctrl';$('shortcuts').textContent=t(`${mod}+Shift+C 表示切替 / ${mod}+Shift+Q QR / ${mod}+Shift+R 領域編集 / ${mod}+Shift+T テスト`);
}
window.seminar.onState(apply);window.seminar.state().then(apply);
$('sessionForm').onsubmit=e=>{e.preventDefault();action('start',$('name').value);};
$('configForm').onsubmit=async e=>{e.preventDefault();const r=await action('configure',{serverUrl:$('serverUrl').value,presenterKey:$('presenterKey').value});if(r.ok)$('presenterKey').value='';};
for(const id of ['visible','qr','edit','test','clear','end','openParticipant','testDelayed'])$(id).onclick=()=>action(id);
for(const id of ['display','fontSize','speed'])$(id).onchange=()=>action(id,id==='speed'?$(id).value:Number($(id).value));

$('mode').onchange=()=>action('mode',$('mode').value);
$('qrFold').onclick=async()=>{const s=await window.seminar.state();action('qrCollapse',!s.settings.qr.collapsed);};
$('qrReset').onclick=()=>action('qrReset');
$('language').onchange=()=>action('language',$('language').value);
