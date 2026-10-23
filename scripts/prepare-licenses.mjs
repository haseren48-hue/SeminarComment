import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

const root=process.cwd(),destination=path.join(root,'resources/licenses');
await fs.mkdir(destination,{recursive:true});
for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md'])await fs.copyFile(path.join(root,name),path.join(destination,name));
const require=createRequire(path.join(root,'package.json'));
const electronRoot=path.dirname(require.resolve('electron/package.json'));
for(const name of ['LICENSE','LICENSES.chromium.html'])await fs.copyFile(path.join(electronRoot,'dist',name),path.join(destination,`Electron-${name}`));
const visited=new Set();
async function visit(packageRoot){
  const pkg=JSON.parse(await fs.readFile(path.join(packageRoot,'package.json'),'utf8'));
  const identity=`${pkg.name}@${pkg.version}`;
  if(visited.has(identity))return;visited.add(identity);
  const notices=(await fs.readdir(packageRoot)).filter(name=>/^(licen[sc]e|notice|copying)([.-].*)?$/i.test(name));
  if(!notices.length)throw new Error(`Missing license notice for ${identity}`);
  const folder=path.join(destination,'npm',identity.replaceAll('/','__'));await fs.mkdir(folder,{recursive:true});
  for(const name of notices){const source=path.join(packageRoot,name);if((await fs.stat(source)).isFile())await fs.copyFile(source,path.join(folder,name));}
  await dependencies(packageRoot,pkg);
}
async function dependencies(parent,pkg){
  const resolver=createRequire(path.join(parent,'package.json'));
  for(const name of Object.keys(pkg.dependencies||{})){
    let entry;
    try{entry=resolver.resolve(`${name}/package.json`);}catch{entry=resolver.resolve(name);}
    let folder=path.dirname(entry);
    while(true){
      try{const info=JSON.parse(await fs.readFile(path.join(folder,'package.json'),'utf8'));if(info.name===name)break;}catch{}
      const next=path.dirname(folder);if(next===folder)throw new Error(`Cannot locate ${name}`);folder=next;
    }
    await visit(folder);
  }
}
await dependencies(root,JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')));
console.log(`Prepared application, Electron and ${visited.size} npm license notices.`);
