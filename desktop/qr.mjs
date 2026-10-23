import {localize,translate} from '../shared/i18n.mjs';
const $=id=>document.getElementById(id);
function apply(s){
  localize(document,s.settings.language);document.title=`SeminarComment — ${translate('参加QR',s.settings.language)}`;
  $('tab').hidden=!s.settings.qr.collapsed;
  $('card').hidden=s.settings.qr.collapsed;
  $('name').textContent=s.session?.name||'';
  $('room').textContent=s.session?.roomCode||'';
  $('url').textContent=s.session?.joinUrl||'';
  if($('code').getAttribute('src')!==s.qrImage)$('code').src=s.qrImage||'';
}
window.seminar.onState(apply);window.seminar.state().then(apply);
for(const id of ['fold','expand'])$(id).onclick=()=>window.seminar.action('qrCollapse',id==='fold');
$('hide').onclick=()=>window.seminar.action('qrHide');
$('smaller').onclick=()=>window.seminar.action('qrSize',.85);
$('larger').onclick=()=>window.seminar.action('qrSize',1.15);
