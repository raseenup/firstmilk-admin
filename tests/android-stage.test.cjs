const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

test('Android and web builds stage referenced portal code and public media only',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fmv-stage-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const app=path.join(root,'android-app'),script=path.join(app,'scripts','stage.mjs');
  for(const dir of ['android-app/scripts','assets/brand','styles','owner'])await fs.mkdir(path.join(root,dir),{recursive:true});
  await fs.copyFile(path.join(__dirname,'../android-app/scripts/stage.mjs'),script);
  const html='<link href="immersive-3d.css"><script src="config.js"></script><script defer src="immersive-3d.js?v=2"></script>';
  for(const [name,value] of Object.entries({'index.html':html,'manifest.webmanifest':'{}','config.js':'window.testWeb=true;',
      'immersive-3d.js':'','immersive-3d.css':'','assets/brand/logo.png':'image','styles/site.css':'',
      'owner/notes.html':'owner-only','credentials.json':'private fixture','draft.js':'work in progress',
      'assets/private.jks':'fixture','assets/private.json':'fixture'}))await fs.writeFile(path.join(root,name),value);
  await fs.symlink(path.join(root,'credentials.json'),path.join(root,'assets/linked.png'));
  for(const web of [false,true]){
    execFileSync(process.execPath,[script,...(web?['--web']:[])],{cwd:root});
    const out=web?path.join(root,'public-portal'):path.join(app,'www');
    assert.equal(await fs.readFile(path.join(out,'assets/brand/logo.png'),'utf8'),'image');
    assert.equal(await fs.readFile(path.join(out,'index.html'),'utf8'),html);
    assert.match(await fs.readFile(path.join(out,'config.js'),'utf8'),web?/testWeb/:/backend\.firstmilkventure\.com/);
    for(const name of ['credentials.json','owner','draft.js','assets/private.jks','assets/private.json','assets/linked.png']){
      await assert.rejects(fs.access(path.join(out,name)),{code:'ENOENT'});
    }
  }
});
