/* First Milk Venture • interactive, GPU-rendered 360° 3D studio. Zero external dependencies. */
(function(){
'use strict';
var portal=document.body&&document.body.dataset.portal;
if(!/^(customer|driver|admin)$/.test(portal||'')||document.getElementById('fmv3d-launch'))return;
var settings={
 customer:{name:'360° Product Studio',title:'Freshness, from every angle',desc:'Explore our dairy collection in genuine 360° 3D',choices:['Fresh Milk','Golden Ghee','Farm Curd'],icon:'🥛'},
 driver:{name:'3D Delivery Studio',title:'Every delivery in motion',desc:'A cinematic fleet experience. Operations remain unchanged.',choices:['FMV Van','Cold Chain','Route Vision'],icon:'🚚'},
 admin:{name:'3D Insights Studio',title:'A new dimension of operations',desc:'Illustrative 3D visuals — not live or financial data.',choices:['Operations','Inventory','Finance'],icon:'📊'}
}[portal];
var root=document.createElement('div');root.className='fmv3d-root';
root.innerHTML='<button id="fmv3d-launch" class="fmv3d-launch" type="button" aria-haspopup="dialog"><span aria-hidden="true">✦</span> '+settings.name+'</button>'+
'<div class="fmv3d-modal" id="fmv3d-modal" hidden><div class="fmv3d-backdrop" data-close></div><section class="fmv3d-dialog" role="dialog" aria-modal="true" aria-labelledby="fmv3d-title" tabindex="-1">'+
'<div class="fmv3d-top"><span class="fmv3d-eyebrow">FIRST MILK VENTURE  ·  IMMERSIVE STUDIO</span><button type="button" class="fmv3d-close" data-close aria-label="Close 3D scene">×</button></div>'+
'<div class="fmv3d-heading"><div><span class="fmv3d-pill">INTERACTIVE 360° · PREMIUM 3D</span><h2 id="fmv3d-title">'+settings.title+'</h2><p>'+settings.desc+'</p></div><span aria-hidden="true" class="fmv3d-icon">'+settings.icon+'</span></div>'+
'<div class="fmv3d-stage" id="fmv3d-stage"><canvas id="fmv3d-canvas" aria-label="360 degree interactive 3D model"></canvas><div class="fmv3d-watermark" aria-hidden="true"><strong>FMV</strong><small>FIRST MILK VENTURE</small></div><div class="fmv3d-hint">↔ Drag to rotate · Scroll to zoom · Arrow keys supported</div><p class="fmv3d-fallback" hidden>3D graphics are unavailable on this device. Your normal portal continues to work.</p></div>'+
'<div class="fmv3d-picks" role="group" aria-label="3D model selector">'+settings.choices.map(function(x,i){return '<button type="button" data-pick="'+i+'" aria-pressed="'+(i===0)+'">'+x+'</button>';}).join('')+'</div>'+
'<div class="fmv3d-bottom"><span class="fmv3d-live">● &nbsp; GPU graphics · No cloud rendering fees</span><div><button type="button" id="fmv3d-reset">Reset view</button><button type="button" id="fmv3d-motion">Pause rotation</button></div></div></section></div>';
document.body.appendChild(root);
var modal=root.querySelector('#fmv3d-modal'),stage=root.querySelector('#fmv3d-stage'),canvas=root.querySelector('#fmv3d-canvas');
var fallback=root.querySelector('.fmv3d-fallback'),ctx=null,prog=null,buffers=[],vertexCount=0,rAF=0,active=false;
var motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;
var yaw=.3,pitch=.23,zoom=8.8,rotation=0,pick=0,pointer=null,last=0,focusBefore=null;
var coords=[],normals=[],colors=[];
function col(s){return [1,3,5].map(function(i){return parseInt(s.slice(i,i+2),16)/255;});}
function tri(a,b,c,n,h){[a,b,c].forEach(function(v){coords.push.apply(coords,v);normals.push.apply(normals,n);colors.push.apply(colors,h);});}
function face(a,b,c,d,h){
 var u=b.map(function(v,i){return v-a[i];}),v=c.map(function(w,i){return w-a[i];});
 var n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],ln=Math.hypot.apply(Math,n)||1;n=n.map(function(q){return q/ln;});
 tri(a,b,c,n,h);tri(a,c,d,n,h);
}
function box(x,y,z,w,h,d,t){
 var p=x-w/2,q=x+w/2,l=y-h/2,r=y+h/2,f=z-d/2,b=z+d/2,c=col(t);
 face([p,l,b],[q,l,b],[q,r,b],[p,r,b],c);face([q,l,f],[p,l,f],[p,r,f],[q,r,f],c);
 face([p,l,f],[p,l,b],[p,r,b],[p,r,f],c);face([q,l,b],[q,l,f],[q,r,f],[q,r,b],c);
 face([p,r,b],[q,r,b],[q,r,f],[p,r,f],c);face([p,l,f],[q,l,f],[q,l,b],[p,l,b],c);
}
function tube(x,y,z,rb,rt,h,t,seg){
 var c=col(t),num=seg||32,a0=y-h/2,a1=y+h/2;
 for(var i=0;i<num;i++){
  var a=2*Math.PI*i/num,b=2*Math.PI*(i+1)/num;
  var v0=[x+rb*Math.cos(a),a0,z+rb*Math.sin(a)],v1=[x+rb*Math.cos(b),a0,z+rb*Math.sin(b)];
  var v2=[x+rt*Math.cos(b),a1,z+rt*Math.sin(b)],v3=[x+rt*Math.cos(a),a1,z+rt*Math.sin(a)];
  face(v0,v1,v2,v3,c);tri([x,a1,z],v3,v2,[0,1,0],c);tri([x,a0,z],v1,v0,[0,-1,0],c);
 }
}
function ring(x,y,z,r,thick,t){
 var c=col(t),seg=40,steps=8;
 function v(a,b){return [x+(r+thick*Math.cos(b))*Math.cos(a),y+thick*Math.sin(b),z+(r+thick*Math.cos(b))*Math.sin(a)];}
 for(var i=0;i<seg;i++)for(var j=0;j<steps;j++){
  var a=i*2*Math.PI/seg,b=(i+1)*2*Math.PI/seg,m=j*2*Math.PI/steps,n=(j+1)*2*Math.PI/steps;
  face(v(a,m),v(b,m),v(b,n),v(a,n),c);
 }
}
function wheel(x,y,z){
 var n=32,r=.41,c=col('#1A2424'),silver=col('#CDE9D9'),sign=z>0?1:-1;
 for(var i=0;i<n;i++){
  var a=i*2*Math.PI/n,b=(i+1)*2*Math.PI/n,A=[x+r*Math.cos(a),y+r*Math.sin(a),z],B=[x+r*Math.cos(b),y+r*Math.sin(b),z];
  tri([x,y,z],sign>0?A:B,sign>0?B:A,[0,0,sign],c);
  var rr=r*.40,z2=z+sign*.03,D=[x+rr*Math.cos(a),y+rr*Math.sin(a),z2],E=[x+rr*Math.cos(b),y+rr*Math.sin(b),z2];
  tri([x,y,z2],sign>0?D:E,sign>0?E:D,[0,0,sign],silver);
 }
}
function platform(){tube(0,-1.68,0,2.60,2.52,.28,'#244C42',56);tube(0,-1.49,0,2.48,2.48,.10,'#D9B875',56);ring(0,-1.43,0,2.41,.035,'#FFE3AB');}
function customer(){
 platform();
 if(pick===0){
  tube(0,-.16,0,.75,.70,2.36,'#EDF7EB',48);tube(0,1.20,0,.69,.28,.39,'#D9E9DE',48);
  tube(0,1.53,0,.28,.28,.32,'#F5F9E7');tube(0,1.75,0,.34,.34,.17,'#147E65');
  tube(0,-.17,0,.758,.758,1.07,'#16816B',48);tube(0,.42,0,.76,.76,.05,'#E6BD76',48);
  tube(-1.48,-.70,0,.50,.47,1.22,'#E7B553');tube(-1.48,-.02,0,.53,.53,.15,'#FFE5AC');tube(-1.48,-.55,0,.52,.52,.38,'#FFDD93');
  tube(1.47,-.75,0,.53,.53,1.00,'#EFF5E7');tube(1.47,-.17,0,.55,.55,.14,'#13755E');
 }else if(pick===1){
  tube(0,-.22,0,1.08,1.03,2.12,'#D69C35',56);tube(0,.89,0,1.08,1.08,.17,'#F5D894',56);
  tube(0,-.15,0,1.08,1.08,.88,'#145C4B',56);ring(0,-.74,0,1.07,.05,'#FFE1A5');
  tube(-1.56,-.78,0,.42,.42,1.10,'#EFF6E6');tube(1.58,-.79,0,.45,.43,1.05,'#E9C777');
 }else{
  tube(0,-.32,0,1.20,1.30,1.75,'#E7F8EC',56);tube(0,.63,0,1.33,1.33,.17,'#147764',56);
  tube(0,-.25,0,1.27,1.29,.81,'#42A485',56);ring(0,.68,0,1.3,.05,'#FDE2A8');
  tube(-1.57,-.79,0,.47,.47,1.00,'#E5BD72');tube(1.60,-.78,0,.45,.45,1.02,'#F2F6E9');
 }
}
function driver(){
 platform();
 box(-.32,-.12,0,3.6,1.40,1.58,pick===1?'#F7F7ED':'#E4F5E7');
 box(1.15,.64,0,1.31,1.36,1.54,pick===2?'#C9BA77':'#16907A');
 box(1.40,.77,.79,.85,.57,.03,'#9BDDEA');box(1.40,.77,-.79,.85,.57,.03,'#9BDDEA');
 box(-.92,.13,.80,1.61,.72,.032,'#0F6B5A');box(-.92,.13,-.80,1.61,.72,.032,'#0F6B5A');
 box(-1.94,-.42,0,.18,.25,1.42,'#F7D28C');
 [-1.35,1.31].forEach(function(x){[-.84,.84].forEach(function(z){wheel(x,-.91,z);});});
 if(pick===1){for(var i=0;i<3;i++)box(-1+i*.64,1.00,0,.50,.23,1.15,'#BDE6E3');}
 if(pick===2){ring(0,1.55,0,.71,.08,'#93E2CF');ring(0,1.55,0,1.01,.03,'#F4CE83');}
 else tube(-.30,1.45,0,.24,.24,.35,'#D7B575');
}
function admin(){
 platform();
 var h=pick===0?[1.3,2.05,1.75,2.45,2.9]:pick===1?[2.7,1.6,2.2,1.55,2.8]:[1.0,1.45,2.1,2.55,3.0];
 var palette=['#89DFC4','#269D83','#E9BA69','#52C9A9','#F5D389'];
 for(var i=0;i<5;i++){var x=(i-2)*.76,z=(i%2===0)?-.27:.3;
  box(x,-1.33+h[i]/2,z,.53,h[i],.68,palette[i]);box(x,-1.32+h[i],z,.54,.08,.69,'#FFF3D9');
 }
 ring(0,1.15,.30,1.18,.05,'#E8C57E');ring(0,1.15,.30,1.48,.03,'#85E9CC');
}
function assemble(){
 coords=[];normals=[];colors=[];
 if(portal==='customer')customer();else if(portal==='driver')driver();else admin();
 vertexCount=coords.length/3;
 buffers=[coords,normals,colors].map(function(values){var b=ctx.createBuffer();ctx.bindBuffer(ctx.ARRAY_BUFFER,b);ctx.bufferData(ctx.ARRAY_BUFFER,new Float32Array(values),ctx.STATIC_DRAW);return b;});
}
function shader(type,source){var s=ctx.createShader(type);ctx.shaderSource(s,source);ctx.compileShader(s);return ctx.getShaderParameter(s,ctx.COMPILE_STATUS)?s:null;}
var vs='attribute vec3 position;attribute vec3 normal;attribute vec3 rgb;uniform mat4 mvp;uniform mat4 model;varying vec3 n;varying vec3 c;void main(){n=mat3(model)*normal;c=rgb;gl_Position=mvp*vec4(position,1.0);}';
var fs='precision mediump float;varying vec3 n;varying vec3 c;void main(){vec3 v=normalize(n);vec3 light=normalize(vec3(-0.6,1.0,1.2));float d=max(dot(v,light),0.0);float r=pow(1.0-abs(dot(v,normalize(vec3(0.3,0.3,1.0)))),3.0);gl_FragColor=vec4(c*(0.48+0.70*d)+vec3(1.0,0.80,0.50)*r*0.16,1.0);}';
function mul(a,b){var o=new Array(16).fill(0);for(var c=0;c<4;c++)for(var r=0;r<4;r++)for(var k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
function perspective(ratio){var f=1/Math.tan(.35),n=.1,far=90;return [f/ratio,0,0,0,0,f,0,0,0,0,(far+n)/(n-far),-1,0,0,2*far*n/(n-far),0];}
function lookat(){
 var eye=[Math.sin(yaw)*zoom*Math.cos(pitch),Math.sin(pitch)*zoom,Math.cos(yaw)*zoom*Math.cos(pitch)];
 var norm=function(v){var l=Math.hypot.apply(Math,v)||1;return v.map(function(x){return x/l;});};
 var cross=function(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];};
 var z=norm([eye[0],eye[1]+.12,eye[2]]),x=norm(cross([0,1,0],z)),y=cross(z,x);
 return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x.reduce(function(s,v,i){return s+v*eye[i];},0),-y.reduce(function(s,v,i){return s+v*eye[i];},0),-z.reduce(function(s,v,i){return s+v*eye[i];},0),1];
}
function spinmat(a){return [Math.cos(a),0,-Math.sin(a),0,0,1,0,0,Math.sin(a),0,Math.cos(a),0,0,0,0,1];}
function render(t){
 if(!active||!ctx||document.hidden)return;
 var delta=Math.min(t-last||0,42);last=t;if(motion&&!pointer)rotation+=delta*.00028;
 var dpr=Math.min(devicePixelRatio||1,1.7),w=Math.floor(stage.clientWidth*dpr),h=Math.floor(stage.clientHeight*dpr);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;ctx.viewport(0,0,w,h);}
 ctx.clearColor(0,0,0,0);ctx.clear(ctx.COLOR_BUFFER_BIT|ctx.DEPTH_BUFFER_BIT);ctx.useProgram(prog);
 var model=spinmat(rotation),mvp=mul(mul(perspective(w/Math.max(1,h)),lookat()),model);
 ctx.uniformMatrix4fv(ctx.getUniformLocation(prog,'mvp'),false,new Float32Array(mvp));
 ctx.uniformMatrix4fv(ctx.getUniformLocation(prog,'model'),false,new Float32Array(model));
 ['position','normal','rgb'].forEach(function(n,i){var a=ctx.getAttribLocation(prog,n);ctx.bindBuffer(ctx.ARRAY_BUFFER,buffers[i]);ctx.enableVertexAttribArray(a);ctx.vertexAttribPointer(a,3,ctx.FLOAT,false,0,0);});
 ctx.drawArrays(ctx.TRIANGLES,0,vertexCount);rAF=requestAnimationFrame(render);
}
function initialize(){
 ctx=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,powerPreference:'high-performance'});
 if(!ctx){fallback.hidden=false;return false;}
 var v=shader(ctx.VERTEX_SHADER,vs),f=shader(ctx.FRAGMENT_SHADER,fs);
 if(!v||!f){fallback.hidden=false;return false;}
 prog=ctx.createProgram();ctx.attachShader(prog,v);ctx.attachShader(prog,f);ctx.linkProgram(prog);ctx.deleteShader(v);ctx.deleteShader(f);
 if(!ctx.getProgramParameter(prog,ctx.LINK_STATUS)){fallback.hidden=false;return false;}
 ctx.enable(ctx.DEPTH_TEST);ctx.enable(ctx.CULL_FACE);assemble();
 canvas.addEventListener('webglcontextlost',function(e){e.preventDefault();active=false;cancelAnimationFrame(rAF);fallback.hidden=false;});
 return true;
}
function open(){if(active)return;focusBefore=document.activeElement;modal.hidden=false;document.body.classList.add('fmv3d-open');if(!ctx&&!initialize())return;active=true;last=0;render(0);root.querySelector('.fmv3d-close').focus();}
function close(){active=false;cancelAnimationFrame(rAF);modal.hidden=true;document.body.classList.remove('fmv3d-open');pointer=null;if(focusBefore&&focusBefore.focus)focusBefore.focus();}
root.querySelector('#fmv3d-launch').addEventListener('click',open);
root.querySelectorAll('[data-close]').forEach(function(b){b.addEventListener('click',close);});
root.querySelectorAll('[data-pick]').forEach(function(b){b.addEventListener('click',function(){pick=Number(b.dataset.pick);root.querySelectorAll('[data-pick]').forEach(function(x){x.setAttribute('aria-pressed',String(x===b));});if(ctx){buffers.forEach(function(x){ctx.deleteBuffer(x);});assemble();rotation=0;}});});
root.querySelector('#fmv3d-reset').addEventListener('click',function(){rotation=0;yaw=.3;pitch=.23;zoom=8.8;});
var motionButton=root.querySelector('#fmv3d-motion');motionButton.textContent=motion?'Pause rotation':'Start rotation';
motionButton.addEventListener('click',function(){motion=!motion;motionButton.textContent=motion?'Pause rotation':'Start rotation';});
root.addEventListener('keydown',function(e){
 if(modal.hidden)return;
 if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='ArrowLeft'){rotation-=.16;e.preventDefault();}else if(e.key==='ArrowRight'){rotation+=.16;e.preventDefault();}else if(e.key==='ArrowUp'){pitch=Math.min(1.05,pitch+.1);e.preventDefault();}else if(e.key==='ArrowDown'){pitch=Math.max(-.75,pitch-.1);e.preventDefault();}
 if(e.key==='Tab'){var buttons=Array.from(modal.querySelectorAll('button')),idx=buttons.indexOf(document.activeElement);if(e.shiftKey&&idx===0){e.preventDefault();buttons[buttons.length-1].focus();}else if(!e.shiftKey&&idx===buttons.length-1){e.preventDefault();buttons[0].focus();}}
});
canvas.addEventListener('pointerdown',function(e){pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',function(e){if(!pointer||pointer.id!==e.pointerId)return;rotation+=(e.clientX-pointer.x)*.014;pitch=Math.max(-.7,Math.min(1.05,pitch+(e.clientY-pointer.y)*.006));pointer.x=e.clientX;pointer.y=e.clientY;});
['pointerup','pointercancel'].forEach(function(n){canvas.addEventListener(n,function(){pointer=null;});});
canvas.addEventListener('wheel',function(e){if(modal.hidden)return;e.preventDefault();zoom=Math.max(5.4,Math.min(13,zoom+e.deltaY*.012));},{passive:false});
document.addEventListener('visibilitychange',function(){if(document.hidden)cancelAnimationFrame(rAF);else if(active){last=0;render(0);}});
})();