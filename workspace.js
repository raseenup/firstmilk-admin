/* Shared portal preferences, scoped order conversations and coordinate route maps. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),e=value=>FMV.escape(value);
  let preferences={dark_mode:false,notification_sound:false},lastUnread=null,chatOrder='',chatKey='',audio=null,snapshot=null,chatSeen=0;
  let chatGeneration=0,chatMessages=new Map(),chatMedia=new Map(),chatFetch=null,chatAgain=false,chatClosed=false,chatSending=false;
  let chosenFile=null,chosenKind='',attachmentId='',uploadKey='',sendSignature='',recorder=null,recordStream=null,recordTimer=null,recordStarting=false;
  function applyPreferences(){
    document.documentElement.dataset.theme=preferences.dark_mode?'dark':'light';
    try{localStorage.setItem('fmv_theme_'+FMV.portal,preferences.dark_mode?'dark':'light');}catch(error){}
    for(const button of document.querySelectorAll('[data-workspace-action="theme"]')){button.textContent='Dark mode: '+(preferences.dark_mode?'On':'Off');button.setAttribute('aria-pressed',String(preferences.dark_mode));}
    for(const button of document.querySelectorAll('[data-workspace-action="sound"]')){button.textContent='Notification sound: '+(preferences.notification_sound?'On':'Off');button.setAttribute('aria-pressed',String(preferences.notification_sound));}
  }
  function settingsMarkup(){return '<div class="fmv-settings-controls"><button type="button" class="fmv-btn secondary" data-workspace-action="theme">Dark mode: Off</button><button type="button" class="fmv-btn secondary" data-workspace-action="sound">Notification sound: Off</button></div>';}
  function chime(){
    if(!audio || audio.state!=='running' || !preferences.notification_sound)return;
    const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.connect(gain);gain.connect(audio.destination);
    oscillator.frequency.value=660;gain.gain.setValueAtTime(.06,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.2);oscillator.start();oscillator.stop(audio.currentTime+.2);
  }
  function onSnapshot(data){
    snapshot=data;preferences={...preferences,...data.preferences};applyPreferences();
    const unread=Object.values(data.chat_unread || {}).reduce((a,b)=>a+Number(b || 0),0)+(data.notifications || data.enterprise?.[8]?.notifications || []).filter(n=>!n.read).length;
    if(lastUnread!==null && unread>lastUnread)chime();lastUnread=unread;
    if(chatOrder && $('fmv-order-chat')?.open)FMV.guard(refreshChat);
    document.dispatchEvent(new CustomEvent('fmv:snapshot',{detail:data}));
  }
  function dialog(id,title,content){
    let node=$(id);if(node)node.remove();node=document.createElement('dialog');node.id=id;node.className='fmv-work-dialog';node.setAttribute('aria-labelledby',id+'-title');
    node.innerHTML=`<div class="fmv-work-heading"><h2 id="${id}-title">${e(title)}</h2><button type="button" class="fmv-btn secondary" data-workspace-action="close" data-dialog="${id}">Close</button></div>${content}`;
    document.body.append(node);return node;
  }
  function form(title,fields,onSubmit,label='Save'){
    const node=dialog('fmv-work-form',title,`<form class="fmv-work-form">${fields}<p role="alert" class="fmv-form-error"></p><button type="submit" class="fmv-btn">${e(label)}</button></form>`);
    node.querySelector('form').addEventListener('submit',async event=>{
      event.preventDefault();const element=event.currentTarget,button=element.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
      element.querySelector('[role=alert]').textContent='';
      try{await onSubmit(element);node.close();}catch(error){element.querySelector('[role=alert]').textContent=error.message;}finally{button.disabled=false;}
    });node.showModal();return node.querySelector('form');
  }
  const requestKey=()=>crypto.randomUUID().replaceAll('-','');
  function releaseRecording(){
    clearInterval(recordTimer);recordTimer=null;
    if(recorder && recorder.state!=='inactive')recorder.stop();
    recordStream?.getTracks().forEach(track=>track.stop());recordStream=null;recordStarting=false;
  }
  function clearChat(){
    chatGeneration++;releaseRecording();recorder=null;
    for(const url of chatMedia.values())URL.revokeObjectURL(url);
    chatMedia.clear();chatMessages.clear();chatOrder='';chatKey='';chatSeen=0;chatFetch=null;chatAgain=false;chatSending=false;chosenFile=null;attachmentId='';uploadKey='';sendSignature='';
  }
  function chatControls(){
    const locked=chatClosed || chatSending || recordStarting || !!(recorder && recorder.state==='recording');
    for(const id of ['fmv-chat-input','fmv-chat-image','fmv-chat-voice','fmv-chat-remove','fmv-chat-send'])if($(id))$(id).disabled=locked;
    if($('fmv-chat-record')){$('fmv-chat-record').disabled=chatClosed || chatSending || recordStarting;$('fmv-chat-record').textContent=recorder?.state==='recording'?'Stop recording':'Record voice';}
    if($('fmv-chat-send'))$('fmv-chat-send').textContent=chatSending?'Sending…':'Send message';
  }
  function selectAttachment(file,kind){
    if(file && (!file.size || file.size>1500000))throw new Error('Choose a photo or voice file up to 1.5 MB.');
    chosenFile=file;chosenKind=kind;attachmentId='';uploadKey='';chatKey='';sendSignature='';
    $('fmv-chat-selected').textContent=file?`${kind==='image'?'Photo':'Voice'}: ${file.name} · ${Math.ceil(file.size/1024)} KB`:'';
    $('fmv-chat-remove').hidden=!file;
  }
  function attachmentMarkup(a){
    return `<div class="fmv-chat-attachment" data-chat-attachment="${e(a.id)}"><button type="button" class="fmv-btn secondary" data-chat-load="${e(a.id)}">${a.kind==='image'?'View photo':'Load voice message'} · ${Math.ceil(a.size/1024)} KB</button></div>`;
  }
  async function loadAttachment(id){
    const item=[...chatMessages.values()].flatMap(m=>m.attachments || []).find(a=>a.id===id);if(!item)return;
    const generation=chatGeneration,container=[...document.querySelectorAll('[data-chat-attachment]')].find(node=>node.dataset.chatAttachment===id);if(!container)return;
    const button=container.querySelector('button');if(button)button.disabled=true;
    try{let url=chatMedia.get(id);if(!url){const blob=await FMV.media(item.url);if(generation!==chatGeneration)return;url=URL.createObjectURL(blob);chatMedia.set(id,url);}
      const element=document.createElement(item.kind==='image'?'img':'audio');element.src=url;
      if(item.kind==='image'){element.alt='Photo shared in this order conversation';element.loading='lazy';}
      else{element.controls=true;element.preload='metadata';element.setAttribute('aria-label','Voice message from '+(item.sender_name || 'order participant'));}
      container.replaceChildren(element);
    }catch(error){if(generation===chatGeneration){$('fmv-chat-error').textContent=error.message;if(button)button.disabled=false;}}
  }
  function refreshChat(){
    if(!chatOrder)return Promise.resolve();
    if(chatFetch){chatAgain=true;return chatFetch;}
    const order=chatOrder,generation=chatGeneration;
    const task=(async()=>{do{
      chatAgain=false;let hasMore=true;
      while(hasMore && generation===chatGeneration){
        const after=chatSeen,result=await FMV.request('/orders/'+encodeURIComponent(order)+'/chat?after='+after);if(generation!==chatGeneration)return;
        const feed=$('fmv-chat-messages');if(!feed)return;
        const atBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<70;
        for(const message of result.messages){
          const sequence=Number(message.sequence || chatMessages.size+1),id=message.id || String(sequence);if(chatMessages.has(id))continue;
          if(!chatMessages.size)feed.replaceChildren();chatMessages.set(id,{...message,sequence});
          const article=document.createElement('article');article.className='fmv-chat-message';article.innerHTML=`<strong>${e(message.sender_name)} · ${e(message.sender_role)}</strong>${message.message?`<p>${e(message.message)}</p>`:''}${(message.attachments || []).map(attachmentMarkup).join('')}<small>${e(new Date(message.created_at).toLocaleString())}</small>`;feed.append(article);chatSeen=Math.max(chatSeen,sequence);
        }
        if(!chatMessages.size)feed.innerHTML=FMV.empty('No messages yet. Share text, a photo or a voice message about this order.');
        if(atBottom)feed.scrollTop=feed.scrollHeight;
        if(chatSeen>after)await FMV.request('/orders/'+encodeURIComponent(order)+'/chat/read',{method:'POST',body:{sequence:chatSeen}});
        if(generation!==chatGeneration)return;
        chatClosed=result.closed;chatControls();$('fmv-chat-state').textContent=result.closed?'This order is closed. Contact support for further help.':'Private to this order’s customer, current driver and authorised support. Photos and voice files load when you choose them.';
        hasMore=!!result.has_more;if(hasMore && chatSeen<=after)throw new Error('Conversation could not advance. Close it and try again.');
      }
    }while(chatAgain && generation===chatGeneration);})().catch(error=>{if(generation===chatGeneration && $('fmv-chat-error')){
      $('fmv-chat-error').textContent=error.message;
      if([401,403,404].includes(error.status)){releaseRecording();for(const url of chatMedia.values())URL.revokeObjectURL(url);chatMedia.clear();chatMessages.clear();$('fmv-chat-messages').replaceChildren();chatClosed=true;chatOrder='';chatControls();}
    }}).finally(()=>{if(chatFetch===task)chatFetch=null;});
    chatFetch=task;return task;
  }
  async function startRecording(){
    if(recorder?.state==='recording'){releaseRecording();return;}
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)throw new Error('Voice recording is unavailable here. Use Upload voice to attach an audio file.');
    const generation=chatGeneration;recordStarting=true;chatControls();
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(generation!==chatGeneration){stream.getTracks().forEach(track=>track.stop());return;}
      if(document.hidden){stream.getTracks().forEach(track=>track.stop());throw new Error('Keep the conversation visible while recording.');}
      recordStream=stream;const type=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));if(!type)throw new Error('Use Upload voice with M4A, MP3, Ogg, WAV or WebM audio.');
      const current=new MediaRecorder(stream,{mimeType:type,audioBitsPerSecond:64000}),chunks=[];let size=0,seconds=0;recorder=current;
      current.addEventListener('dataavailable',event=>{if(event.data.size){chunks.push(event.data);size+=event.data.size;if(size>1500000)releaseRecording();}});
      current.addEventListener('error',()=>{if(generation===chatGeneration){releaseRecording();$('fmv-chat-error').textContent='Recording failed. Try Upload voice.';}});
      current.addEventListener('stop',()=>{
        stream.getTracks().forEach(track=>track.stop());if(generation!==chatGeneration)return;
        clearInterval(recordTimer);recordTimer=null;if(recorder===current)recorder=null;
        try{const blob=new Blob(chunks,{type:current.mimeType}),suffix=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';selectAttachment(new File([blob],'voice-message.'+suffix,{type:blob.type}),'voice');}
        catch(error){$('fmv-chat-error').textContent=error.message;}finally{chatControls();}
      });
      current.start(1000);recordStarting=false;chatControls();$('fmv-chat-selected').textContent='Recording… 0:00 (up to one minute)';
      recordTimer=setInterval(()=>{seconds++;if($('fmv-chat-selected'))$('fmv-chat-selected').textContent='Recording… 0:'+String(seconds).padStart(2,'0');if(seconds>=60)releaseRecording();},1000);
    }catch(error){if(generation===chatGeneration){releaseRecording();throw error;}}finally{if(generation===chatGeneration){recordStarting=false;chatControls();}}
  }
  async function openChat(orderId){
    clearChat();chatOrder=orderId;chatClosed=false;const generation=chatGeneration;
    const node=dialog('fmv-order-chat','Order conversation',`<p class="fmv-small">${e(orderId)}</p><p id="fmv-chat-state" class="fmv-small">Loading conversation…</p><div id="fmv-chat-messages" class="fmv-chat-feed" aria-live="polite"></div><form id="fmv-chat-form" class="fmv-work-form"><label>Message<textarea id="fmv-chat-input" maxlength="2000" rows="3"></textarea></label><div class="fmv-chat-tools"><label class="fmv-chat-file">Add photo<input id="fmv-chat-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><label class="fmv-chat-file">Upload voice<input id="fmv-chat-voice" type="file" accept="audio/mp4,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/webm,.m4a"></label><button id="fmv-chat-record" type="button" class="fmv-btn secondary">Record voice</button></div><p class="fmv-work-micro">One photo or voice file per message · up to 1.5 MB. Microphone access is requested only when you choose Record voice.</p><p id="fmv-chat-selected" class="fmv-small" role="status"></p><button id="fmv-chat-remove" type="button" class="fmv-btn secondary" hidden>Remove attachment</button><p id="fmv-chat-error" role="alert"></p><button id="fmv-chat-send" type="submit" class="fmv-btn" disabled>Send message</button></form>`);
    node.addEventListener('close',()=>{if(generation===chatGeneration)clearChat();});node.addEventListener('click',event=>{const load=event.target.closest('[data-chat-load]');if(load)FMV.guard(()=>loadAttachment(load.dataset.chatLoad));});node.showModal();
    for(const [id,kind] of [['fmv-chat-image','image'],['fmv-chat-voice','voice']])$(id).addEventListener('change',event=>{try{selectAttachment(event.target.files?.[0] || null,kind);$('fmv-chat-error').textContent='';}catch(error){event.target.value='';$('fmv-chat-error').textContent=error.message;}});
    $('fmv-chat-remove').addEventListener('click',()=>{selectAttachment(null,'');$('fmv-chat-image').value='';$('fmv-chat-voice').value='';});
    $('fmv-chat-record').addEventListener('click',()=>FMV.guard(startRecording));
    $('fmv-chat-form').addEventListener('submit',async event=>{
      event.preventDefault();if(chatSending || chatClosed || recorder?.state==='recording')return;
      const text=$('fmv-chat-input').value.trim();if(!text && !chosenFile){$('fmv-chat-error').textContent='Write a message or attach a photo / voice recording.';return;}
      chatSending=true;chatControls();$('fmv-chat-error').textContent='';
      try{
        if(chosenFile && !attachmentId){uploadKey ||= requestKey();const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Attachment could not be read.'));reader.readAsDataURL(chosenFile);});
          const uploaded=await FMV.request('/orders/'+encodeURIComponent(orderId)+'/chat/attachments',{method:'POST',headers:{'Idempotency-Key':uploadKey},body:{filename:chosenFile.name,kind:chosenKind,data_base64:data}});if(generation!==chatGeneration)return;attachmentId=uploaded.id;
        }
        const body={message:text,attachments:attachmentId?[attachmentId]:[]},signature=JSON.stringify(body);if(signature!==sendSignature){chatKey=requestKey();sendSignature=signature;}
        await FMV.request('/orders/'+encodeURIComponent(orderId)+'/chat',{method:'POST',headers:{'Idempotency-Key':chatKey},body});if(generation!==chatGeneration)return;
        $('fmv-chat-input').value='';selectAttachment(null,'');$('fmv-chat-image').value='';$('fmv-chat-voice').value='';await refreshChat();
      }catch(error){if(generation===chatGeneration)$('fmv-chat-error').textContent=error.message;}finally{if(generation===chatGeneration){chatSending=false;chatControls();}}
    });
    await refreshChat();
  }
  function routeMarkup(plan,financial=false){
    if(!plan)return FMV.empty('No route is available yet.');
    if(plan.status==='empty')return FMV.empty('No running deliveries to route.');
    const points=[plan.origin,...plan.stops].filter(p=>Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
    let map='';
    if(points.length>1){
      const minLat=Math.min(...points.map(p=>p.latitude)),maxLat=Math.max(...points.map(p=>p.latitude)),minLon=Math.min(...points.map(p=>p.longitude)),maxLon=Math.max(...points.map(p=>p.longitude));
      const coords=points.map(p=>[30+440*(p.longitude-minLon)/Math.max(.00001,maxLon-minLon),270-240*(p.latitude-minLat)/Math.max(.00001,maxLat-minLat)]);
      map=`<svg class="fmv-route-map" viewBox="0 0 500 300" role="img" aria-label="Estimated delivery stop sequence"><rect width="500" height="300" rx="16" fill="var(--fmv-map-bg,#edf5ef)"/><polyline points="${coords.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#168265" stroke-width="3"/>${coords.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="12" fill="${i?'#17654d':'#a15b2b'}"/><text x="${x}" y="${y+4}" text-anchor="middle" fill="white" font-size="11">${i || 'S'}</text>`).join('')}</svg>`;
    }
    return `${plan.origin_required?'<p class="fmv-callout">Set the depot or a route starting location to plan the route.</p>':''}${map}<p class="fmv-small">Coordinate-based stop map · estimated ${Number(plan.estimated_km).toFixed(2)} km. Check road directions before driving.</p>${financial?`<p><strong>Estimated delivery cost:</strong> ${plan.estimated_delivery_cost===null?'Not configured':FMV.money(plan.estimated_delivery_cost)}<br><strong>Estimated contribution:</strong> ${plan.estimated_profit===null?'Enter complete product costs and locations':FMV.money(plan.estimated_profit)}</p><p class="fmv-small">${e(plan.profit_note)}</p>`:''}<ol class="fmv-route-stops">${plan.stops.map(stop=>`<li><strong>${e(stop.order_number)}</strong><p>${e(stop.address)} · ${e(stop.delivery_date)}</p></li>`).join('')}</ol>${(plan.missing_locations || []).length?`<p class="fmv-callout">${plan.missing_locations.length} delivery locations still need coordinates before a complete route can be planned.</p>`:''}<div class="fmv-flex">${plan.directions_urls.map((url,i)=>`<a class="fmv-btn" href="${e(url)}" target="_blank" rel="noopener noreferrer">Open road directions${plan.directions_urls.length>1?' '+(i+1):''}</a>`).join('')}</div>`;
  }
  document.addEventListener('DOMContentLoaded',()=>{
    try{document.documentElement.dataset.theme=localStorage.getItem('fmv_theme_'+FMV.portal) || 'light';}catch(error){document.documentElement.dataset.theme='light';}
    document.addEventListener('pointerdown',()=>{if(preferences.notification_sound && !audio){const Audio=window.AudioContext || window.webkitAudioContext;if(Audio)audio=new Audio();}if(audio?.state==='suspended')audio.resume().catch(()=>{});},{passive:true});
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-workspace-action]');if(!button || button.disabled)return;
      FMV.guard(async()=>{
        const action=button.dataset.workspaceAction;
        if(action==='close'){$(button.dataset.dialog)?.close();return;}
        if(action==='chat'){await openChat(button.dataset.orderId);return;}
        if(action==='theme' || action==='sound'){
          button.disabled=true;try{const next={...preferences};next[action==='theme'?'dark_mode':'notification_sound']=!next[action==='theme'?'dark_mode':'notification_sound'];await FMV.request('/users/me/preferences',{method:'PATCH',body:next});preferences=next;applyPreferences();if(action==='sound' && next.notification_sound){const Audio=window.AudioContext || window.webkitAudioContext;if(!audio && Audio)audio=new Audio();if(audio)await audio.resume();chime();}}finally{button.disabled=false;}
        }
      });
    });
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden && recorder?.state==='recording')releaseRecording();});
  document.addEventListener('fmv:locked',()=>{clearChat();snapshot=null;lastUnread=null;for(const node of document.querySelectorAll('.fmv-work-dialog'))node.remove();});
  window.FMVWorkspace={form,dialog,routeMarkup,settingsMarkup,applyPreferences,onSnapshot,openChat,get snapshot(){return snapshot;}};
})();
