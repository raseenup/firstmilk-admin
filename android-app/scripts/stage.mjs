/* Stage only public portal runtime files for the web host or the Android app. */
import {copyFile, lstat, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const androidDir=fileURLToPath(new URL('../',import.meta.url));
const root=path.dirname(path.resolve(androidDir));
const web=process.argv.includes('--web');
const out=web?path.join(root,'public-portal'):path.join(androidDir,'www');
const assetTypes=new Set(['.svg','.png','.webp','.avif','.jpg','.jpeg','.gif','.ico',
  '.mp4','.webm','.woff','.woff2','.ttf','.otf','.css','.glb','.gltf']);

async function copyPublicDirectory(source,dest){
  const info=await lstat(source);
  if(!info.isDirectory())throw new Error('Expected ordinary public asset directory: '+source);
  await mkdir(dest,{recursive:true});
  for(const entry of await readdir(source,{withFileTypes:true})){
    if(entry.name.startsWith('.'))continue;
    const from=path.join(source,entry.name),to=path.join(dest,entry.name);
    if(entry.isDirectory())await copyPublicDirectory(from,to);
    else if(entry.isFile() && assetTypes.has(path.extname(entry.name).toLowerCase()))await copyFile(from,to);
  }
}

const indexPath=path.join(root,'index.html');
if(!(await lstat(indexPath)).isFile())throw new Error('Missing regular portal entry point.');
const html=await readFile(indexPath,'utf8');
const entries=new Set(['index.html','manifest.webmanifest']);
for(const match of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)=["'](?:\.\/)?([a-zA-Z0-9][\w.-]*\.(?:js|css))(?:[?#][^"']*)?["']/gi)){
  entries.add(match[1]);
}
if(!entries.has('immersive-3d.js') || !entries.has('immersive-3d.css'))throw new Error('Missing 360-degree scene entry points.');
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const entry of entries){
  const from=path.join(root,entry);
  if(!(await lstat(from)).isFile())throw new Error('Missing regular portal asset: '+entry);
  await copyFile(from,path.join(out,entry));
}
for(const dir of ['assets','styles'])await copyPublicDirectory(path.join(root,dir),path.join(out,dir));
if(!web){
  await writeFile(path.join(out,'config.js'),'window.FMV_CONFIG=Object.freeze({apiBase:"https://backend.firstmilkventure.com",country:"India",state:"Kerala",currency:"INR"});\n');
}
console.log('Staged public portal runtime files.');
