/* Catalog editing, dispatch queues and accounts-confirmed driver cash. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),e=value=>FMV.escape(value);
  const labels={unassigned:'Unassigned',assigned:'Assigned',cancelled:'Cancelled',completed:'Completed',awaiting_payment:'Awaiting payment',failed:'Failed'};
  let orders=[],drivers=[],bucket='unassigned',cashRows=[],editing=null,mediaId=null,receiptKey='',createBusy=false;
  const group=order=>({'Unassigned':'unassigned','Cancelled':'cancelled','Delivered':'completed','Awaiting Payment':'awaiting_payment','Failed':'failed'}[order.status] || 'assigned');
  function mediaURL(value){
    if(!value)return '';
    try{const url=new URL(value,value.startsWith('/media/products/')?FMV.apiBase+'/':location.origin);return (url.protocol==='https:' || (url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname))) && !url.username && !url.password?url.href:'';}catch(error){return '';}
  }
  function productImage(product){const url=mediaURL(product.image_url);return url?`<img class="fmv-catalog-thumb" src="${e(url)}" alt="${e(product.name)}" loading="lazy" referrerpolicy="no-referrer">`:'';}
  function renderOrderCount(summary){
    const allowed=FMV.user?.portal==='admin' && ['super_admin','operations_manager'].includes(FMV.user.role);
    const button=$('fmv-unassigned-button');if(!button)return;button.hidden=!allowed;
    if(!allowed)return;
    if(summary){$('fmv-unassigned-total').textContent=summary.unassigned;button.setAttribute('aria-label',summary.unassigned+' unassigned orders across all dates');$('fmv-logistics-count').textContent=summary.unassigned;}
  }
  function renderDeliveries(nextOrders,nextDrivers){
    orders=nextOrders;drivers=nextDrivers;
    const target=$('admin-deliveries-container');if(!target)return;
    if(document.activeElement?.closest('#admin-deliveries-container select'))return;
    const counts=Object.fromEntries(Object.keys(labels).map(key=>[key,orders.filter(o=>group(o)===key).length]));
    const active=drivers.filter(d=>d.approved && !d.deleted),shown=orders.filter(o=>group(o)===bucket).slice().reverse();
    target.innerHTML=`<div class="fmv-order-queues" role="tablist" aria-label="Order sections">${Object.entries(labels).map(([key,label])=>`<button type="button" id="fmv-queue-${key}" role="tab" aria-controls="fmv-queue-orders" aria-selected="${key===bucket}" data-operation="order-bucket" data-bucket="${key}">${label}<span>${counts[key]}</span></button>`).join('')}</div><p class="fmv-small">Showing ${e(labels[bucket].toLowerCase())} orders for the selected date and zone.</p><section id="fmv-queue-orders" role="tabpanel" aria-labelledby="fmv-queue-${bucket}">${shown.map(o=>{
      const assignable=!['Delivered','Cancelled','Awaiting Payment'].includes(o.status);
      return `<article class="fmv-panel fmv-dispatch-card"><div class="fmv-row"><strong>${e(o.order_number)}</strong><span>${e(o.status)} · ${FMV.money(o.total_amount)}</span></div><p class="fmv-small">${e(o.customer_name)} · ${e(o.customer_phone)}<br>${e(o.delivery_address)}<br>${e(o.items_summary)}<br>Payment: ${e(o.payment_status)} · Driver: ${e(o.assigned_driver || 'Unassigned')}</p>${assignable?`<div class="fmv-flex"><select class="fmv-input" aria-label="Driver for ${e(o.order_number)}" id="assign-select-${e(o.id)}"><option value="">Choose driver</option>${active.map(d=>`<option value="${e(d.id)}" ${o.assigned_driver_id===d.id?'selected':''}>${e(d.name)}</option>`).join('')}</select><button class="fmv-btn" data-operation="assign-order" data-id="${e(o.id)}">Assign / reassign</button></div>`:''}${['Assigned','Picked Up','In Transit'].includes(o.status)?`<div class="fmv-flex"><button class="fmv-btn secondary" data-admin-action="dispatch-status" data-id="${e(o.id)}" data-status="Shipped" ${o.status==='In Transit'?'disabled':''}>Mark shipped</button><button class="fmv-btn" data-admin-action="dispatch-status" data-id="${e(o.id)}" data-status="Out for Delivery">Out for delivery</button></div>`:''}</article>`;
    }).join('') || FMV.empty('No '+labels[bucket].toLowerCase()+' orders for this date and zone.')}</section>`;
  }
  function dialog(id,title,html){
    const element=document.createElement('dialog');element.id=id;element.className='fmv-operations-dialog';element.setAttribute('aria-labelledby',id+'-title');
    element.innerHTML=`<div class="fmv-row"><h2 id="${id}-title">${title}</h2><button type="button" class="fmv-btn secondary" data-operation="close-dialog" data-dialog="${id}" aria-label="Close ${title}">Close</button></div>${html}`;
    element.addEventListener('click',event=>{if(event.target===element){const box=element.getBoundingClientRect();if(event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom)element.close();}});
    document.body.append(element);return element;
  }
  function editProduct(id){
    const product=fmvAdminProducts.get(id);if(!product)return;
    editing=structuredClone(product);mediaId=null;
    const form=$('fmv-product-edit-form');form.reset();
    for(const field of ['name','description','unit','price','stock_quantity','tax_rate','min_stock_threshold'])form.elements[field].value=product[field] ?? (['tax_rate','min_stock_threshold'].includes(field)?0:'');
    $('fmv-edit-product-preview').innerHTML=productImage(product);
    $('fmv-product-edit-error').textContent='';$('fmv-product-editor').showModal();
  }
  async function upload(inputId){
    const input=$(inputId);if(!input.files?.length)return null;
    const payload=await FMV.readFile(inputId);
    return FMV.request('/admin/product-media',{method:'POST',body:{filename:payload.filename,data_base64:payload.data_base64}});
  }
  async function saveProduct(event){
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
    try{
      const uploaded=await upload('fmv-edit-product-file');if(uploaded)mediaId=uploaded.id;
      const body={version:editing.version,media_id:mediaId};
      for(const field of ['name','description','unit'])body[field]=form.elements[field].value.trim();
      for(const field of ['price','stock_quantity','tax_rate','min_stock_threshold'])body[field]=Number(form.elements[field].value);
      const result=await FMV.request('/admin/products/'+encodeURIComponent(editing.id),{method:'PATCH',body});
      $('fmv-product-editor').close();FMV.notice(result.message);await loadAdminData();
    }catch(error){$('fmv-product-edit-error').textContent=error.message;}finally{button.disabled=false;}
  }
  function renderCash(rows){
    cashRows=rows;
    const target=$('fmv-driver-cash-list');if(!target)return;
    target.innerHTML=rows.map(row=>`<article class="fmv-panel fmv-cash-driver"><div class="fmv-row"><div><h3>${e(row.name)}</h3><p class="fmv-small">${e(row.email)}${row.disabled?' · Account disabled':''}</p></div><button type="button" class="fmv-btn" data-operation="cash-receipt" data-id="${e(row.driver_id)}" ${row.net_cash_to_remit<=0?'disabled':''}>Record cash received</button></div><dl class="fmv-cash-metrics"><div><dt>COD collected · all dates</dt><dd>${FMV.money(row.lifetime_cod_collected)}</dd></div><div><dt>Approved expenses</dt><dd>${FMV.money(row.approved_expenses)}</dd></div><div><dt>Received by accounts</dt><dd>${FMV.money(row.cash_received)}</dd></div><div><dt>Outstanding cash</dt><dd>${FMV.money(row.net_cash_to_remit)}</dd></div></dl>${row.reimbursement_due>0?`<p>Amount owed to driver: ${FMV.money(row.reimbursement_due)}</p>`:''}<p class="fmv-small">Expenses awaiting review: ${FMV.money(row.pending_expenses)}. Handovers awaiting receipt: ${FMV.money(row.pending_handover)}.</p><details><summary>Handovers, expenses & receipts</summary><h4>Pending handovers</h4>${row.handovers.filter(h=>h.status==='pending').map(h=>`<div class="fmv-row"><div><strong>${FMV.money(h.amount)}</strong><p class="fmv-small">${e(h.reference)} · ${e(h.created_at)}</p></div><div class="fmv-flex"><button class="fmv-btn" data-operation="cash-receipt" data-id="${e(row.driver_id)}" data-handover="${e(h.id)}">Confirm cash received</button><button class="fmv-btn secondary" data-operation="reject-handover" data-id="${e(h.id)}">Reject</button></div></div>`).join('') || FMV.empty('No handovers awaiting receipt.')}<h4>Expenses</h4>${row.expenses.slice().reverse().map(exp=>`<div class="fmv-row"><div><strong>${e(exp.category)} · ${FMV.money(exp.amount)}</strong><p class="fmv-small">${e(exp.date)} · ${e(exp.approval_status || 'pending')}</p></div>${(exp.approval_status || 'pending')==='pending'?`<div class="fmv-flex"><button class="fmv-btn" data-operation="review-expense" data-id="${e(exp.id)}" data-status="approved">Approve</button><button class="fmv-btn secondary" data-operation="review-expense" data-id="${e(exp.id)}" data-status="rejected">Reject</button></div>`:''}</div>`).join('') || FMV.empty('No recorded expenses.')}<h4>Accounts receipts</h4>${row.receipts.slice().reverse().map(r=>`<div class="fmv-row"><div><strong>${e(r.reference)} · ${FMV.money(r.amount)}</strong><p class="fmv-small">${e(r.received_at)}<br>Received by ${e(r.received_by)}<br>${e(r.id)}</p></div></div>`).join('') || FMV.empty('No accounts receipts yet.')}</details></article>`).join('') || FMV.empty('Registered drivers and their cash balances will appear here.');
  }
  function openReceipt(driverId,handoverId){
    const driver=cashRows.find(row=>row.driver_id===driverId);if(!driver)return;
    const handover=driver.handovers.find(h=>h.id===handoverId),form=$('fmv-cash-receipt-form');form.reset();
    form.dataset.driverId=driverId;form.dataset.handoverId=handoverId || '';receiptKey=crypto.randomUUID().replaceAll('-','');
    $('fmv-receipt-driver').textContent=driver.name+' · Outstanding '+FMV.money(driver.net_cash_to_remit);
    form.elements.amount.value=handover?handover.amount:driver.net_cash_to_remit;form.elements.amount.max=driver.net_cash_to_remit;form.elements.amount.readOnly=!!handover;
    form.elements.reference.value=handover?.reference || '';$('fmv-cash-receipt-error').textContent='';$('fmv-cash-receipt-dialog').showModal();
  }
  async function receiveCash(event){
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;
    try{
      const result=await FMV.request('/admin/finance/cash-receipts',{method:'POST',headers:{'Idempotency-Key':receiptKey},body:{
        driver_id:form.dataset.driverId,handover_id:form.dataset.handoverId,amount:Number(form.elements.amount.value),reference:form.elements.reference.value.trim(),confirmed_received:form.elements.confirmed_received.checked}});
      $('fmv-cash-receipt-dialog').close();FMV.notice(result.message || 'This cash receipt has already been saved.');await loadFinanceModule();
    }catch(error){$('fmv-cash-receipt-error').textContent=error.message;}finally{button.disabled=false;}
  }
  async function click(event){
    const button=event.target.closest('[data-operation]');if(!button || button.disabled)return;
    const op=button.dataset.operation,id=button.dataset.id;
    if(op==='order-bucket'){bucket=button.dataset.bucket;renderDeliveries(orders,drivers);$('fmv-queue-'+bucket)?.focus();return;}
    if(op==='edit-product'){editProduct(id);return;}
    if(op==='close-dialog'){$(button.dataset.dialog)?.close();return;}
    if(op==='remove-product-image'){mediaId='';$('fmv-edit-product-file').value='';$('fmv-edit-product-preview').replaceChildren();return;}
    if(op==='cash-receipt'){openReceipt(id,button.dataset.handover);return;}
    if(op==='show-unassigned'){bucket='unassigned';$('admin-date-input').value='';selectAdminTab('logistics');await loadAdminDeliveries();return;}
    button.disabled=true;
    try{
      if(op==='assign-order'){await reassignOrder(id);await refreshAdmin();}
      if(op==='review-expense'){await FMV.request('/admin/finance/expenses/'+encodeURIComponent(id),{method:'PATCH',body:{status:button.dataset.status}});FMV.notice('Expense '+button.dataset.status+'.');await loadFinanceModule();}
      if(op==='reject-handover'){await FMV.request('/admin/finance/cash-handovers/'+encodeURIComponent(id)+'/reject',{method:'PATCH'});FMV.notice('Handover rejected. Cash remains outstanding.');await loadFinanceModule();}
    }finally{button.disabled=false;}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const count=document.createElement('button');count.id='fmv-unassigned-button';count.type='button';count.className='fmv-unassigned-button';count.dataset.operation='show-unassigned';count.hidden=true;count.innerHTML='Unassigned <strong id="fmv-unassigned-total" aria-live="polite">0</strong>';
    document.querySelector('.admin-header-inner').append(count);
    const badge=document.createElement('span');badge.id='fmv-logistics-count';badge.className='fmv-nav-order-count';badge.textContent='0';$('fmv-admin-tab-logistics').append(badge);
    const fileLabel=document.createElement('label');fileLabel.className='fmv-new-product-media';fileLabel.innerHTML='Product photo or GIF<input id="fmv-new-product-file" type="file" accept="image/jpeg,image/png,image/gif,image/webp"><small>JPEG, PNG, GIF or WebP · up to 1.5 MB</small>';$('new-prod-desc').parentElement.after(fileLabel);
    dialog('fmv-product-editor','Edit product',`<form id="fmv-product-edit-form" class="fmv-operations-form"><label>Product name<input name="name" maxlength="150" required></label><label>Description<textarea name="description" maxlength="3000" rows="4"></textarea></label><label>Unit<input name="unit" maxlength="100" required></label><div class="fmv-form-grid"><label>Price (₹)<input name="price" type="number" min="0" max="1000000" step="0.01" required></label><label>Stock available<input name="stock_quantity" type="number" min="0" max="10000000" step="1" required></label><label>GST rate (%)<input name="tax_rate" type="number" min="0" max="100" step="0.01" required></label><label>Low stock threshold<input name="min_stock_threshold" type="number" min="0" max="10000000" step="1" required></label></div><div id="fmv-edit-product-preview"></div><label>Replace photo or GIF<input id="fmv-edit-product-file" type="file" accept="image/jpeg,image/png,image/gif,image/webp"><small>Up to 1.5 MB. GIF animations are preserved.</small></label><button class="fmv-btn secondary" type="button" data-operation="remove-product-image">Remove current image</button><p id="fmv-product-edit-error" role="alert"></p><button class="fmv-btn" type="submit">Save product</button></form>`);
    $('fmv-product-edit-form').addEventListener('submit',saveProduct);
    $('fmv-edit-product-file').addEventListener('change',()=>{const file=$('fmv-edit-product-file').files?.[0];if(file)$('fmv-edit-product-preview').textContent='Selected: '+file.name;});
    dialog('fmv-cash-receipt-dialog','Confirm cash received',`<p id="fmv-receipt-driver"></p><form id="fmv-cash-receipt-form" class="fmv-operations-form"><label>Cash actually received (₹)<input name="amount" type="number" min="0.01" step="0.01" required></label><label>Accounts receipt reference<input name="reference" maxlength="200" required placeholder="Cash receipt / deposit reference"></label><label class="fmv-check-row"><input name="confirmed_received" type="checkbox" required>I confirm accounts has received this cash.</label><p id="fmv-cash-receipt-error" role="alert"></p><button type="submit" class="fmv-btn">Save receipt & update balance</button></form>`);
    $('fmv-cash-receipt-form').addEventListener('submit',receiveCash);
    const panel=document.createElement('section');panel.id='fmv-accounts-cash';panel.className='fmv-panel';panel.dataset.rbacModule='finance_billing';panel.dataset.adminPanel='finance';panel.innerHTML='<h2>Driver cash & accounts receipts</h2><p class="fmv-small">Balances carry across dates. Only approved expenses and cash received by accounts reduce outstanding cash. Record partial receipts as each handover arrives.</p><div id="fmv-driver-cash-list"></div>';$('staff-dashboard').append(panel);groupAdminPanels();syncAdminNavigation();
    document.addEventListener('click',event=>FMV.guard(()=>click(event)));
  });
  const create=window.submitNewProduct;
  window.submitNewProduct=async()=>{if(createBusy)return;createBusy=true;try{await create();}finally{createBusy=false;}};
  document.addEventListener('fmv:locked',()=>{orders=[];drivers=[];cashRows=[];editing=null;mediaId=null;bucket='unassigned';for(const id of ['fmv-product-editor','fmv-cash-receipt-dialog']){$(id)?.close();$(id)?.querySelector('form')?.reset();}for(const id of ['fmv-driver-cash-list','admin-deliveries-container','admin-product-table'])$(id)?.replaceChildren();renderOrderCount();});
  window.FMVOperations={renderDeliveries,renderOrderCount,renderCash,productImage,newProductMedia:()=>upload('fmv-new-product-file')};
})();
