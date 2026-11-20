const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ui=fs.readFileSync('yard-quality.js','utf8');
const auth=fs.readFileSync('admin.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const old=fs.readFileSync('return-collections.js','utf8');
test('Yard Quality portal uses role-gated API and safe markup',()=>{
 assert.match(ui,/canInspect/);assert.match(ui,/canFinance/);
 assert.match(ui,/FMV\.escape/);assert.match(html,/yard-quality\.js/);
 assert.match(auth,/module:'return_quality'/);assert.match(auth,/quality_manager/);
 assert.doesNotMatch(ui,/localStorage\.setItem/);
});
test('Independent reporting and financial approvals are distinct actions',()=>{
 for(const item of ['/yard-report','/refund-authorization','/investigation','/recovery','/refund-record']){
  assert.ok(ui.includes(item),'missing UI flow '+item);
 }
 assert.match(ui,/hr_legal_approval_confirmed/);
 assert.match(ui,/driver_response/);
 assert.match(old,/data-return-action="open-quality"/);
 assert.doesNotMatch(old,/data-return-submit="receive"/);
});