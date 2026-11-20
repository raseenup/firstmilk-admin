/* Staff-only yard condition, verified refund approval and damage-case review. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>FMV.escape(value??'');
  const api=(p,o)=>FMV.request(p,o);
  const canInspect=()=>FMV.user?.portal==='admin' &&
    (['super_admin','operations_manager'].includes(FMV.user.role)
      || FMV.user.driver_manager===true || FMV.user.quality_manager===true);
  const canFinance=()=>FMV.user?.portal==='admin' &&
    (['super_admin','finance'].includes(FMV.user.role)||FMV.user.payout_approver===true);
  const canView=()=>canInspect()||canFinance();
  let snapshot=null,loading=null,staff=[],processing=false;
  const status=v=>String(v||'').replaceAll('_',' ');
  function build(){
    const dash=$('staff-dashboard');if(!dash)return;
    const panel=document.createElement('section');panel.dataset.adminPanel='quality';
    panel.className='fmv-panel fmv-quality-studio';
    panel.innerHTML=`<header class="fmv-quality-hero"><span class="admin-eyebrow">FIRST MILK · QUALITY CONTROL</span>
      <h3>Yard Quality & Return Review</h3>
      <p>Verify received products, investigate condition differences, and document refunds and driver accountability. No automatic driver deductions or refund payouts.</p></header>
      <div class="fmv-quality-overview" id="fmv-quality-summary"></div>
      <div class="fmv-flex"><h4>Quality inspection and investigation queue</h4>
        <button class="fmv-btn secondary" id="fmv-quality-refresh" type="button">Refresh</button></div>
      <div class="fmv-quality-queue" id="fmv-quality-cases"></div>
      <section id="fmv-quality-delegates" hidden><h4>Designate a quality inspector</h4>
        <form id="fmv-quality-staff-form" class="fmv-studio-form">
        <label class="fmv-studio-label">Approved staff<select name="staff_id" required></select></label>
        <label class="fmv-studio-label fmv-check"><input name="quality_manager" type="checkbox"> Authorized quality inspector</label>
        <p class="fmv-small">Quality access permits inspections and investigations but not accounts refunds or deductions.</p>
        <button type="submit" class="fmv-btn">Update quality designation</button></form></section>`;
    dash.append(panel);
    $('fmv-quality-refresh').addEventListener('click',()=>FMV.guard(()=>load(true)));
    $('fmv-quality-cases').addEventListener('submit',event=>FMV.guard(()=>submit(event)));
    $('fmv-quality-staff-form').addEventListener('submit',event=>FMV.guard(()=>saveDesignation(event)));
    $('fmv-quality-staff-form').elements.staff_id.addEventListener('change',fillDesignation);
    groupAdminPanels();syncAdminNavigation();
  }
  const field=(name,title,placeholder='',required=true)=>
    `<label class="fmv-studio-label">${esc(title)}
       <textarea name="${name}" rows="3" maxlength="2000"
        placeholder="${esc(placeholder)}" ${required?'required':''}></textarea></label>`;
  function caseCard(item){
    const coll=item.collection || {},caseRecord=item.case,report=item.report,auth=item.refund_authorization;
    const inspected=!!report,awaiting=coll.status==='collected',bad=report?.finding==='not_ok';
    const yardForm=canInspect()&&awaiting&&!inspected?`<form data-qa-action="yard" data-case-id="${esc(item.id)}" class="fmv-quality-form">
      <h5>Yard item inspection</h5>
      <div class="fmv-studio-grid">
        <label class="fmv-studio-label">Product result<select name="finding" required><option value="good">Product okay</option><option value="not_ok">Product not okay — escalate</option></select></label>
        <label class="fmv-studio-label">Condition<select name="condition" required><option>sealed</option><option>opened</option><option>damaged</option><option>other</option></select></label>
        <label class="fmv-studio-label">Disposition<select name="disposition" required><option value="quarantine">Quarantine</option><option value="inspection_pending">Inspection pending</option><option value="dispose">Dispose (after separate handling)</option></select></label>
      </div>
      ${field('report','Detailed physical inspection report','Describe product, packaging, weight, seal and condition')}
      <label class="fmv-studio-label">Evidence reference when not okay<input name="evidence_reference" maxlength="180" placeholder="Protected evidence / incident reference"></label>
      <p class="fmv-small">Damage automatically opens a quality/compliance incident. Nothing is restocked or deducted automatically.</p>
      <button class="fmv-btn" type="submit">Submit yard inspection</button></form>`:'';
    const refundForm=canFinance()&&!auth&&['collected','received','quality_hold'].includes(coll.status)
      ?`<form data-qa-action="authorize" data-case-id="${esc(item.id)}" class="fmv-quality-form">
         <h5>Review customer refund eligibility</h5>
         <label class="fmv-studio-label">Refund amount (INR)<input type="number" name="amount" min="0.01" step="0.01" max="${esc(item.amount)}" value="${esc(item.amount)}" required></label>
         ${field('rationale','Reason for authorized refund','Confirm verified collection / yard result and company policy')}
         <p class="fmv-small">This authorizes eligibility only. The bank/Razorpay transfer must still be completed and independently verified.</p>
         <button class="fmv-btn" type="submit">Authorize refund eligibility</button></form>`:'';
    const recordForm=canFinance()&&auth&&['approved','received'].includes(item.claim_status)?`<form data-qa-action="record-refund" data-case-id="${esc(item.id)}" class="fmv-quality-form">
       <h5>Record externally verified customer refund</h5>
       <div class="fmv-studio-grid"><label class="fmv-studio-label">Method<select name="method"><option value="razorpay">Razorpay (provider verified)</option><option value="manual">Manual bank/COD (reported pending verification)</option></select></label>
       <label class="fmv-studio-label">Amount<input type="number" min="0.01" step="0.01" name="amount" max="${esc(auth.amount)}" value="${esc(auth.amount)}" required></label>
       <label class="fmv-studio-label">Provider or bank reference<input name="refund_reference" maxlength="120" minlength="6" required></label></div>
       <button type="submit" class="fmv-btn secondary">Record verified refund reference</button></form>`:'';
    const investigateForm=canInspect()&&caseRecord?.status==='awaiting_driver_response'
      ?`<form data-qa-action="investigate" data-case-id="${esc(item.id)}" class="fmv-quality-form">
        <h5>Independent quality/compliance investigation</h5>
        <p class="fmv-small">Allow the driver to respond. A different reviewer from the yard inspector must examine corroborating evidence.</p>
        <div class="fmv-studio-grid"><label class="fmv-studio-label">Investigation finding<select name="decision">
          <option value="not_proven">Driver fault not proven</option><option value="other_cause">Other cause</option>
          <option value="driver_fault_proven">Driver fault proven by evidence</option></select></label>
          <label class="fmv-studio-label">Actual substantiated loss (INR)<input type="number" name="loss_amount" value="0" min="0" max="${esc(item.amount)}" step=".01" required></label></div>
        ${field('evidence_summary','Independent evidence assessment','Describe supporting evidence and driver explanation')}
        <label class="fmv-studio-label">Evidence record ID<input name="evidence_reference" maxlength="180" placeholder="Case or photo evidence reference"></label>
        <label class="fmv-studio-label fmv-check"><input type="checkbox" name="allow_customer_refund"> Customer remains eligible for refund after review</label>
        <button type="submit" class="fmv-btn">Submit independent investigation</button></form>`:'';
    const recoverForm=canFinance()&&caseRecord?.status==='finance_review'?`<form data-qa-action="recover" data-case-id="${esc(item.id)}" class="fmv-quality-form">
      <h5>Accounts & HR: reviewed driver receivable adjustment</h5>
      <p class="fmv-small">Only documented actual loss after driver hearing, independent investigation and HR/legal approval. An incorrect deduction could violate wage law.</p>
      <label class="fmv-studio-label">Amount (INR)<input name="approved_amount" type="number" min=".01" step=".01" max="${esc(caseRecord.proposed_loss)}" value="${esc(caseRecord.proposed_loss)}" required></label>
      <div class="fmv-studio-grid">
        <label class="fmv-studio-label">HR/legal clearance ID<input name="legal_clearance_reference" maxlength="180" minlength="8" required></label>
        <label class="fmv-studio-label">Hearing/response record ID<input name="hearing_record_reference" maxlength="180" minlength="8" required></label>
      </div>
      <label class="fmv-studio-label fmv-check"><input name="hr_legal_approval_confirmed" type="checkbox" required> I verified HR/legal approval and actual loss evidence.</label>
      <button class="fmv-btn danger" type="submit">Record authorized receivable adjustment</button></form>`:'';
    return `<article class="fmv-quality-case">
      <div class="fmv-flex"><strong>Return ${esc(item.id)}</strong><span class="fmv-quality-pill">${esc(status(coll.status))}</span></div>
      <div class="fmv-quality-meta"><span>Order: ${esc(item.order_number)}</span><span>Driver: ${esc(coll.driver_name||'Not assigned')}</span>
        <span>Customer: ${esc(item.customer)}</span><span>Claim: ₹${esc(item.amount)}</span></div>
      <p class="fmv-small">Driver condition: ${esc(coll.condition||'—')} · New damage: ${esc(coll.additional_damage||'Not confirmed')}</p>
      ${inspected?`<div class="fmv-quality-note ${bad?'fmv-quality-warning':''}">
        <strong>Yard: ${bad?'Product not okay — escalated':'Product okay'}</strong>
        <p>${esc(report.report)}</p><small>Inspector: ${esc(report.inspector)}</small>
      </div>`:''}
      ${caseRecord?`<div class="fmv-quality-note fmv-quality-warning">
        <strong>Case status: ${esc(status(caseRecord.status))}</strong>
        <p>${esc(caseRecord.summary)}</p>
        <p>Driver response: ${esc(caseRecord.driver_response||'Awaiting response')}</p>
        ${caseRecord.decision?`<p>Finding: ${esc(status(caseRecord.decision))}</p>`:''}
        ${caseRecord.recovered_amount?`<p>Reviewed recovery: ₹${esc(caseRecord.recovered_amount)}</p>`:''}
      </div>`:''}
      ${auth?`<div class="fmv-quality-note"><strong>Refund eligibility authorized: ₹${esc(auth.amount)}</strong><p>Funds are not automatically transferred.</p></div>`:''}
      ${yardForm}${refundForm}${recordForm}${investigateForm}${recoverForm}
      </article>`;
  }
  function render(){
    if(!snapshot)return;
    const rows=snapshot.claims||[];
    const collected=rows.filter(x=>x.status==='collected' && !x.report).length;
    const incidents=rows.filter(x=>x.case && !['closed','recovery_recorded'].includes(x.case.status)).length;
    const approved=rows.filter(x=>x.refund_authorization).length;
    $('fmv-quality-summary').innerHTML=`<div><strong>${collected}</strong><span>Awaiting yard QA</span></div>
      <div><strong>${incidents}</strong><span>Escalated cases</span></div>
      <div><strong>${approved}</strong><span>Refund reviews approved</span></div>`;
    $('fmv-quality-cases').innerHTML=rows.slice().reverse().map(caseCard).join('')||
      '<p class="fmv-small">No physical returns have been collected yet.</p>';
    if(FMV.user?.role==='super_admin'){
      const pane=$('fmv-quality-delegates');pane.hidden=false;
      $('fmv-quality-staff-form').elements.staff_id.innerHTML=staff.map(s=>
        `<option value="${esc(s.id)}">${esc(s.name)} · ${esc(s.email)}</option>`).join('');
      fillDesignation();
    }
  }
  function fillDesignation(){
    const form=$('fmv-quality-staff-form');if(!form)return;
    const chosen=staff.find(x=>x.id===form.elements.staff_id.value);
    form.elements.quality_manager.checked=!!chosen?.quality_manager;
  }
  async function load(force=false){
    if(!canView() || loading)return loading;
    if(snapshot&&!force){render();return;}
    loading=(async()=>{
      const owner=FMV.user?.id;
      const promises=[api('/admin/return-quality')];
      if(FMV.user?.role==='super_admin')promises.push(api('/admin/return-quality/staff'));
      const [data,delegates]=await Promise.all(promises);
      if(FMV.user?.id!==owner)return;
      snapshot=data;staff=delegates?.staff||[];render();
    })().finally(()=>{loading=null;});
    return loading;
  }
  async function saveDesignation(ev){
    ev.preventDefault();if(FMV.user?.role!=='super_admin')return;
    const f=ev.currentTarget,button=f.querySelector('button');button.disabled=true;
    try{
      await api('/admin/return-quality/staff/'+encodeURIComponent(f.elements.staff_id.value),
        {method:'PATCH',body:{quality_manager:f.elements.quality_manager.checked}});
      FMV.notice('Quality delegation updated.');snapshot=null;await load(true);
    }catch(e){FMV.notice(e.message,true);}finally{button.disabled=false;}
  }
  async function submit(ev){
    const form=ev.target.closest('[data-qa-action]');if(!form)return;
    ev.preventDefault();if(!canView()||processing||!form.reportValidity())return;
    const id=form.dataset.caseId,action=form.dataset.qaAction;
    const row=snapshot?.claims.find(c=>c.id===id);if(!row)return;
    const base='/admin/return-quality/'+encodeURIComponent(id);
    let url=base,payload={};
    if(action==='yard'){
      url+='/yard-report';
      payload={finding:form.elements.finding.value,condition:form.elements.condition.value,
        disposition:form.elements.disposition.value,report:form.elements.report.value,
        evidence_reference:form.elements.evidence_reference.value,
        expected_version:row.collection.version};
    }else if(action==='authorize'){
      url+='/refund-authorization';
      payload={amount:form.elements.amount.value,rationale:form.elements.rationale.value,
        expected_version:row.collection.version};
    }else if(action==='record-refund'){
      url='/admin/returns/'+encodeURIComponent(id)+'/refund-record';
      payload={method:form.elements.method.value,amount:form.elements.amount.value,
        refund_reference:form.elements.refund_reference.value};
    }else if(action==='investigate'){
      url+='/investigation';
      payload={decision:form.elements.decision.value,evidence_summary:form.elements.evidence_summary.value,
        evidence_reference:form.elements.evidence_reference.value,
        loss_amount:form.elements.loss_amount.value,
        allow_customer_refund:form.elements.allow_customer_refund.checked,
        expected_version:row.case.version};
    }else if(action==='recover'){
      url+='/recovery';
      payload={approved_amount:form.elements.approved_amount.value,
        hearing_record_reference:form.elements.hearing_record_reference.value,
        legal_clearance_reference:form.elements.legal_clearance_reference.value,
        hr_legal_approval_confirmed:form.elements.hr_legal_approval_confirmed.checked,
        expected_version:row.case.version};
    }else return;
    const highRisk=['recover','record-refund'].includes(action);
    if(highRisk && !confirm('Confirm all external evidence and approvals were verified before recording this financial action?'))return;
    processing=true;
    const button=form.querySelector('button[type=submit]');button.disabled=true;
    try{
      await api(url,{method:'POST',body:payload});
      FMV.notice(action==='authorize'?'Refund eligibility approved; no payment was initiated.':'Return quality record saved.');
      snapshot=null;await load(true);
    }catch(error){FMV.notice(error.message,true);}
    finally{processing=false;button.disabled=false;}
  }
  document.addEventListener('DOMContentLoaded',build);
  document.addEventListener('fmv:admin-tab',event=>{
    if(event.detail==='quality')FMV.guard(()=>load(true));
  });
  document.addEventListener('fmv:authenticated',()=>{
    if(canView() && document.querySelector('#fmv-admin-nav [aria-current="page"]')?.dataset.adminTab==='quality')
      FMV.guard(()=>load(true));
  });
  document.addEventListener('fmv:locked',()=>{
    snapshot=null;loading=null;staff=[];processing=false;
    $('fmv-quality-cases')?.replaceChildren();
    $('fmv-quality-summary')?.replaceChildren();
  });
})();