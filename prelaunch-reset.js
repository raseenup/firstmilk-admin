/* First Milk Venture: simple one-button Launch Reset with a Yes/No warning.
 * The server, not this UI, decides whether a reset is allowed.
 * Requires authenticated Super Admin, explicitly armed prelaunch server,
 * confidential archive export, single-use session ticket and safety checks.
 */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const escapeText = value => FMV.escape(String(value ?? ''));
  let working = false;
  let currentPreview = null;
  let previousFocus = null;
  // Yes/No remain the only choices. The first Yes saves the confidential
  // archive; the second Yes affirms that the admin verified the download.
  let backupExported = false;

  const authorised = () => FMV.user?.portal === 'admin' && FMV.user?.role === 'super_admin';

  function status(message, error = false) {
    const element = $('fmv-launch-reset-message');
    if (!element) return;
    element.hidden = !message;
    element.textContent = message || '';
    element.dataset.level = error ? 'error' : 'info';
  }

  function update() {
    const button = $('fmv-launch-reset-button');
    if (button) button.disabled = working || !authorised() || currentPreview?.completed === true;
    const yes = $('fmv-launch-reset-yes');
    const no = $('fmv-launch-reset-no');
    if (yes) { yes.disabled = working || !authorised() || !currentPreview?.can_reset;
      yes.textContent = backupExported ? 'Yes, I saved backup. Reset' : 'Yes, download backup'; }
    if (no) no.disabled = working;
  }

  function recordsMarkup(data) {
    const entries = Object.entries(data || {}).filter(([, count]) => Number(count) > 0);
    return entries.length
      ? entries.map(([name, count]) => '<span class="fmv-launch-reset-count"><b>' +
          escapeText(name.replaceAll('_', ' ')) + '</b> ' + Number(count) + '</span>').join('')
      : '<p>There are no eligible test records in the listed categories.</p>';
  }

  function renderPreview(preview) {
    const details = $('fmv-launch-reset-warning-details');
    if (!details) return;
    const reasons = preview.blocked_reasons || [];
    const stock = Object.entries(preview.restore_stock || {})
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([product, quantity]) => '<li>' + escapeText(product) + ': <strong>+' +
           Number(quantity) + ' units</strong></li>').join('');
    details.innerHTML =
      '<p class="fmv-launch-reset-warning-text"><strong>Warning:</strong> Choosing Yes will permanently ' +
      'remove eligible pre-launch TEST dispatch and accounting records. This cannot be undone using the portal.</p>' +
      '<h4>Records to clear</h4><div class="fmv-launch-reset-counts">' +
      recordsMarkup(preview.counts) + '</div>' +
      (stock ? '<h4>Inventory to restore</h4><ul class="fmv-launch-reset-stock">' + stock + '</ul>' :
        '<p>There are no product stock reservations to restore.</p>') +
      '<p>Customer and driver registrations, products, settings and audit history remain protected. ' +
      'Real payments, completed deliveries and financial obligations block the reset.</p>' +
      '<p><strong>Choosing Yes first downloads a confidential test-data archive.</strong> Save it securely and ' +
      'verify it is present. Then choose Yes again to confirm the irreversible reset and the displayed stock changes. ' +
      'No always cancels. A separate independently verified database backup is strongly recommended.</p>' +
      (reasons.length ? '<div class="fmv-launch-reset-blockers" role="alert"><strong>Reset unavailable:</strong> ' +
        reasons.map(escapeText).join(' ') + '</div>' : '');
    status(preview.completed ? 'This one-time reset has already been completed.' : '', preview.completed);
    update();
  }

  function closeWarning() {
    const dialog = $('fmv-launch-reset-warning');
    if (dialog?.open && !working) dialog.close();
    backupExported = false;
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  }

  async function openWarning() {
    if (working || !authorised()) return;
    const dialog = $('fmv-launch-reset-warning');
    previousFocus = document.activeElement;
    currentPreview = null;
    backupExported = false;
    status('');
    $('fmv-launch-reset-warning-details').textContent = 'Checking the latest reset permissions and business records…';
    dialog.showModal();
    working = true;
    update();
    try {
      currentPreview = await FMV.request('/admin/prelaunch-reset/preview');
      renderPreview(currentPreview);
    } catch (error) {
      currentPreview = null;
      $('fmv-launch-reset-warning-details').textContent =
        'Reset is unavailable: ' + (error?.message || 'Unable to verify server conditions.');
      status('No data was reset.', true);
    } finally {
      working = false;
      update();
    }
  }

  async function confirmReset() {
    if (working || !authorised() || !currentPreview?.can_reset) return;
    working = true;
    update();
    const details = $('fmv-launch-reset-warning-details');
    details.insertAdjacentHTML('beforeend',
      '<p id="fmv-launch-reset-progress" role="status">Starting confidential archive download and verifying the reset authorization…</p>');
    try {
      // All required safety checks are repeated on the backend before deletion.
      const latest = await FMV.request('/admin/prelaunch-reset/preview');
      if (!latest.can_reset) throw Error((latest.blocked_reasons || []).join(' ') ||
        'Reset conditions changed. No records were deleted.');
      if (!backupExported) {
        // Download is a separate, recoverable step. A browser click cannot
        // confirm that the user actually saved an archive on iOS.
        await FMV.download('/admin/prelaunch-reset/export', 'fmv-prelaunch-archive.json');
        backupExported = true;
        const progress = $('fmv-launch-reset-progress');
        if (progress) progress.textContent =
          'Archive downloaded/requested. Verify the file was saved securely, then choose Yes again to reset, or No to cancel.';
        return;
      }
      // The second explicit Yes attests that the human verified the archive.
      const prepared = await FMV.request('/admin/prelaunch-reset/prepare', {method: 'POST'});
      if (!prepared?.ticket) throw Error('The server did not authorize a reset.');
      // The second Yes acknowledges a verified, confidential archive,
      // irreversible cleanup and displayed inventory adjustments. The server
      // independently verifies session/role, short-lived ticket, state
      // revision and financial/accounting safety blockers.
      const result = await FMV.request('/admin/prelaunch-reset/execute', {
        method: 'POST',
        body: {
          ticket: prepared.ticket,
          confirmation: latest.phrase,
          backup_acknowledged: true,
          inventory_acknowledged: true
        }
      });
      currentPreview = {completed: true, can_reset: false};
      working = false;
      closeWarning();
      status(result.message || 'Eligible test dispatch and accounting data reset successfully.');
      update();
      await refreshAdmin();
    } catch (error) {
      status('Reset not completed: ' + (error?.message || 'Unknown error.'), true);
      const progress = $('fmv-launch-reset-progress');
      if (progress) progress.textContent = 'Reset not completed. Review the warning or choose No.';
      currentPreview = null; backupExported = false; // Require fresh preview after errors.
    } finally {
      working = false;
      update();
    }
  }

  function build() {
    const dashboard = $('staff-dashboard');
    if (!dashboard) return;
    const panel = document.createElement('section');
    panel.id = 'fmv-launch-reset-panel';
    panel.className = 'fmv-panel fmv-launch-reset-panel';
    panel.dataset.adminPanel = 'overview';
    panel.dataset.rbacModule = 'security_roles';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="fmv-launch-reset-header">
        <div>
          <p class="driver-eyebrow">SUPER ADMIN · PRE-LAUNCH</p>
          <h3>Launch Reset — Dispatch & Accounts</h3>
          <p>Remove eligible test transactions for a clean public launch. Protected business records and user accounts are preserved.</p>
        </div>
      </div>
      <button id="fmv-launch-reset-button" class="fmv-btn danger fmv-launch-reset-main" type="button">
        Reset Dispatch & Accounts Data
      </button>
      <p id="fmv-launch-reset-message" role="status" aria-live="polite" hidden></p>`;
    dashboard.append(panel);
    groupAdminPanels();

    const dialog = document.createElement('dialog');
    dialog.id = 'fmv-launch-reset-warning';
    dialog.className = 'fmv-launch-reset-modal';
    dialog.setAttribute('aria-labelledby', 'fmv-launch-reset-dialog-title');
    dialog.setAttribute('aria-describedby', 'fmv-launch-reset-warning-details');
    dialog.innerHTML = `
      <div class="fmv-launch-reset-modal-content">
        <span class="fmv-launch-reset-alert-icon" aria-hidden="true">!</span>
        <h3 id="fmv-launch-reset-dialog-title">Warning — Reset data?</h3>
        <div id="fmv-launch-reset-warning-details" class="fmv-launch-reset-warning-details"></div>
        <div class="fmv-launch-reset-choice">
          <button id="fmv-launch-reset-no" type="button" class="fmv-btn secondary">No, cancel</button>
          <button id="fmv-launch-reset-yes" type="button" class="fmv-btn danger" disabled>Yes, download backup</button>
        </div>
      </div>`;
    document.body.append(dialog);
    $('fmv-launch-reset-button').addEventListener('click', openWarning);
    $('fmv-launch-reset-no').addEventListener('click', closeWarning);
    $('fmv-launch-reset-yes').addEventListener('click', confirmReset);
    dialog.addEventListener('cancel', event => {
      if (working) event.preventDefault();
      else {event.preventDefault(); closeWarning();}
    });
    document.addEventListener('fmv:authenticated', syncVisibility);
    document.addEventListener('fmv:locked', syncVisibility);
    syncVisibility();
  }

  function syncVisibility() {
    const panel = $('fmv-launch-reset-panel');
    if (panel) panel.hidden = !authorised();
    if (!authorised()) {
      currentPreview = null;
      backupExported = false;
      const dialog = $('fmv-launch-reset-warning');
      if (dialog?.open && !working) dialog.close();
      status('');
    }
    update();
  }

  document.addEventListener('DOMContentLoaded', build);
})();
