import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const version='2026.10.3';
const assets={
 'mac-arm64':['cloudflared-darwin-arm64.tgz','1165d14b6f6360a3b8c283d7d1100024d6ec7cd9bc9e32519e96150645f3ec55'],
 'mac-x64':['cloudflared-darwin-amd64.tgz','81b7b85f2376815c4f59b1aa323887b62e16ce8b67555c2e1577dc23f2a82000'],
 'win-x64':['cloudflared-windows-amd64.exe','76b2805253d0d6ffacb092a7acfbee99e7af6917835c0c5410e23f3ef5052da2']
};
await Promise.all(Object.entries(assets).filter(([key])=>!process.argv[2]||key.startsWith(process.argv[2])).map(async([target,[name,digest]])=>{
 const folder=path.resolve('resources',target);await mkdir(folder,{recursive:true});
 await writeFile(path.join(folder,'LICENSE'),await readFile('docs/cloudflared-LICENSE.txt'));
 const archive=path.join(folder,name),binary=path.join(folder,target.startsWith('win')?'cloudflared.exe':'cloudflared');
 let data;try{data=await readFile(archive);}catch{}
 if(!data||createHash('sha256').update(data).digest('hex')!==digest){
  const response=await fetch(`https://github.com/cloudflare/cloudflared/releases/download/${version}/${name}`);if(!response.ok)throw new Error('cloudflared download failed');
  data=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(data).digest('hex')!==digest)throw new Error('cloudflared checksum mismatch');await writeFile(archive,data);
 }
 if(target.startsWith('win'))await writeFile(binary,data);else{execFileSync('tar',['-xzf',archive,'-C',folder,'cloudflared']);await chmod(binary,0o755);}
 console.log(`Verified cloudflared ${version} for ${target}`);
}));
