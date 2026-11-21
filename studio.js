/* FMV staff studio: knowledge publishing, website blocks and merchant payments. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=s=>FMV.escape(s);
  const api=(path,options)=>FMV.request(path,options);
  const editable=()=>FMV.user?.portal==='admin' &&
    (['super_admin','content_manager'].includes(FMV.user.role) || FMV.user.content_editor===true);
  let knowledge=[],website=null,upi=null,editingId=null,sections=[];
  const copyFields=[
    ['topline','Top announcement'],['hero_title','Hero headline'],['hero_description','Hero description'],
    ['products_title','Product section headline'],['products_description','Product section description'],
    ['why_title','Why First Milk headline'],['why_description','Why First Milk description'],
    ['how_title','How it works headline'],['how_description','How it works description'],
    ['story_title','Our story headline'],['story_description','Our story description'],
    ['contact_title','Contact headline'],['contact_description','Contact description'],
    ['footer_note','Footer message'],['careers_title','Careers headline'],
    ['careers_description','Careers description']
  ];
  const rowLabel=(name,value='',tag='input')=>
    `<label class="fmv-studio-label">${esc(name)}${tag==='textarea'
      ?`<textarea rows="3">${esc(value)}</textarea>`
      :`<input maxlength="1200" value="${esc(value)}">`}</label>`;
  function build(){
    const dash=$('staff-dashboard'),nav=$('fmv-admin-nav');if(!dash||!nav)return;
    for(const [tab,label,symbol] of [['website','Web Design','✦'],['assistant','Chatbot','✺'],['upi','Payment','₹']]){
      const btn=document.createElement('button');btn.type='button';btn.id='fmv-admin-tab-'+tab;
      btn.dataset.adminTab=tab;btn.setAttribute('aria-controls','fmv-admin-panel-'+tab);
      btn.innerHTML='<span class="fmv-admin-nav-symbol" aria-hidden="true">'+symbol+'</span><span>'+label+'</span>';nav.append(btn);
    }
    const studio=document.createElement('section');studio.dataset.adminPanel='website';studio.className='fmv-panel fmv-studio';
    studio.innerHTML=`<header><span class="admin-eyebrow">COMPANY WEBSITE DESIGNING</span><h3>Design your First Milk Venture website</h3>
      <p>Update headlines, paragraphs, hero artwork, animated GIFs or video and add reusable sections for your homepage or careers page. Changes publish to the website without editing HTML.</p></header>
      <form id="fmv-site-form" class="fmv-studio-form">
        <h4>Site text and presentation</h4><div id="fmv-site-fields" class="fmv-studio-grid"></div>
        <div class="fmv-studio-grid">
          <label class="fmv-studio-label">Hero image, GIF or MP4 <input id="fmv-site-media" type="file" data-media-max-bytes="50000000" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4"><small>JPG, PNG, GIF, WebP or MP4 • up to 50 MB per file. Uploads are validated and transferred securely in resumable parts; for faster website loads use compressed images and short videos.</small></label>
          <label class="fmv-studio-label">Media fit<select name="media_fit"><option value="cover">Cover</option><option value="contain">Contain</option></select></label>
          <label class="fmv-studio-label">Brand background colour<input name="background_color" type="color" value="#103f36"></label>
        </div><div id="fmv-website-preview" class="fmv-studio-preview"></div>
        <div id="fmv-website-upload-state" class="fmv-media-upload-state" role="status" hidden>
          <span id="fmv-website-upload-text">Ready to upload</span><progress id="fmv-website-upload-progress" max="100" value="0"></progress>
        </div>
        <h4>Custom website sections</h4><p>Add any number of new content sections up to 24, with optional artwork and location on the homepage or Careers.</p>
        <button type="button" class="fmv-btn secondary" data-studio="add-block">+ Add website section</button>
        <div id="fmv-site-sections"></div>
        <div class="fmv-flex"><button class="fmv-btn" type="submit">Publish website changes</button>
        <a class="fmv-btn secondary" href="https://www.firstmilkventure.com/" target="_blank" rel="noopener noreferrer">View live website</a></div>
        <p class="fmv-small" id="fmv-site-message" role="status"></p>
      </form>`;
    const assistant=document.createElement('section');assistant.dataset.adminPanel='assistant';assistant.className='fmv-panel fmv-studio';
    assistant.innerHTML=`<header><span class="admin-eyebrow">APPROVED COMPANY KNOWLEDGE</span><h3>Train FMV AI</h3>
      <p>All customer, driver and admin chatbots use these published answers together with live Terms & Conditions, Privacy and Refund policies. Unpublished drafts never reach customers.</p></header>
      <form id="fmv-knowledge-form" class="fmv-studio-form">
        <label class="fmv-studio-label">Topic / customer question<input name="title" required minlength="3" maxlength="120" placeholder="Milk return eligibility"></label>
        <label class="fmv-studio-label">Company-approved answer<textarea name="body" required rows="6" minlength="5" maxlength="8000"></textarea></label>
        <label class="fmv-studio-label">Publication<select name="status"><option value="draft">Draft — internal only</option><option value="published">Published — visible to the chatbot</option></select></label>
        <div class="fmv-flex"><button type="submit" class="fmv-btn">Save knowledge</button><button type="button" class="fmv-btn secondary" data-studio="new-article">New article</button></div>
      </form>
      <h4>Published and draft articles</h4><div id="fmv-knowledge-list"></div>
      <div class="fmv-studio-preview"><h4>Test FMV AI</h4>
        <form id="fmv-admin-chat-form" class="fmv-studio-inline"><input name="question" maxlength="1200" required placeholder="Ask about delivery or company policy"><button class="fmv-btn" type="submit">Ask</button></form>
        <p id="fmv-admin-chat-reply" role="status"></p></div>
      <p class="fmv-small">Publishing Terms & Conditions, Privacy or Refund Policy in Ads & offers → Company pages automatically refreshes the chatbot's approved information.</p>`;
    const upiBox=document.createElement('section');upiBox.dataset.adminPanel='upi';upiBox.className='fmv-panel fmv-studio';
    upiBox.innerHTML=`<header><span class="admin-eyebrow">SUPER ADMIN ONLY</span><h3>Receiving UPI account</h3><p>Only the super administrator can change the UPI payee. Confirm a receiving account with your bank before enabling. Customer declarations never count as confirmed payment.</p></header>
      <form id="fmv-upi-form" class="fmv-studio-form"><label class="fmv-studio-label">Receiving UPI ID<input name="upi_id" required maxlength="145" placeholder="merchant@bank"></label>
      <label class="fmv-studio-label">Payee display name<input name="payee_name" required maxlength="100" placeholder="First Milk Venture"></label>
      <label class="fmv-studio-label fmv-check"><input name="enabled" type="checkbox"> Enable UPI for customers</label>
      <button class="fmv-btn" type="submit">Save receiving UPI settings</button></form>
      <h4>Pending UPI confirmations</h4><div id="fmv-upi-transfers"></div>
      <p class="fmv-small">A manually confirmed transfer is NOT automatically applied to an order or invoice. Reconcile it in your accounts with the official bank statement.</p>`;
    dash.append(studio,assistant,upiBox);
    groupAdminPanels();syncAdminNavigation();
    $('fmv-site-form').addEventListener('submit',saveWebsite);
    $('fmv-knowledge-form').addEventListener('submit',saveArticle);
    $('fmv-admin-chat-form').addEventListener('submit',chat);
    $('fmv-upi-form').addEventListener('submit',saveUPI);
    document.addEventListener('click',click);
  }
  async function upload(id){
    const file=$(id)?.files?.[0];if(!file)return '';
    const status=$('fmv-site-message');
    const box=$('fmv-website-upload-state'),progress=$('fmv-website-upload-progress');
    const caption=$('fmv-website-upload-text');
    box.hidden=false;progress.value=0;
    const asset=await window.FMVUpload.upload(file,{onProgress:(sent,total)=>{
      const percent=Math.round(100*sent/total);
      if(status)status.textContent='Uploading '+file.name+': '+percent+'%';
      if(caption)caption.textContent=file.name+' · '+percent+'% uploaded';
      if(progress)progress.value=percent;
    }});
    if(status)status.textContent='Media uploaded and validated: '+file.name;
    return asset.id;
  }
  function renderSections(){
    $('fmv-site-sections').innerHTML=sections.map((b,index)=>`<article class="fmv-studio-block" data-block="${esc(b.id)}">
      <div class="fmv-flex"><strong>Section ${index+1}</strong><button type="button" class="fmv-btn secondary" data-studio="remove-block" data-index="${index}">Remove</button></div>
      <div class="fmv-studio-grid">
        <label class="fmv-studio-label">Page<select data-key="page"><option value="home" ${b.page==='home'?'selected':''}>Homepage</option><option value="careers" ${b.page==='careers'?'selected':''}>Careers</option></select></label>
        <label class="fmv-studio-label">Section location<select data-key="placement">${['after-hero','after-products','after-why','before-footer'].map(x=>`<option value="${x}" ${b.placement===x?'selected':''}>${x.replaceAll('-',' ')}</option>`).join('')}</select></label>
        <label class="fmv-studio-label">Visual style<select data-key="variant">${['feature','banner','quote','cta'].map(x=>`<option value="${x}" ${b.variant===x?'selected':''}>${x}</option>`).join('')}</select></label>
        <label class="fmv-studio-label">Headline<input required maxlength="160" data-key="title" value="${esc(b.title)}"></label>
      </div><label class="fmv-studio-label">Text<textarea data-key="body" rows="3" maxlength="1400">${esc(b.body)}</textarea></label>
      <label class="fmv-studio-label">Optional new image / GIF / video<input id="fmv-block-media-${index}" type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4" data-media-max-bytes="50000000"><small>Max 50 MB • background upload in 2 MB parts</small></label>
      ${b.media_url?`<p class="fmv-small">Media: ${esc(b.media_url)}</p>`:''}
    </article>`).join('');
  }
  function readSections(){sections=Array.from($('fmv-site-sections').children).map((el,index)=>({
    ...sections[index],...Object.fromEntries(Array.from(el.querySelectorAll('[data-key]')).map(x=>[x.dataset.key,x.value]))
  }));}
  async function loadWebsite(){
    if(!editable())return;
    website=await api('/admin/website');
    for(const [field,label] of copyFields){
      let area=$('fmv-site-fields').querySelector('[data-copy="'+field+'"]');
      if(!area){area=document.createElement('label');area.className='fmv-studio-label';area.dataset.copy=field;
        const title=document.createElement('span');title.textContent=label;
        const input=document.createElement('textarea');input.rows=field.includes('description')?3:2;
        input.maxLength=1200;area.append(title,input);$('fmv-site-fields').append(area);}
      area.querySelector('textarea').value=website.copy?.[field] || '';
    }
    $('fmv-site-form').elements.media_fit.value=website.media_fit || 'cover';
    $('fmv-site-form').elements.background_color.value=website.background_color || '#103f36';
    sections=(website.blocks || []).map(b=>({...b}));
    renderSections();
    $('fmv-website-preview').replaceChildren();
    const p=document.createElement('p');
    p.textContent=website.media_url?'Published hero: '+website.media_type+' — '+website.media_url:'No custom hero image or video published.';
    $('fmv-website-preview').append(p);
  }
  async function saveWebsite(ev){
    ev.preventDefault();const form=ev.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;
    try{
      readSections();const blocks=[];
      for(let i=0;i<sections.length;i++){
        const b={...sections[i]};
        if($('fmv-block-media-'+i)?.files?.length)b.media_id=await upload('fmv-block-media-'+i);
        delete b.media_type;delete b.media_url;blocks.push(b);
      }
      const media_id=await upload('fmv-site-media') || website.media_id || '';
      const copy=Object.fromEntries(copyFields.map(([key])=>[key,$('fmv-site-fields').querySelector('[data-copy="'+key+'"] textarea').value]));
      website=await api('/admin/website',{method:'PATCH',body:{copy,blocks,media_id,
        media_fit:form.elements.media_fit.value,background_color:form.elements.background_color.value,version:website.version}});
      FMV.notice('Website content published. Refresh the live site to view changes.');await loadWebsite();
    }catch(error){FMV.notice(error.message,true);}finally{button.disabled=false;}
  }
  function articles(){const parent=$('fmv-knowledge-list');parent.innerHTML=knowledge.map(item=>`<div class="fmv-row">
    <div><strong>${esc(item.title)}</strong><p class="fmv-small">${esc(item.status)} · version ${item.version} · updated ${esc(item.updated_at || '')}</p></div>
    <button type="button" class="fmv-btn secondary" data-studio="edit-article" data-id="${esc(item.id)}">Edit</button>
  </div>`).join('') || FMV.empty('No articles. Create a company-approved answer.');
  }
  async function loadKnowledge(){if(!editable())return;const response=await api('/admin/assistant/knowledge');knowledge=response.items;articles();}
  function selectArticle(id){
    editingId=id;const item=knowledge.find(x=>x.id===id);const form=$('fmv-knowledge-form');form.reset();
    if(item){for(const key of ['title','body','status'])form.elements[key].value=item[key];}
    form.querySelector('[type=submit]').textContent=item?'Update knowledge':'Save knowledge';
  }
  async function saveArticle(ev){
    ev.preventDefault();const form=ev.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;
    try{const item=knowledge.find(x=>x.id===editingId);
      await api('/admin/assistant/knowledge'+(item?'/'+encodeURIComponent(item.id):''),
        {method:item?'PATCH':'POST',body:{title:form.elements.title.value,body:form.elements.body.value,
          status:form.elements.status.value,version:item?.version || null}});
      FMV.notice('Knowledge saved. Published articles are immediately available to all chatbots.');
      await loadKnowledge();selectArticle(null);
    }catch(error){FMV.notice(error.message,true);}finally{button.disabled=false;}
  }
  async function chat(ev){ev.preventDefault();const box=$('fmv-admin-chat-reply');box.textContent='Checking approved information…';
    try{const r=await api('/assistant/chat',{method:'POST',body:{message:ev.currentTarget.elements.question.value}});
      box.textContent=r.reply+'\nSources: '+r.sources.map(x=>x.title).join(', ');
    }catch(error){box.textContent=error.message;}
  }
  async function loadUPI(){if(FMV.user?.role!=='super_admin')return;
    upi=await api('/admin/payment/upi');
    for(const key of ['upi_id','payee_name'])$('fmv-upi-form').elements[key].value=upi.settings?.[key] || '';
    $('fmv-upi-form').elements.enabled.checked=!!upi.settings?.enabled;
    const transfers=upi.transfers || [];
    $('fmv-upi-transfers').innerHTML=transfers.slice().reverse().slice(0,70).map(p=>`<div class="fmv-row">
      <div><strong>${esc(p.id)} · ₹${esc(p.amount)}</strong><p class="fmv-small">${esc(p.owner)} · ${esc(p.status)}
        ${p.customer_reference?' · customer ref '+esc(p.customer_reference):''}</p></div>
      ${p.status==='reported'?`<button type="button" class="fmv-btn secondary" data-studio="confirm-transfer" data-id="${esc(p.id)}">Reconcile after bank check</button>`:''}
    </div>`).join('') || FMV.empty('No UPI transfer intents recorded.');
  }
  async function saveUPI(ev){
    ev.preventDefault();if(FMV.user?.role!=='super_admin')return;
    const form=ev.currentTarget,button=form.querySelector('[type=submit]');button.disabled=true;
    try{await api('/admin/payment/upi',{method:'PATCH',body:{upi_id:form.elements.upi_id.value,
      payee_name:form.elements.payee_name.value,enabled:form.elements.enabled.checked}});
      FMV.notice('Receiving UPI settings saved.');await loadUPI();
    }catch(error){FMV.notice(error.message,true);}finally{button.disabled=false;}
  }
  async function click(ev){
    const button=ev.target.closest('[data-studio]');if(!button)return;
    const action=button.dataset.studio;
    if(action==='add-block'){readSections();sections.push({id:'section-'+crypto.randomUUID(),
      page:'home',placement:'after-products',variant:'feature',title:'Fresh news',body:'',media_id:''});renderSections();return;}
    if(action==='remove-block'){readSections();sections.splice(Number(button.dataset.index),1);renderSections();return;}
    if(action==='new-article'){selectArticle(null);return;}
    if(action==='edit-article'){selectArticle(button.dataset.id);$('fmv-knowledge-form').scrollIntoView();return;}
    if(action==='confirm-transfer'){
      if(FMV.user?.role!=='super_admin')return;
      const p=upi?.transfers.find(t=>t.id===button.dataset.id);
      const ref=prompt('Enter reference shown in your official bank statement:');
      if(!ref)return;
      const amount=prompt('Enter the exact bank-received amount in INR:',p?.amount || '');
      if(!amount)return;
      button.disabled=true;
      try{await api('/admin/payment/upi/'+encodeURIComponent(button.dataset.id)+'/confirm',
        {method:'POST',body:{bank_reference:ref,verified_amount:amount}});
        FMV.notice('Manual reconciliation recorded. This does not mark an invoice paid.');await loadUPI();
      }catch(error){FMV.notice(error.message,true);}finally{button.disabled=false;}
    }
  }
  async function refresh(){
    const tab=document.querySelector('#fmv-admin-nav [aria-current="page"]')?.dataset.adminTab;
    if(tab==='website')await loadWebsite();
    if(tab==='assistant')await loadKnowledge();
    if(tab==='upi')await loadUPI();
  }
  document.addEventListener('DOMContentLoaded',build);
  document.addEventListener('fmv:authenticated',()=>FMV.guard(async()=>{syncAdminNavigation();await refresh();}));
  document.addEventListener('fmv:admin-tab',()=>FMV.guard(refresh));
  document.addEventListener('fmv:locked',()=>{knowledge=[];website=null;upi=null;sections=[];editingId=null;});
})();