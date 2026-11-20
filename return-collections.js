/* First Milk Venture secure Return Pickup management for authorized staff. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=x=>FMV.escape(x??'');
  const api=(path,options)=>FMV.request(path,options);
  const canManage=()=>FMV.user?.portal==='admin' &&
    (['super_admin','operations_manager'].includes(FMV.user.role)||FMV.user.driver_manager===true);
  let snapshot=null,loading=null,dirty=false;
  const today=()=>{
    try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',
      year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
    catch(error){return new Date().toISOString().slice(0,10);}
  };
  const label=status=>String(status||'').replaceAll('_',' ');
  function build(){
    const dashboard=$('staff-dashboard'),nav=$('fmv-admin-nav');if(!dashboard||!nav)return;
    const tab=document.createElement('button');tab.type='button';tab.id='fmv-admin-tab-returns';
    tab.dataset.adminTab='returns';tab.setAttribute('aria-controls','fmv-admin-panel-returns');
    tab.innerHTML='<span class="fmv-admin-nav-symbol" aria-hidden="true">↩</span><span>Return Pickup</span>';
    nav.append(tab);
    const section=document.createElement('section');section.className='fmv-panel fmv-return-workspace';
    section.dataset.adminPanel='returns';
    section.innerHTML=`<header><span class="admin-eyebrow">RETURN COLLECTION MANAGEMENT</span>
      <h3>Return pickups & driver assignments</h3>
      <p>Review customer return requests, assign approved drivers, track verified collection and receive items into quarantine. Financial refunds remain a separate finance-only process.</p>
    </header>
    <form id="fmv-return-settings" class="fmv-return-settings fmv-studio-form" hidden>
      <div class="fmv-flex"><h4>Collection settings</h4><span class="fmv-small" id="fmv-return-settings-version"></span></div>
      <label class="fmv-studio-label fmv-check"><input type="checkbox" name="enabled"> Enable new return collection assignments</label>
      <div class="fmv-studio-grid">
        <label class="fmv-studio-label">Maximum days ahead for collection<input name="pickup_window_days" type="number" min="1" max="30" required></label>
        <label class="fmv-studio-label">Maximum pending collections per driver<input name="max_active_pickups_per_driver" type="number" min="1" max="60" required></label>
      </div>
      <label class="fmv-studio-label">Customer pickup instructions<textarea name="instructions" minlength="10" maxlength="800" rows="3" required></textarea></label>
      <p class="fmv-small">Pickup verification always requires a six-digit customer code. The manager cannot disable the security code. Returned dairy stock is never automatically restocked.</p>
      <button type="submit" class="fmv-btn">Save collection settings</button>
    </form>
    <div class="fmv-flex"><h4>Return requests & collection queue</h4><button class="fmv-btn secondary" type="button" id="fmv-return-reload">Refresh</button></div>
    <p class="fmv-small" id="fmv-return-message" role="status">Open this tab to load the current return requests.</p>
    <div class="fmv-return-queue" id="fmv-return-queue"></div>`;
    dashboard.append(section);
    $('fmv-return-settings').addEventListener('submit',saveSettings);
    $('fmv-return-reload').addEventListener('click',()=>FMV.guard(()=>load(true)));
    $('fmv-return-queue').addEventListener('click',e=>FMV.guard(()=>click(e)));
    $('fmv-return-queue').addEventListener('submit',e=>FMV.guard(()=>submit(e)));
    groupAdminPanels();syncAdminNavigation();
  }
  function renderSettings(){
    const form=$('fmv-return-settings');if(!form||!snapshot)return;
    form.hidden=false;
    const cfg=snapshot.settings;form.elements.enabled.checked=!!cfg.enabled;
    for(const field of ['pickup_window_days','max_active_pickups_per_driver','instructions'])
      form.elements[field].value=cfg[field];
    $('fmv-return-settings-version').textContent='Version '+cfg.version;
  }
  function pickupCard(c){
    const record=c.collection,canReview=c.status==='under_review';
    const scheduled=record?.status==='scheduled';
    const collected=record?.status==='collected';
    const canAssign=c.claim_type==='return' && c.status==='approved' &&
      (!record || ['scheduled','cancelled'].includes(record.status));
    const canReceive=collected && c.status==='approved';
    const date=record?.scheduled_date || today();
    const driverOptions=(snapshot.drivers||[]).map(d=>`<option value="${esc(d.id)}"
      ${record?.driver_id===d.id?'selected':''}>${esc(d.name)}${d.zone?' · '+esc(d.zone):''}</option>`).join('');
    const actionButtons=canReview?`<div class="fmv-flex">
      <button class="fmv-btn" type="button" data-return-action="approve" data-return-id="${esc(c.id)}">Approve return</button>
      <button class="fmv-btn secondary" type="button" data-return-action="reject" data-return-id="${esc(c.id)}">Reject</button>
    </div>`:'';
    const assignForm=canAssign?`<form class="fmv-return-assignment" data-return-submit="assign" data-return-id="${esc(c.id)}">
      <h5>${record?.status==='scheduled'?'Reassign collection':'Assign a collection driver'}</h5>
      <div class="fmv-studio-grid">
        <label class="fmv-studio-label">Approved driver<select name="driver_id" required><option value="">Select driver</option>${driverOptions}</select></label>
        <label class="fmv-studio-label">Collection date<input type="date" name="scheduled_date" required value="${esc(date)}" min="${esc(today())}"></label>
      </div>
      <label class="fmv-studio-label">Driver collection notes<textarea name="note" rows="2" maxlength="700" placeholder="Pickup details (optional)"></textarea></label>
      <button class="fmv-btn" type="submit">${scheduled?'Update assignment':'Assign driver'}</button>
      ${scheduled?`<button class="fmv-btn secondary" type="button" data-return-action="cancel" data-return-id="${esc(c.id)}">Cancel pickup</button>`:''}
    </form>`:'';
    const receiveForm=canReceive?`<form class="fmv-return-receipt" data-return-submit="receive" data-return-id="${esc(c.id)}">
      <h5>Warehouse receiving inspection</h5>
      <div class="fmv-studio-grid"><label class="fmv-studio-label">Condition at receipt<select name="condition" required>
        <option value="sealed">Sealed</option><option value="opened">Opened</option>
        <option value="damaged">Damaged</option><option value="other">Other</option></select></label>
        <label class="fmv-studio-label">Inventory disposition<select name="disposition" required>
        <option value="quarantine">Quarantine</option><option value="inspection_pending">Inspection pending</option>
        <option value="dispose">Dispose</option></select></label></div>
      <label class="fmv-studio-label">Inspection note<textarea name="note" maxlength="700" rows="2"></textarea></label>
      <button type="submit" class="fmv-btn">Confirm warehouse receipt</button>
    </form>`:'';
    return `<article class="fmv-return-case">
      <div class="fmv-flex"><strong>${esc(c.id)}</strong><span class="fmv-return-state">${esc(label(c.status))}</span></div>
      <p><strong>${esc(c.order_number)}</strong> · ${esc(c.claim_type)} request</p>
      <p class="fmv-small">${esc(c.reason)}</p>
      <p class="fmv-small">Customer: ${esc(c.customer_email)}</p>
      <p class="fmv-small">Pickup address: ${esc(c.pickup_address || 'See customer order details')}</p>
      ${record?`<div class="fmv-return-pickup-status"><strong>Collection: ${esc(label(record.status))}</strong>
        <span>Driver: ${esc(record.driver_name || 'Not assigned')}</span>
        <span>Scheduled: ${esc(record.scheduled_date || '—')}</span>
        ${record.collected_at?`<span>Collected: ${esc(record.collected_at)}</span>`:''}
        ${record.received_at?`<span>Received: ${esc(record.received_at)}</span>`:''}</div>`:''}
      ${actionButtons}${assignForm}${receiveForm}
      ${c.claim_type==='refund'?'<p class="fmv-small">Refund-only requests do not require physical item collection. Finance controls payment refunds.</p>':''}
    </article>`;
  }
  function render(){
    if(!snapshot)return;
    renderSettings();
    const claims=(snapshot.claims||[]).slice().sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
    $('fmv-return-queue').innerHTML=claims.map(pickupCard).join('') ||
      '<p class="fmv-small">No return or refund requests have been submitted.</p>';
    $('fmv-return-message').textContent=claims.length+' return/refund requests · '+(snapshot.drivers||[]).length+' approved drivers';
  }
  async function load(force=false){
    if(!canManage())return;
    if(loading)return loading;
    if(snapshot && !force){render();return;}
    loading=(async()=>{
      const owner=FMV.user?.id;
      const data=await api('/admin/return-collections');
      if(FMV.user?.id!==owner)return;
      snapshot=data;render();
    })().finally(()=>{loading=null;});
    return loading;
  }
  async function saveSettings(ev){
    ev.preventDefault();if(!canManage()||!snapshot)return;
    const f=ev.currentTarget,button=f.querySelector('[type=submit]');button.disabled=true;
    try{
      const payload={enabled:f.elements.enabled.checked,
        pickup_window_days:Number(f.elements.pickup_window_days.value),
        max_active_pickups_per_driver:Number(f.elements.max_active_pickups_per_driver.value),
        instructions:f.elements.instructions.value,version:snapshot.settings.version};
      await api('/admin/return-collections/settings',{method:'PATCH',body:payload});
      FMV.notice('Return collection settings saved.');snapshot=null;await load(true);
    }catch(error){FMV.notice(error.message,true);}finally{button.disabled=false;}
  }
  async function click(ev){
    const button=ev.target.closest('[data-return-action]');if(!button||!canManage())return;
    const action=button.dataset.returnAction,id=button.dataset.returnId;
    if(!['approve','reject','cancel'].includes(action))return;
    let path='/admin/return-collections/'+encodeURIComponent(id),body=null;
    if(action==='approve' || action==='reject'){
      if(!confirm((action==='approve'?'Approve':'Reject')+' return request '+id+'?'))return;
      body={status:action==='approve'?'approved':'rejected',note:''};path+='/review';
    }else{
      const reason=prompt('Why is this collection being cancelled? (minimum 8 characters)');
      if(!reason)return;body={reason};path+='/cancel';
    }
    button.disabled=true;
    try{await api(path,{method:'POST',body});FMV.notice('Return collection updated.');snapshot=null;await load(true);}
    catch(error){FMV.notice(error.message,true);}finally{button.disabled=false;}
  }
  async function submit(ev){
    const form=ev.target.closest('[data-return-submit]');if(!form)return;
    ev.preventDefault();if(!canManage()||!form.reportValidity())return;
    const id=form.dataset.returnId,action=form.dataset.returnSubmit,button=form.querySelector('[type=submit]');
    const record=snapshot?.claims.find(c=>c.id===id)?.collection;
    let data,path;
    if(action==='assign'){
      path='/admin/return-collections/'+encodeURIComponent(id)+'/assign';
      data={driver_id:form.elements.driver_id.value,scheduled_date:form.elements.scheduled_date.value,
        note:form.elements.note.value,expected_version:record?.version || 0};
    }else if(action==='receive'){
      if(!confirm('Confirm the driver-collected item has physically arrived at the warehouse?'))return;
      path='/admin/return-collections/'+encodeURIComponent(id)+'/receive';
      data={condition:form.elements.condition.value,disposition:form.elements.disposition.value,
        note:form.elements.note.value};
    }else return;
    button.disabled=true;
    try{await api(path,{method:'POST',body:data});FMV.notice('Collection status saved.');snapshot=null;await load(true);}
    catch(error){FMV.notice(error.message,true);}finally{button.disabled=false;}
  }
  document.addEventListener('DOMContentLoaded',build);
  document.addEventListener('fmv:admin-tab',ev=>{
    if(ev.detail==='returns')FMV.guard(()=>load(true));
  });
  document.addEventListener('fmv:authenticated',()=>{
    if(canManage() && document.querySelector('#fmv-admin-nav [aria-current="page"]')?.dataset.adminTab==='returns')
      FMV.guard(()=>load(true));
  });
  document.addEventListener('fmv:locked',()=>{
    snapshot=null;loading=null;
    if($('fmv-return-queue'))$('fmv-return-queue').replaceChildren();
    if($('fmv-return-settings'))$('fmv-return-settings').hidden=true;
  });
})();