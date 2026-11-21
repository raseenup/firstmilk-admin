/* v9: visible staff invitations and a focused publishing workspace. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),e=FMV.escape;
  let campaigns=[],pages={},editing=null,mediaId='',busy=false;
  const roleOptions='<option value="operations_manager">Operations Manager</option><option value="content_manager">Content Manager — ads & offers</option><option value="finance">Finance</option><option value="customer_support">Customer Support</option><option value="super_admin">Super Admin</option>';
  const pageTitles={terms:'Terms & Conditions',privacy:'Privacy Policy',refund:'Refund Policy',about:'About us',contact:'Contact us'};

  function mayPublish(){return FMV.user?.portal==='admin' && (['super_admin','content_manager'].includes(FMV.user.role) || FMV.user.content_editor===true);}
  function build(){
    const dashboard=$('staff-dashboard'),nav=$('fmv-admin-nav');
    for(const [tab,label,icon] of [['marketing','Ads & offers','◇'],['invitations','Invitations','＋']]){
      const button=document.createElement('button');button.type='button';button.id='fmv-admin-tab-'+tab;button.dataset.adminTab=tab;button.setAttribute('aria-controls','fmv-admin-panel-'+tab);button.innerHTML=`<span class="fmv-admin-nav-symbol" aria-hidden="true">${icon}</span><span>${label}</span>`;nav.append(button);
    }
    const invite=document.createElement('section');invite.dataset.adminPanel='invitations';invite.className='fmv-panel fmv-invitation-panel';
    invite.innerHTML=`<div class="fmv-editor-heading"><div><span class="admin-eyebrow">INDIVIDUAL STAFF ACCOUNTS</span><h3>Invite an administrator</h3><p>Send a private, single-use invitation valid for 24 hours. Staff finish sign-up with email verification.</p></div></div><form id="fmv-invitation-form" class="fmv-editor-form"><label>Staff email address<input name="email" type="email" required autocomplete="off" maxlength="254" placeholder="colleague@example.com"></label><label>Role<select name="role">${roleOptions}</select></label><button type="submit" class="fmv-btn">Create & email invitation →</button></form><div id="fmv-invitation-result" class="fmv-private-invite" hidden><strong>Private invitation created</strong><p>Email is queued. You can also copy this code and share it privately with the invited person.</p><label>Invitation code<input id="fmv-invitation-code" readonly autocomplete="off"></label><button type="button" class="fmv-btn secondary" data-admin-action="copy-invitation">Copy code</button><p class="fmv-small">Admin portal → Accept administrator invitation → complete Sign up using the invited email address and this code.</p></div><h4>Pending & previous invitations</h4><div id="fmv-invitation-list"></div><h4>Designated content editors</h4><p class="fmv-small">Give an existing administrator access to ads, offers and company pages. Their other permissions stay tied to their role.</p><div id="fmv-content-editors"></div><h4>Email delivery status</h4><p class="fmv-small">Queued messages are sent by the backend worker. Failed attempts are retried automatically. “Sent” means accepted by the email provider.</p><button class="fmv-btn secondary" data-admin-action="refresh-invitations">Refresh status</button><div id="fmv-mail-status"></div>`;
    dashboard.append(invite);
    const marketing=document.createElement('section');marketing.dataset.adminPanel='marketing';marketing.className='fmv-panel fmv-marketing-panel';
    marketing.innerHTML=`<div class="fmv-editor-heading"><div><span class="admin-eyebrow">FRESH STORIES, EASY TO PUBLISH</span><h3>Ads, offers & animated menus</h3><p>Create a post, upload your artwork, then publish in one action.</p></div><button class="fmv-btn" data-admin-action="new-campaign">+ Add ad or post</button></div><form id="fmv-campaign-form" class="fmv-editor-form" hidden><h4 id="fmv-campaign-form-title">New campaign</h4><div class="fmv-editor-columns"><label>Title<input name="title" required maxlength="120" placeholder="A fresh start to every morning"></label><label>Content type<select name="kind"><option value="banner">Banner</option><option value="offer">Offer</option><option value="menu">Animated menu / fresh picks</option><option value="post">Company post</option></select></label><label>Show in<select name="placement"><option value="home">Customer Home hero</option><option value="home_location">Home ad strip (former address area)</option><option value="offers">Offers tab</option><option value="driver">Delivery driver portal (staff notice)</option><option value="email">Company banner in emails</option></select></label><label>Publish status<select name="status"><option value="published">Published</option><option value="draft">Draft</option></select></label></div><label>Description<textarea name="description" rows="3" maxlength="1500" placeholder="Tell customers what is fresh…"></textarea></label><label>Upload artwork or animation<input id="fmv-campaign-file" name="file" type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4"><small>JPG, PNG, GIF, animated WebP or MP4 · up to 50 MB per file. Secure resumable upload with progress. Use images for email banners; MP4 videos remain in the portals and website.</small></label><div id="fmv-campaign-preview" class="fmv-campaign-preview"></div>
    <div id="fmv-campaign-upload-status" class="fmv-media-upload-state" role="status" hidden>
      <span id="fmv-campaign-upload-text">Ready to upload</span><progress id="fmv-campaign-upload-progress" max="100" value="0"></progress>
    </div><div class="fmv-flex"><button class="fmv-btn secondary" type="button" data-admin-action="remove-media">Remove artwork</button></div><label>Image description<input name="alt_text" maxlength="200" placeholder="Describe the image for customers using screen readers"></label><div class="fmv-editor-columns"><label>Artwork width (px)<input name="display_width" type="number" min="240" max="1600" step="1" value="1200" required></label><label>Artwork height (px)<input name="display_height" type="number" min="80" max="1000" step="1" value="300" required></label><label>Artwork fit<select name="media_fit"><option value="contain">Show whole image</option><option value="cover">Fill frame (crop edges)</option></select></label><label>Entry animation<select name="animation"><option value="fade">Fade in</option><option value="slide">Slide in</option><option value="none">None</option></select></label><label>Button label<input name="cta_label" maxlength="40" value="Explore"></label><label>Button destination<select name="cta_path"><option value="catalog">Product catalog</option><option value="offers">Offers</option><option value="home">Home</option><option value="profile">Profile</option></select></label><label>Display order<input name="sort_order" type="number" min="0" max="10000" step="1" value="0" required></label><label>Start time (optional)<input name="starts_at" type="datetime-local"></label><label>End time (optional)<input name="ends_at" type="datetime-local"></label></div><label>Offer terms / additional details<textarea name="terms" rows="2" maxlength="1000" placeholder="Eligibility, dates and conditions. Publishing a post does not change checkout prices."></textarea></label><div class="fmv-flex"><button type="submit" class="fmv-btn">Upload & publish</button><button class="fmv-btn secondary" type="button" data-admin-action="cancel-campaign">Cancel</button></div></form><div id="fmv-campaign-list" class="fmv-admin-campaign-grid"></div><details class="fmv-company-pages"><summary>Help, policies & company pages</summary><p class="fmv-small">Publish your company’s approved information here. Customers can open each page from Profile.</p><form id="fmv-company-page-form" class="fmv-editor-form"><label>Page<select id="fmv-company-page-slug" name="slug">${Object.entries(pageTitles).map(([slug,title])=>`<option value="${slug}">${title}</option>`).join('')}</select></label><label>Title<input name="title" maxlength="120" required></label><label>Page content<textarea name="body" rows="9" maxlength="20000" required></textarea></label><button type="submit" class="fmv-btn">Publish company page</button></form></details>`;
    dashboard.append(marketing);groupAdminPanels();syncAdminNavigation();
    $('fmv-invitation-form').addEventListener('submit',createInvitation);
    $('fmv-campaign-form').addEventListener('submit',saveCampaign);
    $('fmv-company-page-form').addEventListener('submit',savePage);
    $('fmv-company-page-slug').addEventListener('change',loadPageForm);
    $('fmv-campaign-file').addEventListener('change',previewLocalFile);
    $('fmv-campaign-form').elements.status.addEventListener('change',()=>{$('fmv-campaign-form').querySelector('[type=submit]').textContent=$('fmv-campaign-form').elements.status.value==='draft'?'Upload & save draft':'Upload & publish';});
    document.addEventListener('click',event=>FMV.guard(()=>click(event)));
  }

  async function createInvitation(event){
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;
    try{
      const result=await FMV.request('/admin/invitations',{method:'POST',body:{email:form.elements.email.value.trim(),role:form.elements.role.value}});
      $('fmv-invitation-code').value=result.invitation;$('fmv-invitation-result').hidden=false;FMV.notice(result.message);await refreshInvitations();
    }catch(error){FMV.notice(error.message,true);}finally{button.disabled=false;}
  }

  async function refreshInvitations(){
    if(FMV.user?.role!=='super_admin')return;
    const [result,mail]=await Promise.all([FMV.request('/admin/invitations'),FMV.request('/admin/mail-outbox')]);
    $('fmv-invitation-list').innerHTML=result.invitations.slice().reverse().map(i=>`<div class="fmv-row"><div><strong>${e(i.email)}</strong><p class="fmv-small">${e(i.role.replaceAll('_',' '))} · Expires ${e(new Date(i.expires_at*1000).toLocaleString())}</p></div><span class="fmv-publish-tag">${e(i.status)}</span></div>`).join('') || FMV.empty('No invitations yet. Create the first one above.');
    $('fmv-content-editors').innerHTML=result.staff.map(u=>`<div class="fmv-row"><div><strong>${e(u.full_name)}</strong><p class="fmv-small">${e(u.email)} · ${e(u.role.replaceAll('_',' '))}</p></div>${['super_admin','content_manager'].includes(u.role)?'<span class="fmv-publish-tag">Publishing access</span>':`<button class="fmv-btn secondary" data-admin-action="toggle-editor" data-id="${e(u.id)}" data-enabled="${u.content_editor===true?'false':'true'}">${u.content_editor===true?'Remove editor access':'Designate editor'}</button>`}</div>`).join('');
    $('fmv-mail-status').innerHTML=mail.messages.slice().reverse().map(m=>`<div class="fmv-row"><div><strong>${e(m.kind.replaceAll('_',' '))}</strong><p class="fmv-small">${e(m.to)} · Attempts ${m.attempts}${m.last_error?'<br>'+e(m.last_error):''}</p></div><span class="fmv-publish-tag" data-state="${e(m.status)}">${e(m.status)}</span></div>`).join('') || FMV.empty('No order or invitation emails queued yet.');
  }

  function mediaPreview(url,mime,title){
    $('fmv-campaign-preview').replaceChildren();if(!url)return;
    const element=document.createElement(mime==='video/mp4'?'video':'img');
    if(element instanceof HTMLVideoElement){element.controls=true;element.muted=true;element.playsInline=true;element.preload='metadata';}else element.alt=title || 'Campaign preview';
    element.src=url;
    $('fmv-campaign-preview').append(element);
  }
  let previewURL='';
  function previewLocalFile(){
    const file=$('fmv-campaign-file').files?.[0];if(!file)return;
    try{window.FMVUpload.validate(file);}catch(error){FMV.notice(error.message,true);$('fmv-campaign-file').value='';return;}
    if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(file);mediaPreview(previewURL,file.type,file.name);
  }
  function editCampaign(id){
    const item=campaigns.find(c=>c.id===id);editing=item || null;mediaId=item?.media_id || '';
    const form=$('fmv-campaign-form');form.reset();form.hidden=false;
    $('fmv-campaign-form-title').textContent=item?'Edit campaign':'New campaign';
    if(item){
      for(const key of ['title','description','kind','placement','status','alt_text','animation','cta_label','cta_path','terms','sort_order'])form.elements[key].value=item[key];
      for(const [key,value] of Object.entries({display_width:item.display_width || 1200,display_height:item.display_height || 300,media_fit:item.media_fit || 'contain'}))form.elements[key].value=value;
      for(const key of ['starts_at','ends_at']){if(item[key]){const date=new Date(item[key]);const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);form.elements[key].value=local.toISOString().slice(0,16);}}
    }
    form.querySelector('[type=submit]').textContent=form.elements.status.value==='draft'?'Upload & save draft':'Upload & publish';
    mediaPreview(item?.media_url?FMV.apiBase+item.media_url:'',item?.mime_type,item?.title);
    form.elements.title.focus();form.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  function payloadFor(item){return Object.fromEntries(['title','description','kind','placement','status','media_id','alt_text','animation','cta_label','cta_path','terms','starts_at','ends_at','sort_order','version','display_width','display_height','media_fit'].map(k=>[k,item[k]]));}
  async function saveCampaign(event){
    event.preventDefault();if(busy)return;busy=true;const form=event.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;button.textContent='Saving…';
    try{
      if($('fmv-campaign-file').files?.length){
        const file=$('fmv-campaign-file').files[0];
        const progressBox=$('fmv-campaign-upload-status');
        const progress=$('fmv-campaign-upload-progress');
        const caption=$('fmv-campaign-upload-text');
        progressBox.hidden=false;progress.value=0;
        const asset=await window.FMVUpload.upload(file,{onProgress:(sent,total)=>{
          const percent=Math.round(sent/total*100);
          button.textContent='Uploading '+percent+'%';
          caption.textContent=file.name+' · '+percent+'% uploaded';
          progress.value=percent;
        }});
        caption.textContent='Upload validated. Publishing promotion…';
        mediaId=asset.id;
      }
      const body=Object.fromEntries(['title','description','kind','placement','status','alt_text','animation','cta_label','cta_path','terms'].map(k=>[k,form.elements[k].value.trim()]));
      body.display_width=Number(form.elements.display_width.value);body.display_height=Number(form.elements.display_height.value);body.media_fit=form.elements.media_fit.value;body.media_id=mediaId;body.sort_order=Number(form.elements.sort_order.value);body.version=editing?.version || null;
      for(const key of ['starts_at','ends_at'])body[key]=form.elements[key].value?new Date(form.elements[key].value).toISOString():'';
      await FMV.request('/admin/content'+(editing?'/'+encodeURIComponent(editing.id):''),{method:editing?'PATCH':'POST',body});
      form.hidden=true;FMV.notice(body.status==='draft'?'Draft saved.':'Published. Customers will see the update automatically.');await refreshCampaigns();
    }catch(error){FMV.notice(error.message,true);}finally{busy=false;button.disabled=false;button.textContent=form.elements.status.value==='draft'?'Upload & save draft':'Upload & publish';}
  }
  async function refreshCampaigns(){
    if(!mayPublish())return;
    const result=await FMV.request('/admin/content');campaigns=result.campaigns;
    $('fmv-campaign-list').innerHTML=campaigns.slice().sort((a,b)=>a.sort_order-b.sort_order).map(c=>`<article class="fmv-admin-campaign"><div class="fmv-admin-campaign-media">${c.media_url?(c.mime_type==='video/mp4'?`<video src="${e(FMV.apiBase+c.media_url)}" controls muted preload="metadata" aria-label="${e(c.title)}"></video>`:`<img src="${e(FMV.apiBase+c.media_url)}" alt="${e(c.alt_text || c.title)}" loading="lazy">`):'<span aria-hidden="true">FMV.</span>'}</div><div class="fmv-admin-campaign-copy"><span class="fmv-publish-tag" data-state="${e(c.status)}">${e(c.status)} · ${e(c.placement)} · ${Number(c.display_width) || 1200} × ${Number(c.display_height) || 300}px</span><h4>${e(c.title)}</h4><p>${e(c.description)}</p><div class="fmv-flex"><button class="fmv-btn" data-admin-action="edit-campaign" data-id="${e(c.id)}">Edit</button><button class="fmv-btn secondary" data-admin-action="toggle-campaign" data-id="${e(c.id)}">${c.status==='published'?'Unpublish':'Publish'}</button><button class="fmv-btn danger" data-admin-action="delete-campaign" data-id="${e(c.id)}">Remove</button></div></div></article>`).join('') || FMV.empty('No campaigns yet. Choose Add ad or post to publish your first banner.');
  }

  function loadPageForm(){
    const form=$('fmv-company-page-form'),slug=form.elements.slug.value;
    form.elements.title.value=pages[slug]?.title || pageTitles[slug];form.elements.body.value=pages[slug]?.body || '';
  }
  async function savePage(event){
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;
    try{const result=await FMV.request('/admin/pages/'+form.elements.slug.value,{method:'PATCH',body:{title:form.elements.title.value.trim(),body:form.elements.body.value.trim()}});pages[form.elements.slug.value]=result.page;FMV.notice('Company page published.');}catch(error){FMV.notice(error.message,true);}finally{button.disabled=false;}
  }
  async function refresh(){
    if(!FMV.user || !['marketing','invitations'].includes(fmvAdminActiveTab))return;
    // Permission changes are checked from the server, not cached role choices.
    const session=await FMV.request('/auth/session');Object.assign(FMV.user,session.user);syncAdminNavigation();
    if(fmvAdminActiveTab==='marketing' && mayPublish()){
      await refreshCampaigns();
      const result=await FMV.request('/admin/pages');pages=result.pages;
      if(!document.activeElement?.closest('#fmv-company-page-form'))loadPageForm();
    }
    if(fmvAdminActiveTab==='invitations' && FMV.user.role==='super_admin')await refreshInvitations();
  }

  async function click(event){
    const button=event.target.closest('[data-admin-action]');if(!button || button.disabled)return;
    const action=button.dataset.adminAction,id=button.dataset.id;
    if(action==='new-campaign' || action==='edit-campaign'){editCampaign(id);return;}
    if(action==='cancel-campaign'){$('fmv-campaign-form').hidden=true;return;}
    if(action==='remove-media'){mediaId='';$('fmv-campaign-file').value='';mediaPreview('');return;}
    if(action==='copy-invitation'){
      try{await navigator.clipboard.writeText($('fmv-invitation-code').value);FMV.notice('Private invitation copied.');}catch(error){$('fmv-invitation-code').select();FMV.notice('Select and copy the private code.');}return;
    }
    button.disabled=true;
    try{
      if(action==='refresh-invitations'){await refreshInvitations();return;}
      if(action==='toggle-editor'){await FMV.request('/admin/content-editors/'+encodeURIComponent(id),{method:'PATCH',body:{enabled:button.dataset.enabled==='true'}});await refreshInvitations();return;}
      if(action==='dispatch-status'){await FMV.request('/admin/deliveries/'+encodeURIComponent(id)+'/status',{method:'PATCH',body:{status:button.dataset.status}});FMV.notice(button.dataset.status+'. Customer email queued.');await loadAdminDeliveries();return;}
      if(action==='delete-campaign'){
        if(!confirm('Remove this campaign from the customer portal?'))return;
        await FMV.request('/admin/content/'+encodeURIComponent(id),{method:'DELETE'});await refreshCampaigns();return;
      }
      if(action==='toggle-campaign'){
        const item=campaigns.find(c=>c.id===id);if(!item)return;
        const body=payloadFor(item);body.status=item.status==='published'?'draft':'published';
        await FMV.request('/admin/content/'+encodeURIComponent(id),{method:'PATCH',body});await refreshCampaigns();return;
      }
    }finally{button.disabled=false;}
  }
  document.addEventListener('DOMContentLoaded',build);
  document.addEventListener('fmv:authenticated',()=>FMV.guard(refresh));
  document.addEventListener('fmv:sync',()=>FMV.guard(refresh));
  document.addEventListener('fmv:admin-tab',()=>FMV.guard(refresh));
  document.addEventListener('fmv:locked',()=>{
    campaigns=[];pages={};editing=null;mediaId='';busy=false;
    for(const id of ['fmv-invitation-form','fmv-campaign-form','fmv-company-page-form'])$(id)?.reset();
    if($('fmv-invitation-code'))$('fmv-invitation-code').value='';
    for(const id of ['fmv-invitation-result','fmv-campaign-form'])if($(id))$(id).hidden=true;
    for(const id of ['fmv-invitation-list','fmv-content-editors','fmv-mail-status','fmv-campaign-list','fmv-campaign-preview'])$(id)?.replaceChildren();
    if(previewURL)URL.revokeObjectURL(previewURL);
  });
  window.inviteAdministrator=()=>{if(FMV.user?.role!=='super_admin')return;document.getElementById('rbac-matrix-modal').classList.add('hidden');selectAdminTab('invitations');$('fmv-invitation-form').elements.email.focus();};
})();
