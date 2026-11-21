/* No external services. Test bounded/resumable browser media transfers. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('media-uploader.js','utf8');
class FakeFile{
  constructor(name,type,size){
    this.name=name;this.type=type;this.size=size;
  }
  slice(start,end){return {byteLength:end-start,size:end-start,offset:start};}
}
function harness(){
  let savedOffset=0;
  let token='session-token';
  const actions=[];
  const progress=[];
  const page={FMVUpload:null};
  const context={window:page,File:FakeFile,AbortSignal,DOMException,setTimeout,Promise,
    FMV:{apiBase:'https://backend.firstmilkventure.com',
      get token(){return token;}},
    fetch:async(url,options={})=>{
      const path=new URL(url).pathname;
      actions.push({path,method:options.method,headers:options.headers,
                    bytes:options.body?.byteLength||0,body:options.body});
      assert.equal(options.credentials,'omit');
      assert.equal(options.headers.Authorization,'Bearer session-token');
      let data;
      if(path.endsWith('/uploads')&&options.method==='POST')
        data={id:'UPLOAD-1234567890',chunk_size:2000000,offset:0,total_size:2100001};
      else if(path.endsWith('/chunk')){
        assert.equal(options.headers['Content-Type'],'application/octet-stream');
        assert.ok(options.body.byteLength<=2000000);
        savedOffset+=options.body.byteLength;
        data={offset:savedOffset,total_size:2100001};
      }else if(path.endsWith('/complete'))data={id:'MEDIA-1234567890',size:2100001};
      else if(options.method==='GET')data={id:'UPLOAD-1234567890',
        offset:savedOffset,chunk_size:2000000,total_size:2100001};
      else data={};
      return {ok:true,json:async()=>data};
    }
  };
  vm.runInNewContext(source,context);
  return {upload:page.FMVUpload,actions,progress,setToken:next=>token=next};
}

test('Supports up to 50 MB media with strong client input validation',()=>{
  const {upload}=harness();
  upload.validate(new FakeFile('large-video.mp4','video/mp4',50000000));
  assert.throws(()=>upload.validate(new FakeFile('too-large.mp4','video/mp4',50000001)),/50 MB/);
  assert.throws(()=>upload.validate(new FakeFile('risky.html','text/html',100)),/JPG/);
  assert.throws(()=>upload.validate(new FakeFile('fake.mp4','image/png',100)),/JPG|not supported/);
  assert.throws(()=>upload.validate(new FakeFile('empty.gif','image/gif',0)),/Choose/);
});

test('Uploads a video in 2MB chunks without base64 and publishes only after completion',async()=>{
  const {upload,actions}=harness();
  const values=[];
  const done=await upload.upload(new FakeFile('ad.mp4','video/mp4',2100001),{
    onProgress:(sent,total)=>values.push([sent,total])
  });
  assert.equal(done.id,'MEDIA-1234567890');
  const parts=actions.filter(a=>a.path.endsWith('/chunk'));
  assert.deepEqual(parts.map(a=>a.bytes),[2000000,100001]);
  assert.deepEqual(values[values.length-1],[2100001,2100001]);
  assert.equal(actions[0].path,'/admin/content-media/uploads');
  assert.equal(actions[actions.length-1].path,
    '/admin/content-media/uploads/UPLOAD-1234567890/complete');
  assert.ok(!actions.some(a=>typeof a.body==='string'&&a.body.includes('data_base64')));
});

test('Both marketing and website editors use the same resumable upload API',()=>{
  const ads=fs.readFileSync('experience.js','utf8');
  const website=fs.readFileSync('studio.js','utf8');
  const html=fs.readFileSync('index.html','utf8');
  assert.match(ads,/FMVUpload\.upload/);
  assert.match(website,/FMVUpload\.upload/);
  assert.match(html,/media-uploader\.js/);
  assert.match(ads,/50 MB/);
  assert.match(website,/50 MB/);
  assert.doesNotMatch(ads,/FMV\.readFile\('fmv-campaign-file'\)/);
  assert.doesNotMatch(website,/FMV\.readFile\('fmv-site-media'\)/);
});


test('Admins can inspect storage usage and remove only unused media assets',()=>{
  const admin=fs.readFileSync('experience.js','utf8');
  assert.match(admin,/\/admin\/content-media\/library/);
  assert.match(admin,/data-admin-action="delete-unused-media"/);
  assert.match(admin,/if\(!asset\|\|asset\.in_use\)return/);
  assert.match(admin,/mediaLibrary\.map/);
  assert.match(admin,/used_bytes/);
});

test('Existing media can be attached without uploading a duplicate, and deleted campaigns recover',()=>{
  const ads=fs.readFileSync('experience.js','utf8');
  assert.match(ads,/data-admin-action="use-library-media"/);
  assert.match(ads,/function chooseLibraryMedia\(id\)/);
  assert.match(ads,/mediaId=asset\.id/);
  assert.match(ads,/const existing=\(latest\.campaigns\|\|\[\]\)\.find/);
  assert.match(ads,/if\(!existing\)/);
  assert.match(ads,/editing=null/);
  assert.match(ads,/\$\('fmv-campaign-file'\)\.value='';\s*mediaPreview/);
  assert.match(ads,/await refreshCampaigns\(\);await loadMediaLibrary\(\)/);
});
