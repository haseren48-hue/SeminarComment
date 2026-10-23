import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createService} from '../server/app.mjs';
const require=createRequire(import.meta.url),key=randomBytes(24).toString('base64url'),url='http://127.0.0.1:8787';
const service=createService({presenterKey:key,publicUrl:url});
service.server.on('error',()=>{console.error('ポート8787を使用できません。起動済みのサーバーを終了してください。');process.exit(1);});
service.server.listen(8787,'127.0.0.1',()=>{
  const child=spawn(require('electron'),['.'],{stdio:'inherit',env:{...process.env,SEMINAR_SERVER_URL:url,SEMINAR_PRESENTER_KEY:key}});
  console.log('ローカル試験用です。参加ページ http://127.0.0.1:8787 を同じPCで開いてください。');
  child.on('exit',async code=>{await service.close();process.exit(code||0);});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
});
