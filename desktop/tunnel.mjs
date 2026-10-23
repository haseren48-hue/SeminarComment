import {spawn} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
export async function startTunnel({binary,url,directory,onExit=()=>{}}){
 await mkdir(directory,{recursive:true});const config=path.join(directory,'config.yml');await writeFile(config,'{}\n');
 const child=spawn(binary,['tunnel','--config',config,'--no-autoupdate','--protocol','http2','--metrics','127.0.0.1:0','--url',url],{cwd:directory,stdio:['ignore','pipe','pipe'],windowsHide:true});
 let stopped=false,ready=false,publicUrl,buffer='';
 const stop=()=>{stopped=true;child.kill();};
 const result=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{stop();reject(new Error('スマホ参加用の接続を準備できませんでした。ネットワークを確認するか「このPC内で確認」を選んでください。'));},45000);
  const consume=chunk=>{
   buffer=(buffer+chunk.toString()).slice(-16000);const match=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match)publicUrl=match[0];
   if(publicUrl&&buffer.includes('Registered tunnel connection')&&!ready){ready=true;clearTimeout(timer);resolve({url:publicUrl,stop,child});}
  };
  child.stdout.on('data',consume);child.stderr.on('data',consume);
  child.on('error',()=>{clearTimeout(timer);reject(new Error('スマホ接続用プログラムを起動できません。配布ファイルを確認してください。'));});
  child.on('exit',()=>{clearTimeout(timer);if(!ready)reject(new Error('スマホ参加用の接続が終了しました。この回線でCloudflare Tunnelを利用できるか確認してください。'));else if(!stopped)onExit();});
 });
 return result;
}

// Keep TLS hostname validation; resolve only the generated tunnel via HTTPS DNS.
export async function requestTunnel(url,{method='GET',headers={},body}={}){
 const {request}=await import('node:https');const parsed=new URL(url);
 if(parsed.protocol!=='https:'||!/^[-a-z0-9]+\.trycloudflare\.com$/.test(parsed.hostname))throw new Error('Invalid tunnel host');
 const dns=await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(parsed.hostname)}&type=A`,{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(10000)});
 if(!dns.ok)throw new Error('DNS lookup failed');const answer=await dns.json();const address=answer.Answer?.find(record=>record.type===1)?.data;if(!address)throw new Error('Tunnel DNS is not ready');
 return new Promise((resolve,reject)=>{
  const req=request(parsed,{method,headers,lookup:(host,options,callback)=>{if(host!==parsed.hostname)return callback(new Error('Unexpected lookup'));if(options?.all)callback(null,[{address,family:4}]);else callback(null,address,4);}},res=>{
   let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>65536){req.destroy(new Error('Response too large'));return;}chunks.push(chunk);});res.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');resolve({status:res.statusCode,ok:res.statusCode>=200&&res.statusCode<300,text:async()=>text,json:async()=>JSON.parse(text)});});res.on('error',reject);
  });req.setTimeout(10000,()=>req.destroy(new Error('Tunnel request timed out')));req.on('error',reject);if(body)req.write(body);req.end();
 });
}
