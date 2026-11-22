/* Build-time only: copy each existing portal unchanged into Capacitor www.
   Exclude test tools, VCS and developer files; never package secrets. */
import {cp,rm,mkdir,writeFile,readFile,stat,readdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('..');
const out=path.resolve('www');
const blocked=new Set(['.git','.github','node_modules','android-app','tests','website','__pycache__','.venv','venv','coverage','dist','.next']);
const allowed=new Set(['.html','.js','.css','.webmanifest','.json','.svg','.png','.webp','.avif','.jpg','.jpeg','.gif','.ico','.mp4','.webm','.woff','.woff2','.ttf','.otf']);
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const entry of await readdir(root,{withFileTypes:true})){
  if(blocked.has(entry.name)||entry.name.startsWith('.'))continue;
  await cp(path.join(root,entry.name),path.join(out,entry.name),{recursive:true,filter:async src=>{
 const rel=path.relative(root,src).replaceAll('\\','/');
 if(!rel)return true;
 const seg=rel.split('/');
 if(seg.some(x=>blocked.has(x)||x.startsWith('.')))return false;
 const info=await stat(src);
 if(info.isDirectory())return true;
 return allowed.has(path.extname(src).toLowerCase());
}});
}
const index=await readFile(path.join(out,'index.html'),'utf8');
if(!index.includes('immersive-3d.js')||!index.includes('immersive-3d.css'))throw new Error('The 360 degree scene assets must be present before packaging.');
await writeFile(path.join(out,'config.js'),'/* Android-only public API configuration. No secrets here. */\nwindow.FMV_CONFIG=Object.freeze({apiBase:"https://backend.firstmilkventure.com",country:"India",state:"Kerala",currency:"INR"});\n');
console.log('Staged portal assets for Android. Existing web portal source files were not changed.');
