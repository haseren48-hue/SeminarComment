import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {languageFor,translate} from '../shared/i18n.mjs';
import {validateComment} from '../shared/protocol.mjs';

test('language defaults follow the device; explicit preferences take priority',()=>{
  assert.equal(languageFor('ja-JP'),'ja');assert.equal(languageFor('en-US'),'en');assert.equal(languageFor('fr-FR'),'en');
  assert.equal(languageFor('ja-JP','en'),'en');assert.equal(languageFor('en-US','ja'),'ja');assert.equal(languageFor('ja-JP','invalid'),'ja');
});
test('all annotated static labels and accessible attributes have English translations',()=>{
  let translated=0;
  for(const file of ['desktop/control.html','desktop/overlay.html','desktop/qr.html','web/index.html']){
    const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
    for(const match of source.matchAll(/data-i18n(?:-(?:placeholder|title|aria-label|alt))?="([^"]+)"/g)){
      const text=match[1].replaceAll('&amp;','&').replaceAll('&quot;','"');
      assert.notEqual(translate(text,'en'),text,`${file}: ${text}`);assert.equal(translate(text,'ja'),text);translated++;
    }
  }
  assert.ok(translated>=60);
});
test('validation and server errors are readable in English without changing validation rules',()=>{
  for(const value of ['', 'x'.repeat(31),'a\nb']){
    try{validateComment(value);assert.fail('Expected rejection');}catch(error){assert.match(translate(error.message,'en'),/^[A-Za-z]/);}
  }
  assert.equal(translate('Room Codeが見つからないか、セッションが終了しています。','en'),'Room code not found, or the session has ended.');
  assert.equal(translate('このセッションは終了しました。','en'),'This session has ended.');
  assert.equal(validateComment('Hello 🐭'),'Hello 🐭');
});
test('dynamic presenter messages retain their numbers and shortcut keys',()=>{
  assert.equal(translate('テストコメントを送信しました（12回）','en'),'Test comment sent (12)');
  assert.equal(translate('テスト送信 12回','en'),'Test comments sent: 12');
  assert.equal(translate('コメント表示 OFF','en'),'Comments OFF');
  assert.equal(translate('⌘+Shift+C 表示切替 / ⌘+Shift+Q QR / ⌘+Shift+R 領域編集 / ⌘+Shift+T テスト','en'),'⌘+Shift+C Comments / ⌘+Shift+Q QR / ⌘+Shift+R Edit area / ⌘+Shift+T Test');
});
