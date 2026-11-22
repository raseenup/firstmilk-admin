/* First Milk Venture: Super Admin-only, pre-public-launch test data reset.
 * It is impossible to run from the browser without the server's explicit
 * pre-launch safety gate, an active super-admin session and a fresh ticket.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const escape = value => FMV.escape(String(value ?? ''));
  let preview = null, exported = false, ticket = null, busy = false;

  function authorised() {
    return FMV.user?.portal === 'admin' && FMV.user?.role === 'super_admin';
  }
  function message(value, error=false) {
    const el = $('fmv-launch-reset-message');
    if (!el) return;
    el.textContent = value;
    el.hidden = !value;
    el.style.color = error ? '#9b2525' : '#225c45';
  }
  function resetReady() {
    return authorised() && !!preview?.can_reset && exported && !!ticket &&
      $('fmv-launch-reset-ack').checked &&
      (!Object.keys(preview.restore_stock || {}).length || $('fmv-launch-reset-stock-ack').checked) &&
      $('fmv-launch-reset-phrase').value.trim() === preview.phrase;
  }
  function updateButtons() {
    const allowed = authorised() && !busy;
    for (const id of ['fmv-launch-reset-preview','fmv-launch-reset-export','fmv-launch-reset-prepare','fmv-launch-reset-run']) {
      const el = $(id); if (!el) continue;
      el.disabled = !allowed || (id.endsWith('export') && !preview?.can_reset) ||
        (id.endsWith('prepare') && (!preview?.can_reset || !exported)) ||
        (id.endsWith('run') && !resetReady());
    }
    $('fmv-launch-reset-ack')?.toggleAttribute('disabled', !exported || !ticket || busy);
    $('fmv-launch-reset-stock-ack')?.toggleAttribute('disabled', !exported || !ticket || busy || !Object.keys(preview?.restore_stock || {}).length);
    $('fmv-launch-reset-phrase')?.toggleAttribute('disabled', !exported || !ticket || busy);
  }
  function formatCounts(data) {
    return Object.entries(data || {}).filter(([,count])=>count>0)
      .map(([name,count])=>'<span class="fmv-launch-reset-count"><b>'+escape(name.replaceAll('_',' '))+'</b> '+Number(count)+'</span>')
      .join('') || '<p>No test records in the selected dispatch/accounting categories.</p>';
  }
  function showPreview(data) {
    preview = data; exported = false; ticket = null;
    $('fmv-launch-reset-ack').checked = false;
    $('fmv-launch-reset-stock-ack').checked = false;
    $('fmv-launch-reset-phrase').value = '';
    $('fmv-launch-reset-results').innerHTML =
      '<h4>Records in scope (preview only)</h4><div class="fmv-launch-reset-counts">'+formatCounts(data.counts)+'</div>' +
      '<p><strong>Stock restoration:</strong> '+Object.entries(data.restore_stock || {})
        .map(([id, qty])=>escape(id)+': '+Number(qty)).join(', ') .replace(/^$/, 'None')+'</p>'+
      '<p><strong>Preserved:</strong> Staff/driver/customer accounts, products, tax settings, company branding, documents and audit history.</p>';
    const blockers = data.blocked_reasons || [];
    $('fmv-launch-reset-blockers').hidden = blockers.length===0;
    $('fmv-launch-reset-blockers').textContent = blockers.length
      ? 'Reset locked: ' + blockers.join(' ') : 'All initial server safety checks passed.';
    message(data.completed ? 'The one-time Launch Reset has already been used.' :
      data.can_reset ? 'Preview ready. Export the test-data archive before preparing the reset.' :
      'No changes made. Resolve server blockers before attempting a reset.',!data.can_reset);
    updateButtons();
  }
  async function guarded(operation) {
    if (busy || !authorised()) return;
    busy = true; updateButtons();
    try { await operation(); }
    catch (error) {
      ticket = null;
      message(error.message || 'The request failed. No reset was performed.',true);
    } finally { busy = false; updateButtons(); }
  }
  async function previewNow() {
    await guarded(async()=>{
      const result = await FMV.request('/admin/prelaunch-reset/preview');
      showPreview(result);
    });
  }
  async function exportArchive() {
    await guarded(async()=>{
      if (!preview?.can_reset) throw Error('First review the server preview and blockers.');
      await FMV.download('/admin/prelaunch-reset/export','fmv-prelaunch-archive.json');
      exported = true;
      ticket = null;
      message('Archive download initiated. Save it privately, check that the file exists, and only then prepare the reset.');
    });
  }
  async function prepare() {
    await guarded(async()=>{
      if (!exported || !preview?.can_reset) throw Error('Export and save the archive first.');
      const result = await FMV.request('/admin/prelaunch-reset/prepare',{method:'POST'});
      ticket = result.ticket;
      message('Ready for final confirmation. Your private reset authorization expires in five minutes. Enter the exact displayed phrase and check the backup confirmation.');
    });
  }
  async function execute() {
    await guarded(async()=>{
      if (!resetReady()) throw Error('Confirmation is incomplete.');
      const count = Object.values(preview.counts || {}).reduce((total, value)=>total+Number(value || 0),0);
      const accepted = window.confirm('FINAL CONFIRMATION: Permanently clear '+count+
        ' pre-launch test records across dispatch and accounts? This action cannot be undone from the portal. Real accounting, payment and identity records are protected.');
      if (!accepted) return;
      const result = await FMV.request('/admin/prelaunch-reset/execute',{
        method:'POST',
        body:{ticket, confirmation:$('fmv-launch-reset-phrase').value.trim(),
              backup_acknowledged:$('fmv-launch-reset-ack').checked,
              inventory_acknowledged:$('fmv-launch-reset-stock-ack').checked}
      });
      ticket = null; exported = false;
      message(result.message || 'The pre-launch reset was completed.');
      await FMV.request('/admin/prelaunch-reset/preview').then(showPreview);
      await refreshAdmin();
    });
  }
  function build() {
    const dashboard = $('staff-dashboard');
    if (!dashboard) return;
    const card = document.createElement('section');
    card.id = 'fmv-launch-reset-panel';
    card.className = 'fmv-panel fmv-launch-reset-panel';
    card.dataset.adminPanel = 'overview';
    card.dataset.rbacModule = 'security_roles';
    card.hidden = true;
    card.innerHTML = `
      <div class="fmv-launch-reset-header">
        <div><p class="driver-eyebrow">SUPER ADMIN · PRE-LAUNCH ONLY</p>
          <h3>Launch Reset — Dispatch & Accounts</h3>
          <p>Clean pre-launch test dispatches, attendance and unpaid accounting data before public release. Customer, staff and driver identities, product catalog, settings and audit trails are preserved.</p>
        </div><span class="fmv-launch-reset-status">One-time operation</span>
      </div>
      <p class="fmv-launch-reset-warning">This tool is disabled unless the backend is explicitly configured for pre-launch cleanup. Real payments, completed deliveries, unsettled cash, approved expenses and payroll obligations block reset. Never use on live public business data.</p>
      <div class="fmv-launch-reset-actions">
        <button class="fmv-btn secondary" type="button" id="fmv-launch-reset-preview">1. Preview records</button>
        <button class="fmv-btn secondary" type="button" id="fmv-launch-reset-export" disabled>2. Export test-data backup</button>
        <button class="fmv-btn secondary" type="button" id="fmv-launch-reset-prepare" disabled>3. Prepare final reset</button>
      </div>
      <div id="fmv-launch-reset-results" aria-live="polite"><p>No records loaded. Start with preview.</p></div>
      <p id="fmv-launch-reset-blockers" class="fmv-launch-reset-warning" hidden></p>
      <label class="fmv-launch-reset-check"><input type="checkbox" id="fmv-launch-reset-ack" disabled>
        I personally checked that the downloaded archive is saved securely. I understand the reset cannot be reversed in the portal.</label>
      <label class="fmv-launch-reset-check"><input type="checkbox" id="fmv-launch-reset-stock-ack" disabled>
        I reviewed the product quantities shown in Stock restoration. I approve the inventory adjustments displayed above.</label>
      <label class="fmv-launch-reset-label" for="fmv-launch-reset-phrase">Type exactly: <strong>RESET FIRST MILK VENTURE TEST DATA</strong>
        <input id="fmv-launch-reset-phrase" type="text" autocomplete="off" maxlength="70" placeholder="Exact confirmation phrase" disabled></label>
      <button type="button" class="fmv-btn danger" id="fmv-launch-reset-run" disabled>Reset test Dispatch & Accounts data</button>
      <p id="fmv-launch-reset-message" role="status" aria-live="polite" hidden></p>`;
    dashboard.append(card);
    groupAdminPanels();
    $('fmv-launch-reset-preview').addEventListener('click',previewNow);
    $('fmv-launch-reset-export').addEventListener('click',exportArchive);
    $('fmv-launch-reset-prepare').addEventListener('click',prepare);
    $('fmv-launch-reset-run').addEventListener('click',execute);
    $('fmv-launch-reset-ack').addEventListener('change',updateButtons);
    $('fmv-launch-reset-stock-ack').addEventListener('change',updateButtons);
    $('fmv-launch-reset-phrase').addEventListener('input',updateButtons);
    const show = () => {
      card.hidden = !authorised();
      if (!authorised()) {
        preview = null; exported = false; ticket = null;
        message('');
      }
      updateButtons();
    };
    document.addEventListener('fmv:authenticated',show);
    document.addEventListener('fmv:locked',show);
    show();
  }
  document.addEventListener('DOMContentLoaded',build);
})();
