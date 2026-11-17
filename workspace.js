/* Shared portal preferences, scoped order conversations and coordinate route maps. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),e=value=>FMV.escape(value);
  let preferences={dark_mode:false,notification_sound:false},lastUnread=null,chatOrder='',chatKey='',audio=null,snapshot=null,chatSeen=0;
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
  async function refreshChat(){
    if(!chatOrder)return;
    const order=chatOrder,result=await FMV.request('/orders/'+encodeURIComponent(order)+'/chat');if(order!==chatOrder)return;
    const feed=$('fmv-chat-messages');if(!feed)return;
    const atBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<70;
    feed.innerHTML=result.messages.map(message=>`<article class="fmv-chat-message"><strong>${e(message.sender_name)} · ${e(message.sender_role)}</strong><p>${e(message.message)}</p><small>${e(new Date(message.created_at).toLocaleString())}</small></article>`).join('') || FMV.empty('No messages yet. Keep this conversation about this order.');
    if(atBottom)feed.scrollTop=feed.scrollHeight;
    if(result.messages.length>chatSeen){chatSeen=result.messages.length;await FMV.request('/orders/'+encodeURIComponent(order)+'/chat/read',{method:'POST'});}
    $('fmv-chat-send').disabled=result.closed;$('fmv-chat-input').disabled=result.closed;$('fmv-chat-state').textContent=result.closed?'This order is closed. Contact support for further help.':'Messages are shared only with this order’s customer, assigned driver and authorized support.';
  }
  async function openChat(orderId){
    chatOrder=orderId;chatKey='';chatSeen=0;const node=dialog('fmv-order-chat','Order conversation',`<p class="fmv-small">${e(orderId)}</p><p id="fmv-chat-state" class="fmv-small"></p><div id="fmv-chat-messages" class="fmv-chat-feed" aria-live="polite"></div><form id="fmv-chat-form" class="fmv-work-form"><label>Message<textarea id="fmv-chat-input" maxlength="2000" rows="3" required></textarea></label><p id="fmv-chat-error" role="alert"></p><button id="fmv-chat-send" type="submit" class="fmv-btn">Send message</button></form>`);
    node.addEventListener('close',()=>{chatOrder='';chatKey='';});node.showModal();await refreshChat();
    $('fmv-chat-form').addEventListener('submit',async event=>{
      event.preventDefault();const button=$('fmv-chat-send');if(button.disabled)return;button.disabled=true;chatKey ||= crypto.randomUUID().replaceAll('-','');
      try{await FMV.request('/orders/'+encodeURIComponent(orderId)+'/chat',{method:'POST',headers:{'Idempotency-Key':chatKey},body:{message:$('fmv-chat-input').value.trim()}});$('fmv-chat-input').value='';chatKey='';$('fmv-chat-error').textContent='';await refreshChat();}
      catch(error){$('fmv-chat-error').textContent=error.message;}finally{button.disabled=false;}
    });
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
  document.addEventListener('fmv:locked',()=>{chatOrder='';snapshot=null;lastUnread=null;for(const node of document.querySelectorAll('.fmv-work-dialog'))node.remove();});
  window.FMVWorkspace={form,dialog,routeMarkup,settingsMarkup,applyPreferences,onSnapshot,openChat,get snapshot(){return snapshot;}};
})();
