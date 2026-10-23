import http from 'node:http';
import {randomBytes, randomInt, timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {WebSocketServer, WebSocket} from 'ws';
import {validateComment} from '../shared/protocol.mjs';
const root=new URL('../',import.meta.url), alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createService({presenterKey,publicUrl,ttl=12*60*60*1000,now=Date.now}={}){
  if(typeof presenterKey!=='string'||presenterKey.length<16)throw new Error('PRESENTER_KEY must be at least 16 characters.');
  let base=new URL(publicUrl);if(!['https:','http:'].includes(base.protocol)||base.pathname!=='/'||base.search||base.hash||base.username||base.password)throw new Error('PUBLIC_URL must be an HTTP(S) origin.');
  const sessions=new Map(), codes=new Map();let creationTimes=[];
  const send=(socket,event)=>{if(socket.readyState!==WebSocket.OPEN)return;if(socket.bufferedAmount>65536){socket.terminate();return;}socket.send(JSON.stringify(event));};
  function end(s){if(!sessions.has(s.id))return;for(const client of [...s.hosts,...s.participants]){send(client,{type:'ended'});client.close(4001,'Session ended');}sessions.delete(s.id);codes.delete(s.roomCode);}
  function lookup(id){const s=sessions.get(id);if(s&&s.expiresAt<=now()){end(s);return null;}return s;}
  const info=s=>({id:s.id,name:s.name,roomCode:s.roomCode,expiresAt:s.expiresAt,joinUrl:`${base.origin}/join/${s.id}`});
  function json(res,code,data){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
  async function body(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096){const e=new Error('送信データが大きすぎます。');e.status=413;throw e;}chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks));}catch{throw new Error('送信形式が不正です。');}}
  const assets=new Map([
    ['/',['web/index.html','text/html; charset=utf-8']],['/app.mjs',['web/app.mjs','text/javascript; charset=utf-8']],['/style.css',['web/style.css','text/css; charset=utf-8']],['/shared/protocol.mjs',['shared/protocol.mjs','text/javascript; charset=utf-8']],['/shared/i18n.mjs',['shared/i18n.mjs','text/javascript; charset=utf-8']]
  ]);
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try{
      if(req.url.length>1024)return json(res,414,{error:'URLが長すぎます。'});
      const url=new URL(req.url,'http://local'), route=url.pathname;
      if(req.headers.origin&&req.headers.origin!==base.origin)return json(res,403,{error:'許可されていない接続元です。'});
      if(route==='/healthz'&&req.method==='GET')return json(res,200,{ok:true});
      if(route==='/api/sessions'&&req.method==='POST'){
        if(!same(req.headers['x-presenter-key'],presenterKey))return json(res,401,{error:'セッション作成キーを確認してください。'});
        creationTimes=creationTimes.filter(t=>now()-t<60000);if(creationTimes.length>=12)return json(res,429,{error:'セッション作成が多すぎます。1分待って再試行してください。'});
        if(sessions.size>=100)return json(res,503,{error:'サーバーのセッション数が上限です。'});
        const {name}=await body(req);if(typeof name!=='string'||!name.trim()||Array.from(name.trim()).length>100||/[\r\n\u0000-\u001f]/u.test(name))throw new Error('セッション名を1〜100文字で入力してください。');
        creationTimes.push(now());let roomCode;do{roomCode=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');}while(codes.has(roomCode));
        const s={id:randomBytes(24).toString('base64url'),hostToken:randomBytes(32).toString('base64url'),roomCode,name:name.trim(),expiresAt:now()+ttl,hosts:new Set(),participants:new Set(),posts:0};sessions.set(s.id,s);codes.set(roomCode,s.id);
        return json(res,201,{...info(s),hostToken:s.hostToken});
      }
      if(route.startsWith('/api/rooms/')&&req.method==='GET'){
        const code=route.slice('/api/rooms/'.length).toUpperCase();const s=lookup(codes.get(code));return s?json(res,200,info(s)):json(res,404,{error:'Room Codeが見つからないか、セッションが終了しています。'});
      }
      const match=route.match(/^\/api\/sessions\/([A-Za-z0-9_-]{32})(\/comments)?$/);
      if(match){
        const s=lookup(match[1]);if(!s)return json(res,410,{error:'このセッションは終了しました。'});
        if(!match[2]&&req.method==='GET')return json(res,200,info(s));
        if(!match[2]&&req.method==='DELETE'){
          if(!same(req.headers.authorization,`Bearer ${s.hostToken}`))return json(res,403,{error:'セッション終了の権限がありません。'});end(s);return json(res,200,{ok:true});
        }
        if(match[2]&&req.method==='POST'){
          const payload=await body(req),text=validateComment(payload.text);
          // A DELETE / expiry may occur while the body is being received.
          if(!lookup(s.id))return json(res,410,{error:'このセッションは終了しました。'});
          s.posts++;for(const host of s.hosts)send(host,{type:'comment',text});return json(res,200,{ok:true});
        }
      }
      if(req.method==='GET'||req.method==='HEAD'){
        const asset=assets.get(/^\/join\/[A-Za-z0-9_-]{32}$/.test(route)?'/':route);
        if(asset){const data=await readFile(new URL(asset[0],root));res.writeHead(200,{'Content-Type':asset[1],'Cache-Control':'no-store'});return res.end(req.method==='HEAD'?undefined:data);}
      }
      return json(res,404,{error:'見つかりません。'});
    }catch(error){if(!res.headersSent)json(res,error.status||400,{error:error.status||error.message?.startsWith('送信')||error.message?.startsWith('コメント')||error.message?.startsWith('改行')||error.message?.startsWith('文字')||error.message?.startsWith('セッション名')?error.message:'リクエストを処理できません。'});else res.end();}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.maxRequestsPerSocket=1000;
  const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/live'||req.headers.origin&&req.headers.origin!==base.origin||wss.clients.size>=1200){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    wss.handleUpgrade(req,socket,head,client=>wss.emit('connection',client,req));
  });
  wss.on('connection',client=>{
    let group,session;client.alive=true;
    const deadline=setTimeout(()=>client.close(4003,'Authentication timeout'),5000);deadline.unref();
    client.on('pong',()=>client.alive=true);client.on('error',()=>{});
    client.on('message',raw=>{
      if(group){client.close(4003,'Unexpected message');return;}
      let msg;try{msg=JSON.parse(raw);}catch{client.close(4003);return;}
      if(!msg||typeof msg!=='object'||Array.isArray(msg)){client.close(4003);return;}
      const s=lookup(msg.id);if(!s){send(client,{type:'ended'});client.close(4001);return;}
      if(!['host','participant'].includes(msg.role)||msg.role==='host'&&!same(msg.token,s.hostToken)){client.close(4003);return;}
      group=msg.role==='host'?s.hosts:s.participants;
      if(group.size>=(msg.role==='host'?4:200)){client.close(4008,'Capacity reached');return;}
      session=s;group.add(client);clearTimeout(deadline);send(client,{type:'ready',session:info(s)});
    });
    client.on('close',()=>{clearTimeout(deadline);group?.delete(client);session=null;});
  });
  const maintenance=setInterval(()=>{for(const s of sessions.values())if(s.expiresAt<=now())end(s);for(const c of wss.clients){if(!c.alive){c.terminate();continue;}c.alive=false;c.ping();}},1000*15);maintenance.unref();
  // Expiration notification precision is 1s, regardless of heartbeat interval.
  const expiry=setInterval(()=>{for(const s of sessions.values())if(s.expiresAt<=now())end(s);},1000);expiry.unref();
  return {server,sessions,setPublicUrl(url){const next=new URL(url);if(!['https:','http:'].includes(next.protocol)||next.pathname!=='/'||next.username||next.password||next.search||next.hash)throw new Error('Invalid public URL');base=next;},async close(){clearInterval(maintenance);clearInterval(expiry);for(const s of [...sessions.values()])end(s);for(const c of wss.clients)c.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));server.closeAllConnections();}};
}
