/* Run with Node's test runner and jsdom 27.2.0 on NODE_PATH. No live services. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const directory=path.resolve(__dirname,'..');
const role=fs.readFileSync(path.join(directory,'index.html'),'utf8').match(/data-portal="([^"]+)"/)[1];
const source=fs.readFileSync(path.join(directory,'portal-core.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

async function harness(t){
  const dom=new JSDOM('<!doctype html><html class="fmv-locked"><body data-portal="'+role+'"><div id="sink"></div></body></html>',
    {url:'https://portal.example.test/',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const w=dom.window,calls=[],timers=new Map();let timerId=0,online=true;
  const user={id:'qa-user',email:'qa@example.com',full_name:'QA User',portal:role,role:role==='admin'?'super_admin':role,approved:true};
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  let responder=async url=>json(url.endsWith('/auth/session')?{user,revision:1}:url.endsWith('/sync')?{revision:1}:{});
  w.Headers=Headers;w.AbortSignal=AbortSignal;w.Blob=Blob;
  w.fetch=(url,options={})=>{calls.push({url,options});return responder(String(url),options);};
  w.FMV_CONFIG={apiBase:'https://api.example.test'};
  w.sessionStorage.setItem('fmv_session_'+role,'qa-session');
  w.setTimeout=(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;};
  w.clearTimeout=id=>timers.delete(id);
  Object.defineProperty(w.navigator,'onLine',{get:()=>online,configurable:true});
  w.eval(source);
  await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  async function run(delay){const found=[...timers].findLast(([,item])=>item.delay===delay);assert.ok(found,'Expected timer '+delay);timers.delete(found[0]);await found[1].fn();await settle();}
  await run(0);assert.equal(w.FMV.user.id,'qa-user');
  return {w,calls,timers,json,run,setOnline:value=>online=value,setResponder:fn=>responder=fn};
}

test('unchanged rendering keeps focus, local input and open details; changed data renders',async t=>{
  const {w}=await harness(t),html='<details><summary>Details</summary><input value="saved"></details>';
  w.FMV.setHTML('sink',html);const input=w.document.querySelector('#sink input'),details=input.parentElement;
  input.value='in progress';input.focus();details.open=true;
  w.FMV.setHTML('sink',html);
  assert.equal(w.document.querySelector('#sink input'),input);assert.equal(input.value,'in progress');
  assert.equal(w.document.activeElement,input);assert.equal(details.open,true);
  w.FMV.setHTML('sink','<p>Updated by the server</p>');assert.equal(w.document.querySelector('#sink').textContent,'Updated by the server');
});

test('a replaced target is rendered and explicit forced renders are available',async t=>{
  const {w}=await harness(t);w.FMV.setHTML('sink','<input value="saved">');
  const sink=w.document.getElementById('sink'),input=sink.firstChild;
  w.FMV.setHTML('sink','<input value="saved">',true);assert.notEqual(sink.firstChild,input);
  const replacement=w.document.createElement('div');replacement.id='sink';sink.replaceWith(replacement);
  w.FMV.setHTML('sink','<input value="saved">');assert.equal(replacement.firstChild.value,'saved');
});

test('only identical concurrent reads coalesce, including normalized headers',async t=>{
  const {w,calls,json,setResponder}=await harness(t);let finish;
  setResponder(()=>new Promise(resolve=>finish=resolve));
  const one=w.FMV.request('/items',{headers:{'X-B':'b','X-A':'a'}}),two=w.FMV.request('/items',{headers:{'x-a':'a','x-b':'b'}});
  assert.equal(one,two);assert.equal(calls.filter(c=>c.url.endsWith('/items')).length,1);
  finish(json({ok:true}));await one;
  setResponder(async(url,options)=>json({mode:new Headers(options.headers).get('X-Mode')}));
  const [a,b]=await Promise.all([w.FMV.request('/items',{headers:{'X-Mode':'a'}}),w.FMV.request('/items',{headers:{'X-Mode':'b'}})]);
  assert.equal(a.mode,'a');assert.equal(b.mode,'b');
});

test('a committed mutation starts a fresh read instead of reusing older in-flight data',async t=>{
  const {w,calls,json,setResponder}=await harness(t);let release,version=0;
  setResponder(async(url,options)=>{
    if(options.method==='PATCH'){version++;return json({saved:true});}
    if(version===0)return new Promise(resolve=>release=resolve);
    return json({version});
  });
  const old=w.FMV.request('/items');await w.FMV.request('/users/me',{method:'PATCH',body:{full_name:'Updated'}});
  assert.equal((await w.FMV.request('/items')).version,1);
  assert.equal(calls.filter(c=>c.url.endsWith('/items')).length,2);
  release(json({version:0}));await old;
});

test('responses from a replaced session are rejected and external fetches get no bearer token',async t=>{
  const {w,calls,json,setResponder}=await harness(t);let release;
  setResponder(()=>new Promise(resolve=>release=resolve));const old=w.FMV.request('/items');
  w.sessionStorage.setItem('fmv_session_'+role,'replacement-session');release(json({private:'old user data'}));
  await assert.rejects(old,error=>error.stale===true);
  setResponder(async()=>json({}));await w.fetch('https://outside.example.test/pixel');
  assert.equal(new Headers(calls.at(-1).options.headers).has('Authorization'),false);
});

test('polling pauses offline, resumes immediately, backs off on errors and locks revoked sessions',async t=>{
  const {w,timers,run,setOnline,setResponder,json}=await harness(t);
  assert.ok([...timers.values()].some(item=>item.delay===1000));
  setOnline(false);w.dispatchEvent(new w.Event('offline'));assert.equal(timers.size,0);
  setOnline(true);w.dispatchEvent(new w.Event('online'));
  setResponder(async()=>{throw new Error('offline');});
  await run(0);for(const delay of [2000,4000,8000,16000])await run(delay);
  assert.ok([...timers.values()].some(item=>item.delay===30000));
  setResponder(async()=>json({detail:'Session expired'},401));await run(30000);
  assert.equal(w.FMV.user,null);assert.equal(w.FMV.token,'');assert.ok(w.document.documentElement.classList.contains('fmv-locked'));
});
