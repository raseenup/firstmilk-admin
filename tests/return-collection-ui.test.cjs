/* Staff return collection UI contract: API enforces role checks. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const src=fs.readFileSync('return-collections.js','utf8');
const nav=fs.readFileSync('admin.js','utf8');
const html=fs.readFileSync('index.html','utf8');
test('Admin Return Pickup is scoped to approved operations and driver managers',()=>{
 assert.match(nav,/return_collection/);
 assert.match(nav,/driver_manager===true/);
 assert.match(src,/canManage\(\)/);
 assert.match(src,/admin\/return-collections/);
 assert.match(html,/src="return-collections\.js"/);
});
test('Collection staff cannot see or use the pickup PIN',()=>{
 assert.doesNotMatch(src,/pickup_pin/);
 assert.match(src,/expected_version/);
 assert.match(src,/Yard Quality/);
 assert.doesNotMatch(src,/data-return-submit="receive"/);
 assert.match(src,/max_active_pickups_per_driver/);
});