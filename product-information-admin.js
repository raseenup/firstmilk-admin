/* First Milk Venture — authorized product details content studio.
   Catalog pricing and inventory remain controlled by their existing editors. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (value) => FMV.escape(String(value == null ? '' : value));
  const canEdit = () => FMV.user?.portal==='admin' && (
    ['super_admin','operations_manager','content_manager'].includes(FMV.user.role) ||
    FMV.user.content_editor === true
  );
  let products = [], editing = null, activeRequest = 0, lastLoad = 0;
  const columns = [
    { key:'brand',label:'Brand',max:150 },
    { key:'generic_name',label:'Generic product name',max:150 },
    { key:'manufacturer_name',label:'Manufacturer name',max:250 },
    { key:'manufacturer_address',label:'Manufacturer address',max:700,area:true },
    { key:'packer_name',label:'Packer name',max:250 },
    { key:'packer_address',label:'Packer address',max:700,area:true },
    { key:'country_of_origin',label:'Country of origin',max:120 },
    { key:'batch_number',label:'Batch / lot number',max:120 },
    { key:'net_quantity',label:'Net quantity',max:120 },
    { key:'manufactured_on',label:'Manufacture / packed date',date:true },
    { key:'expiry_date',label:'Expiry date',date:true },
    { key:'best_before_date',label:'Best before date',date:true },
    { key:'fssai_license',label:'FSSAI licence number (if applicable)',max:50 },
    { key:'customer_care',label:'Customer care details',max:350,area:true },
    { key:'storage_instructions',label:'Storage and handling instructions',max:1200,area:true },
    { key:'ingredients',label:'Ingredients',max:2000,area:true },
    { key:'allergens',label:'Allergen information',max:600,area:true }
  ];
  const schemas = {
    highlights: [['highlight','Highlight',240]],
    specifications: [['label','Specification name',90],['value','Value',500]],
    faqs: [['question','Customer question',240],['answer','Approved answer',1500]]
  };
  function makePanel(kind){
    const element=document.createElement('section');
    element.className='fmv-info-panel fmv-panel';
    element.dataset.adminPanel=kind;
    element.dataset.rbacModule=kind==='marketing'?'content_management':'catalog_inventory';
    element.innerHTML='<div class="fmv-info-title"><div><span class="fmv-info-eyebrow">PRODUCT CONTENT STUDIO</span><h3>Product specifications & expiry</h3><p>Publish highlights, descriptions, manufacture details and batch-specific expiry information.</p></div><button type="button" class="fmv-btn secondary" data-info-refresh>Refresh products</button></div><div class="fmv-info-products" id="fmv-info-products-'+kind+'"></div>';
    $('staff-dashboard').append(element);
  }
  function inputField(spec){
    const field=spec.date
      ? '<input type="date" name="'+spec.key+'" autocomplete="off">'
      : spec.area
        ? '<textarea name="'+spec.key+'" maxlength="'+spec.max+'" rows="2"></textarea>'
        : '<input type="text" name="'+spec.key+'" maxlength="'+spec.max+'" autocomplete="off">';
    return '<label class="fmv-info-field"><span>'+esc(spec.label)+'</span>'+field+'</label>';
  }
  function buildEditor(){
    const modal=document.createElement('dialog');
    modal.id='fmv-product-info-editor';
    modal.className='fmv-info-dialog';
    modal.setAttribute('aria-labelledby','fmv-info-editor-title');
    modal.innerHTML=
      '<div class="fmv-info-dialog-content">'+
        '<header class="fmv-info-dialog-header"><div><span class="fmv-info-eyebrow">FIRST MILK VENTURE · PRODUCT CONTENT</span><h2 id="fmv-info-editor-title">Edit product information</h2><p id="fmv-info-editor-subtitle"></p></div><button type="button" class="fmv-info-close" data-info-close aria-label="Close editor">×</button></header>'+
        '<form id="fmv-info-form">'+
          '<div class="fmv-info-dialog-body">'+
            '<section class="fmv-info-section"><h3>Product highlights</h3><p>Short bullet points customers see first.</p><div id="fmv-info-highlights" class="fmv-info-rows"></div><button type="button" class="fmv-btn secondary" data-info-add="highlights">+ Add highlight</button></section>'+
            '<section class="fmv-info-section"><h3>Specifications</h3><p>Add any relevant quality, composition, packaging or product specification.</p><div id="fmv-info-specifications" class="fmv-info-rows"></div><button type="button" class="fmv-btn secondary" data-info-add="specifications">+ Add specification</button></section>'+
            '<section class="fmv-info-section"><h3>Full description</h3><textarea name="description" maxlength="6000" rows="5" placeholder="Describe the product accurately."></textarea></section>'+
            '<section class="fmv-info-section"><h3>Manufacturer & expiry information</h3><p class="fmv-info-warning">Manufacturing, best-before and expiry dates are batch-specific. Use the verified dates shown on the applicable package. Do not invent dates; leave an unknown date blank.</p><div class="fmv-info-fields">'+columns.map(inputField).join('')+'</div></section>'+
            '<section class="fmv-info-section"><h3>Warranty or guarantee (if relevant)</h3><textarea name="warranty" maxlength="2500" rows="3" placeholder="Optional; do not promise a warranty that does not exist."></textarea></section>'+
            '<section class="fmv-info-section"><h3>Questions & answers</h3><p>Publish accurate answers to common product questions.</p><div id="fmv-info-faqs" class="fmv-info-rows"></div><button type="button" class="fmv-btn secondary" data-info-add="faqs">+ Add Q&A</button></section>'+
            '<p id="fmv-info-error" class="fmv-info-error" role="alert"></p>'+
          '</div>'+
          '<footer class="fmv-info-actions"><button type="button" class="fmv-btn secondary" data-info-close>Cancel</button><button class="fmv-btn" type="submit">Save & publish details</button></footer>'+
        '</form>'+
      '</div>';
    document.body.append(modal);
    modal.addEventListener('click',(event)=>{if(event.target===modal)modal.close();});
    modal.addEventListener('close',()=>{editing=null;activeRequest++;});
    $('fmv-info-form').addEventListener('submit',save);
  }
  function renderLists(){
    for(const kind of ['catalog','marketing']){
      const target=$('fmv-info-products-'+kind);
      if(!target)continue;
      if(!canEdit()){target.textContent='Product content editing requires an authorized administrator.';continue;}
      target.innerHTML=products.map((p)=>{
        const m=p.information?.manufacturer||{};
        const expiry=m.expiry_date||'Not published';
        return '<article class="fmv-info-product"><div><strong>'+esc(p.name)+'</strong><small>Pack: '+esc(p.unit)+' · Batch: '+esc(m.batch_number||'Not set')+' · Expiry: '+esc(expiry)+'</small></div><button type="button" class="fmv-btn" data-info-product="'+esc(p.id)+'">Edit information</button></article>';
      }).join('')||'<p>No products in the catalog yet.</p>';
    }
  }
  async function refresh(force){
    if(!canEdit())return;
    if(!force && Date.now()-lastLoad<12000){renderLists();return;}
    try{
      products=await FMV.request('/products');
      if(!Array.isArray(products))products=[];
      lastLoad=Date.now();
      renderLists();
    }catch(error){
      for(const kind of ['marketing','catalog']){
        const target=$('fmv-info-products-'+kind);
        if(target)target.textContent='Unable to load products. Please refresh and try again.';
      }
    }
  }
  function addRow(kind,values){
    const target=$('fmv-info-'+kind),defs=schemas[kind];
    if(!target || !defs)return;
    const maximum={highlights:12,specifications:40,faqs:20}[kind];
    if(target.children.length>=maximum)return;
    const row=document.createElement('div');
    row.className='fmv-info-row';
    row.dataset.rowKind=kind;
    defs.forEach(([key,label,max])=>{
      const wrapper=document.createElement('label');
      const caption=document.createElement('span');
      caption.textContent=label;
      const input=(key==='answer'||key==='value')?document.createElement('textarea'):document.createElement('input');
      if(input.tagName==='TEXTAREA')input.rows=2;
      input.name=key;
      input.maxLength=max;
      input.value=String(values?.[key]||'');
      wrapper.append(caption,input);
      row.append(wrapper);
    });
    const remove=document.createElement('button');
    remove.type='button';remove.className='fmv-info-remove';remove.dataset.infoRemove='true';
    remove.textContent='Remove';remove.setAttribute('aria-label','Remove '+kind+' row');
    row.append(remove);
    target.append(row);
  }
  function serializeRows(kind){
    const result=[];
    for(const node of $('fmv-info-'+kind).querySelectorAll('.fmv-info-row')){
      const item={};
      schemas[kind].forEach(([key])=>item[key]=node.querySelector('[name="'+key+'"]').value.trim());
      const vals=Object.values(item);
      if(vals.every(v=>!v))continue;
      if(vals.some(v=>!v))throw Error('Complete every field in each '+kind+' row or remove the row.');
      result.push(kind==='highlights'?item.highlight:item);
    }
    return result;
  }
  function setRows(kind,values){
    $('fmv-info-'+kind).replaceChildren();
    (values?.length?values:[{}]).forEach(item=>{
      addRow(kind,kind==='highlights'?{highlight:item}:item);
    });
  }
  async function open(id){
    if(!canEdit())return;
    const token=++activeRequest;
    try{
      const data=await FMV.request('/products/'+encodeURIComponent(id)+'/information');
      if(token!==activeRequest)return;
      const info=data.information||{};
      const m=info.manufacturer||{};
      editing={id,version:data.version};
      const form=$('fmv-info-form');form.reset();
      $('fmv-info-editor-title').textContent='Edit: '+data.name;
      $('fmv-info-editor-subtitle').textContent='Publish product-specific information to the customer portal.';
      form.elements.description.value=info.description||'';
      form.elements.warranty.value=info.warranty||'';
      columns.forEach((item)=>{form.elements[item.key].value=m[item.key]||'';});
      setRows('highlights',info.highlights||[]);
      setRows('specifications',info.specifications||[]);
      setRows('faqs',info.faqs||[]);
      $('fmv-info-error').textContent='';
      $('fmv-product-info-editor').showModal();
    }catch(error){
      if(typeof FMV.notice==='function')FMV.notice(error.message||'Unable to load product information.',true);
    }
  }
  function dateIsValid(date){
    if(!date)return true;
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if(!match)return false;
    const d=new Date(date+'T12:00:00Z');
    return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===date;
  }
  async function save(event){
    event.preventDefault();
    if(!editing || !canEdit())return;
    const form=event.currentTarget;
    const button=form.querySelector('[type=submit]');
    if(button.disabled)return;
    button.disabled=true;
    $('fmv-info-error').textContent='';
    try{
      const manufacturer={};
      columns.forEach((field)=>manufacturer[field.key]=form.elements[field.key].value.trim());
      const dateNames=['manufactured_on','expiry_date','best_before_date'];
      for(const key of dateNames){
        if(!dateIsValid(manufacturer[key]))throw Error('Enter a valid '+key.replaceAll('_',' ')+' date.');
      }
      for(const key of ['expiry_date','best_before_date']){
        if(manufacturer.manufactured_on && manufacturer[key] && manufacturer[key]<manufacturer.manufactured_on){
          throw Error('The '+key.replaceAll('_',' ')+' cannot precede the manufacturing date.');
        }
      }
      const body={
        version:editing.version,
        highlights:serializeRows('highlights'),
        specifications:serializeRows('specifications'),
        description:form.elements.description.value.trim(),
        manufacturer,
        warranty:form.elements.warranty.value.trim(),
        faqs:serializeRows('faqs')
      };
      const result=await FMV.request('/admin/products/'+encodeURIComponent(editing.id)+'/information',{method:'PATCH',body});
      $('fmv-product-info-editor').close();
      if(typeof FMV.notice==='function')FMV.notice(result.message||'Product information saved.');
      await refresh(true);
      if(typeof loadAdminData==='function' && FMV.user?.role!=='content_manager')await loadAdminData();
    }catch(error){$('fmv-info-error').textContent=error.message||'Unable to save this information.';}
    finally{button.disabled=false;}
  }
  function build(){
    const root=$('staff-dashboard');
    if(!root || $('fmv-product-info-editor'))return;
    makePanel('catalog');
    makePanel('marketing');
    buildEditor();
    if(typeof groupAdminPanels==='function')groupAdminPanels();
    if(typeof syncAdminNavigation==='function')syncAdminNavigation();
    document.addEventListener('click',(event)=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.hasAttribute('data-info-close')){$('fmv-product-info-editor').close();return;}
      if(button.hasAttribute('data-info-refresh')){refresh(true);return;}
      if(button.hasAttribute('data-info-remove')){button.closest('.fmv-info-row')?.remove();return;}
      if(button.dataset.infoAdd){addRow(button.dataset.infoAdd,{});return;}
      const productId=button.dataset.infoProduct || button.dataset.productInformationEditor;
      if(productId){open(productId);}
    });
    document.addEventListener('fmv:authenticated',()=>refresh(true));
    document.addEventListener('fmv:admin-tab',(event)=>{
      if(['catalog','marketing'].includes(event.detail))refresh(false);
    });
    document.addEventListener('fmv:locked',()=>{
      activeRequest++;
      products=[];editing=null;lastLoad=0;
      $('fmv-product-info-editor')?.close();
      renderLists();
    });
    if(canEdit())refresh(true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);
  else build();
})();
