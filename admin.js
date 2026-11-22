const API_BASE_URL = window.FMV.apiBase;

const RBAC_ROLES = {
  content_manager: {label:"Content Manager",description:"Designated editor for ads, animated menus, offers and company pages.",modules:["content_management"],canOverride:false},
  super_admin: {
    label: "Super Admin",
    description: "Ultimate system authority. Manages global configurations, core security, user roles, system infrastructure, and can override any action.",
    modules: ["security_roles", "operations_logistics", "catalog_inventory", "finance_billing", "customer_support", "content_management"],
    canOverride: true
  },
  operations_manager: {
    label: "Operations Manager",
    description: "Oversees day-to-day business logistics, service catalogues, inventory, booking/order pipelines, and scheduling.",
    modules: ["operations_logistics", "catalog_inventory"],
    canOverride: false
  },
  finance: {
    label: "Finance",
    description: "Controls financial ledgers, billing, tax compliance (e.g., VAT/ZATCA configurations), invoicing, payouts, and refund authorizations.",
    modules: ["finance_billing"],
    canOverride: false
  },
  customer_support: {
    label: "Customer Support",
    description: "Handles user assistance, support ticketing, viewing user directories, and managing minor dispute escalations.",
    modules: ["customer_support"],
    canOverride: false
  }
};

const RBAC_PERMISSION_MATRIX = [
  {
    module: "Global Config, Core Security & User Roles",
    super_admin: "Full Control & Override",
    operations_manager: "No Access",
    finance: "No Access",
    customer_support: "No Access"
  },
  {
    module: "Logistics, Dispatch & Driver Scheduling",
    super_admin: "Full Control & Override",
    operations_manager: "Full Control (Read/Write)",
    finance: "No Access",
    customer_support: "No Access"
  },
  {
    module: "Service Catalogues & Inventory Management",
    super_admin: "Full Control & Override",
    operations_manager: "Full Control (Read/Write)",
    finance: "No Access",
    customer_support: "No Access"
  },
  {
    module: "Financial Ledgers, Billing & VAT/ZATCA Tax",
    super_admin: "Full Control & Override",
    operations_manager: "No Access",
    finance: "Full Control (Read/Write)",
    customer_support: "No Access"
  },
  {
    module: "Invoicing, Payouts & Refund Authorizations",
    super_admin: "Full Control & Override",
    operations_manager: "No Access",
    finance: "Approve & Authorize",
    customer_support: "Escalate Minor Disputes"
  },
  {
    module: "Support Ticketing, User Directory & Disputes",
    super_admin: "Full Control & Override",
    operations_manager: "No Access",
    finance: "No Access",
    customer_support: "Read Directory / Manage Tickets"
  }
];

function getAuthHeaders(extra = {}) {
  const key = localStorage.getItem("admin_key") || "";
  const role = localStorage.getItem("admin_role") || "super_admin";
  return {
    "x-admin-key": key,
    "x-admin-role": role,
    ...extra
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById("admin-date-input");
  if (dateInput) dateInput.value = today;

  checkAdminAuth();
});

function authenticateAdmin() {
  const key = document.getElementById("staff-secret-key").value.trim();
  const selectedRoleEl = document.getElementById("staff-role-select");
  const selectedRole = selectedRoleEl ? selectedRoleEl.value : "super_admin";
  const errorBox = document.getElementById("staff-error");
  errorBox.classList.add("hidden");

  if (!key) {
    errorBox.textContent = "Please enter role or admin access key.";
    errorBox.classList.remove("hidden");
    return;
  }

  // Verify RBAC role & key with backend
  fetch(`${API_BASE_URL}/admin/rbac/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_key: key, role: selectedRole })
  }).then(async res => {
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem("admin_key", key);
      localStorage.setItem("admin_role", data.role || selectedRole);
      checkAdminAuth();
    } else {
      const err = await res.json().catch(() => ({}));
      errorBox.textContent = err.detail || "Invalid Access Key for selected RBAC role.";
      errorBox.classList.remove("hidden");
    }
  }).catch(() => {
    // Shared-key/offline authorization is retired. Use a verified individual session.
    errorBox.textContent = "The server could not be reached. Retry individual account sign-in with email OTP.";
    errorBox.classList.remove("hidden");
  });
}

function applyRbacPermissions(roleKey) {
  const roleCfg = RBAC_ROLES[roleKey] || {label:"Restricted account",description:"No workspace permissions are assigned to this account.",modules:[],canOverride:false};
  const titleEl = document.getElementById("rbac-active-role-title");
  const descEl = document.getElementById("rbac-active-role-desc");
  if (titleEl) titleEl.textContent = roleCfg.label + (roleCfg.canOverride ? " (Global Override Enabled)" : " (Least-Privilege Mode)");
  if (descEl) descEl.textContent = roleCfg.description;

  document.querySelectorAll("[data-rbac-module]").forEach(el => {
    const mod = el.getAttribute("data-rbac-module");
    if (roleCfg.modules.includes(mod)) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  });
  syncAdminNavigation();
}

function checkAdminAuth() {
  const key = localStorage.getItem("admin_key");
  const role = localStorage.getItem("admin_role") || "super_admin";
  const roleCfg = RBAC_ROLES[role] || RBAC_ROLES.super_admin;
  const loginSection = document.getElementById("staff-login-section");
  const dashboard = document.getElementById("staff-dashboard");
  const roleBadge = document.getElementById("staff-role-badge");

  if (key) {
    loginSection.classList.add("hidden");
    dashboard.classList.remove("hidden");
    roleBadge.textContent = roleCfg.label;
    applyRbacPermissions(role);
    if (roleCfg.modules.includes("catalog_inventory")) loadAdminData();
    if (roleCfg.modules.includes("operations_logistics")) loadAdminDeliveries();
    if (roleCfg.modules.includes("finance_billing")) loadFinanceModule();
    if (roleCfg.modules.includes("customer_support")) loadSupportModule();
  } else {
    loginSection.classList.remove("hidden");
    dashboard.classList.add("hidden");
    roleBadge.textContent = "Not Authenticated";
  }
}

function handleStaffLogout() {
  localStorage.removeItem("admin_key");
  localStorage.removeItem("admin_role");
  checkAdminAuth();
}

async function loadAdminData() {
  const key = localStorage.getItem("admin_key");
  try {
    const products = await fetch(`${API_BASE_URL}/products`).then(r => r.json());
    document.getElementById("stat-products-count").textContent = products.length;

    const tableBody = document.getElementById("admin-product-table");
    tableBody.innerHTML = products.map(p => `
      <tr class="border-b border-gray-100 hover:bg-gray-50">
        <td class="py-3 font-bold text-gray-900">${p.name}<span class="block font-normal text-[10px] text-gray-400">${p.description || ''}</span></td>
        <td class="py-3">${p.unit || 'Liter'}</td>
        <td class="py-3 font-black text-emerald-700">₹${p.price}</td>
        <td class="py-3">
          <div class="flex items-center space-x-2">
            <span class="px-2 py-0.5 rounded font-bold ${(p.stock_quantity ?? 0) > 10 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}">${p.stock_quantity ?? 0} Available</span>
            <input type="number" min="0" id="admin-stock-qty-${p.id}" value="${p.stock_quantity ?? 0}" class="w-20 px-2 py-1 text-xs border border-gray-300 rounded-lg font-bold" />
            <button onclick="updateProductStockQty('${p.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg text-[11px] font-bold">Update</button>
          </div>
        </td>
        <td class="py-3 text-right">
          <button onclick="deleteProduct('${p.id}')" class="text-red-500 font-bold hover:underline">Delete</button>
        </td>
      </tr>
    `).join("");
  } catch (err) {
    console.error("Failed to load admin data:", err);
  }
}

async function loadAdminDeliveries() {
  const key = localStorage.getItem("admin_key");
  const zoneId = document.getElementById("admin-zone-select").value;
  const dateInput = document.getElementById("admin-date-input").value;
  const container = document.getElementById("admin-deliveries-container");

  container.innerHTML = `<p class="text-xs text-gray-500">Loading deliveries for ${zoneId} on ${dateInput}...</p>`;

  try {
    const res = await fetch(`${API_BASE_URL}/driver/deliveries?zone_id=${zoneId}&delivery_date=${dateInput}`, {
      headers: getAuthHeaders({ "x-driver-key": key })
    });
    const deliveries = await res.json();
    const driversRes = await fetch(`${API_BASE_URL}/admin/drivers`, {
      headers: getAuthHeaders()
    }).then(r => r.json()).catch(() => []);

    if (!deliveries || !deliveries.length) {
      container.innerHTML = `<p class="text-xs text-gray-500 italic">No orders scheduled for ${zoneId} on ${dateInput}.</p>`;
      return;
    }

    container.innerHTML = deliveries.map(d => `
      <div class="bg-white rounded-xl border border-gray-200 p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div class="flex items-center space-x-2">
            <span class="font-bold text-gray-900 text-xs">Order #${d.order_number || d.id}</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-blue-100 text-blue-800">${d.status}</span>
          </div>
          <p class="text-xs font-semibold text-gray-700 mt-1">Customer: <span class="text-emerald-700 font-bold">${d.user_email}</span></p>
          <p class="text-[11px] text-gray-500">Qty: ${d.quantity} unit(s) | Current Driver: <span class="font-bold text-amber-700">${d.assigned_driver || 'Primary Driver'}</span></p>
        </div>
        <div class="flex items-center space-x-2">
          <select id="assign-select-${d.id}" class="text-xs border border-gray-300 rounded-lg px-2 py-1.5 font-bold">
            ${driversRes.map(dr => `<option value="${dr.key}" ${d.assigned_driver === dr.name ? 'selected' : ''}>${dr.name} (${dr.key})</option>`).join('')}
          </select>
          <button onclick="reassignOrder('${d.id}')" class="text-xs bg-slate-900 text-white font-bold px-3 py-1.5 rounded-lg hover:bg-slate-800">
            Reassign Driver
          </button>
        </div>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = `<p class="text-xs text-red-500">Failed to load delivery orders.</p>`;
  }
}

async function reassignOrder(deliveryId) {
  const key = localStorage.getItem("admin_key");
  const selectEl = document.getElementById(`assign-select-${deliveryId}`);
  const driverKey = selectEl.value;

  try {
    const res = await fetch(`${API_BASE_URL}/admin/deliveries/${deliveryId}/assign`, {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ driver_key: driverKey })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.message}`);
      loadAdminDeliveries();
    } else {
      alert(`Error: ${data.detail || 'Failed to reassign driver'}`);
    }
  } catch (err) {
    alert(`Network error: ${err.message}`);
  }
}

async function openDriverModal() {
  document.getElementById("driver-modal").classList.remove("hidden");
  loadDriversList();
}

function closeDriverModal() {
  document.getElementById("driver-modal").classList.add("hidden");
}

async function loadDriversList() {
  const key = localStorage.getItem("admin_key");
  const container = document.getElementById("drivers-list-admin");
  try {
    const res = await fetch(`${API_BASE_URL}/admin/drivers`, {
      headers: getAuthHeaders()
    });
    const drivers = await res.json();
    if (!drivers.length) {
      container.innerHTML = `<p class="text-gray-400 italic">No drivers configured yet.</p>`;
      return;
    }
    container.innerHTML = drivers.map(d => `
      <div class="flex justify-between items-center bg-white p-2.5 rounded-lg border">
        <div>
          <span class="font-bold text-gray-900">${d.name}</span>
          <span class="text-[11px] text-gray-500 block">Key: <code class="bg-gray-100 px-1 py-0.5 rounded font-mono font-bold text-emerald-700">${d.key}</code> | Phone: ${d.phone} | Zone: ${d.address}</span>
        </div>
        <button onclick="deleteDriver('${d.key}')" class="text-red-500 font-bold text-xs hover:underline">Remove</button>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = `<p class="text-red-500 text-xs">Failed to load drivers list.</p>`;
  }
}

async function createNewDriver() {
  const key = localStorage.getItem("admin_key");
  const name = document.getElementById("new-driver-name").value.trim();
  const driver_key = document.getElementById("new-driver-key").value.trim();
  const phone = document.getElementById("new-driver-phone").value.trim();
  const address = document.getElementById("new-driver-address").value.trim();

  if (!name || !driver_key) {
    alert("Please provide driver name and unique secret key.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/admin/drivers`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ driver_key, name, phone, address })
    });
    if (res.ok) {
      alert("✅ Driver and unique access key created successfully!");
      document.getElementById("new-driver-name").value = "";
      document.getElementById("new-driver-key").value = "";
      document.getElementById("new-driver-phone").value = "";
      document.getElementById("new-driver-address").value = "";
      loadDriversList();
    } else {
      const err = await res.json();
      alert(`Error: ${err.detail || 'Failed to create driver'}`);
    }
  } catch (err) {
    alert(`Network error: ${err.message}`);
  }
}

async function deleteDriver(driverKey) {
  if (!confirm("Are you sure you want to remove this driver?")) return;
  const key = localStorage.getItem("admin_key");
  try {
    const res = await fetch(`${API_BASE_URL}/admin/drivers/${driverKey}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });
    if (res.ok) {
      loadDriversList();
    } else {
      alert("Failed to remove driver.");
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

function openChangeKeyModal() {
  document.getElementById("change-key-modal").classList.remove("hidden");
  document.getElementById("new-admin-key-input").value = "";
}

function closeChangeKeyModal() {
  document.getElementById("change-key-modal").classList.add("hidden");
}

async function submitNewAdminKey() {
  const currentKey = localStorage.getItem("admin_key");
  const newKey = document.getElementById("new-admin-key-input").value.trim();

  if (!newKey || newKey.length < 6) {
    alert("New admin key must be at least 6 characters long.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/admin/key`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": currentKey
      },
      body: JSON.stringify({ new_admin_key: newKey })
    });
    if (res.ok) {
      alert("✅ Admin access key successfully updated! Please log in with your new key.");
      localStorage.setItem("admin_key", newKey);
      closeChangeKeyModal();
    } else {
      const err = await res.json();
      alert(`Error: ${err.detail || 'Failed to update admin key'}`);
    }
  } catch (err) {
    alert(`Network error: ${err.message}`);
  }
}

function openNewProductModal() {
  document.getElementById("product-modal").classList.remove("hidden");
}

function closeNewProductModal() {
  document.getElementById("product-modal").classList.add("hidden");
}

async function submitNewProduct() {
  const key = localStorage.getItem("admin_key");
  const name = document.getElementById("new-prod-name").value.trim();
  const description = document.getElementById("new-prod-desc").value.trim();
  const price = parseFloat(document.getElementById("new-prod-price").value);
  const unit = document.getElementById("new-prod-unit").value.trim();

  if (!name || isNaN(price)) {
    alert("Please provide valid product name and price.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/admin/products`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name, description, price, unit })
    });
    if (res.ok) {
      alert("Product added successfully!");
      closeNewProductModal();
      loadAdminData();
    } else {
      const err = await res.json();
      alert(`Error: ${err.detail || 'Failed to create product'}`);
    }
  } catch (err) {
    alert(`Network error: ${err.message}`);
  }
}

async function deleteProduct(productId) {
  if (!confirm("Are you sure you want to delete this product?")) return;
  const key = localStorage.getItem("admin_key");
  try {
    const res = await fetch(`${API_BASE_URL}/admin/products/${productId}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });
    if (res.ok) {
      loadAdminData();
    } else {
      alert("Failed to delete product.");
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function triggerDailyDispatches() {
  const key = localStorage.getItem("admin_key");
  const targetDate = prompt("Enter target dispatch date (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
  if (!targetDate) return;

  try {
    const res = await fetch(`${API_BASE_URL}/admin/generate-deliveries`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ target_date: targetDate })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ Successfully generated deliveries for ${targetDate}!`);
      loadAdminDeliveries();
    } else {
      alert(`Error: ${data.detail || 'Failed to generate deliveries'}`);
    }
  } catch (err) {
    alert(`Network error: ${err.message}`);
  }
}

// ==============================================================================
// RBAC MATRIX, FINANCE (VAT/ZATCA & REFUNDS) & CUSTOMER SUPPORT FUNCTIONS
// ==============================================================================

function openRbacMatrixModal() {
  const modal = document.getElementById("rbac-matrix-modal");
  if (!modal) return;
  modal.classList.remove("hidden");

  const tbody = document.getElementById("rbac-matrix-table-body");
  if (tbody) {
    tbody.innerHTML = RBAC_PERMISSION_MATRIX.map(row => `
      <tr class="hover:bg-gray-50">
        <td class="p-3 font-bold text-gray-900">${row.module}</td>
        <td class="p-3 font-semibold text-emerald-700">${row.super_admin}</td>
        <td class="p-3 text-gray-700">${row.operations_manager}</td>
        <td class="p-3 text-gray-700">${row.finance}</td>
        <td class="p-3 text-gray-700">${row.customer_support}</td>
      </tr>
    `).join("");
  }

  const currentRole = localStorage.getItem("admin_role") || "super_admin";
  const keyBox = document.getElementById("rbac-key-management-box");
  if (keyBox) {
    if (currentRole === "super_admin") {
      keyBox.classList.remove("hidden");
      loadRbacRoleKeys();
    } else {
      keyBox.classList.add("hidden");
    }
  }
}

function closeRbacMatrixModal() {
  const modal = document.getElementById("rbac-matrix-modal");
  if (modal) modal.classList.add("hidden");
}

async function loadRbacRoleKeys() {
  const listEl = document.getElementById("rbac-role-keys-list");
  if (!listEl) return;
  try {
    const res = await fetch(`${API_BASE_URL}/admin/rbac/roles`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    const roles = data.roles || {};
    listEl.innerHTML = Object.entries(roles).map(([rKey, rInfo]) => `
      <div class="p-2.5 rounded-xl border border-gray-200 bg-gray-50 flex justify-between items-center">
        <div>
          <span class="font-bold text-gray-900 block">${RBAC_ROLES[rKey]?.label || rKey}</span>
          <code class="text-[11px] font-mono text-emerald-700">${rInfo.access_key}</code>
        </div>
        <button onclick="rotateRoleKey('${rKey}')" class="px-2.5 py-1 bg-slate-800 text-white rounded-lg text-[11px] font-bold">Rotate Key</button>
      </div>
    `).join("");
  } catch (e) {
    listEl.innerHTML = `<p class="text-gray-500">Default RBAC role keys active on server.</p>`;
  }
}

async function rotateRoleKey(targetRole) {
  const newKey = prompt(`Enter new access key for ${RBAC_ROLES[targetRole]?.label || targetRole} (min 6 chars):`);
  if (!newKey || newKey.trim().length < 6) return;
  try {
    const res = await fetch(`${API_BASE_URL}/admin/rbac/roles/${targetRole}/key`, {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ new_access_key: newKey.trim() })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.message}`);
      loadRbacRoleKeys();
    } else {
      alert(`Error: ${data.detail || "Failed to rotate role key"}`);
    }
  } catch (e) {
    alert(`Network error: ${e.message}`);
  }
}

async function loadFinanceModule() {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/finance/overview`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) return;
    const data = await res.json();
    const ledger = data.ledger || {};
    const tax = data.tax_compliance || {};

    if (document.getElementById("fin-gross-revenue")) document.getElementById("fin-gross-revenue").textContent = `₹${Number(ledger.gross_revenue || 0).toFixed(2)}`;
    if (document.getElementById("fin-vat-collected")) document.getElementById("fin-vat-collected").textContent = `₹${Number(ledger.vat_collected || 0).toFixed(2)}`;
    if (document.getElementById("fin-payouts-settled")) document.getElementById("fin-payouts-settled").textContent = `₹${Number(ledger.driver_payouts || 0).toFixed(2)}`;

    if (tax.zatca_tin && document.getElementById("fin-zatca-tin")) document.getElementById("fin-zatca-tin").value = tax.zatca_tin;
    if (tax.vat_rate !== undefined && document.getElementById("fin-vat-rate")) document.getElementById("fin-vat-rate").value = tax.vat_rate;
    if (tax.zatca_mode && document.getElementById("fin-zatca-mode")) document.getElementById("fin-zatca-mode").value = tax.zatca_mode;
    if (document.getElementById("vat-zatca-badge")) document.getElementById("vat-zatca-badge").textContent = `VAT/ZATCA: ${tax.vat_rate || 15}% Active`;

    const refunds = data.refund_requests || [];
    if (document.getElementById("fin-pending-refunds")) {
      document.getElementById("fin-pending-refunds").textContent = refunds.filter(r => r.status === "pending").length;
    }
    const listEl = document.getElementById("finance-refunds-list");
    if (listEl) {
      listEl.innerHTML = refunds.length ? refunds.map(r => `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 p-3 rounded-xl border border-gray-200 bg-gray-50">
          <div>
            <span class="font-bold text-gray-900">Refund #${r.id} — Order ${r.order_id} (₹${Number(r.amount).toFixed(2)})</span>
            <span class="block text-[11px] text-gray-500">Customer: ${r.user_email} | Reason: ${r.reason} | Status: <strong class="uppercase">${r.status}</strong></span>
          </div>
          ${r.status === "pending" ? `
            <div class="flex space-x-2">
              <button onclick="authorizeRefund('${r.id}', 'approved')" class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-bold">Authorize Refund</button>
              <button onclick="authorizeRefund('${r.id}', 'rejected')" class="px-3 py-1.5 bg-red-600 text-white rounded-lg font-bold">Reject</button>
            </div>
          ` : `<span class="px-2.5 py-1 rounded-lg bg-gray-200 text-gray-700 font-bold uppercase text-[10px]">${r.status}</span>`}
        </div>
      `).join("") : `<p class="text-gray-400 italic">No pending refund authorizations.</p>`;
    }
  } catch (e) {
    console.error("Finance module load error:", e);
  }
}

async function saveTaxComplianceConfig() {
  const zatca_tin = document.getElementById("fin-zatca-tin").value.trim();
  const vat_rate = parseFloat(document.getElementById("fin-vat-rate").value);
  const zatca_mode = document.getElementById("fin-zatca-mode").value;

  try {
    const res = await fetch(`${API_BASE_URL}/admin/finance/tax-config`, {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ zatca_tin, vat_rate, zatca_mode })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.message}`);
      loadFinanceModule();
    } else {
      alert(`Error: ${data.detail || "Failed to update tax configuration"}`);
    }
  } catch (e) {
    alert(`Network error: ${e.message}`);
  }
}

async function authorizeRefund(refundId, decision) {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/finance/refunds/${refundId}`, {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status: decision })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.message}`);
      loadFinanceModule();
    } else {
      alert(`Error: ${data.detail || "Refund authorization failed"}`);
    }
  } catch (e) {
    alert(`Network error: ${e.message}`);
  }
}

async function loadSupportModule() {
  try {
    const [usersRes, ticketsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/admin/support/users`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE_URL}/admin/support/tickets`, { headers: getAuthHeaders() })
    ]);
    if (usersRes.ok) {
      const usersData = await usersRes.json();
      const users = usersData.users || [];
      const dirEl = document.getElementById("support-user-directory");
      if (dirEl) {
        dirEl.innerHTML = users.length ? users.map(u => `
          <div class="p-2.5 bg-white rounded-lg border border-gray-200">
            <span class="font-bold text-gray-900 block">${u.full_name || "Registered Customer"} (${u.email})</span>
            <span class="text-[11px] text-gray-500">Phone: ${u.phone || "N/A"} | Address: ${u.address || "N/A"}</span>
          </div>
        `).join("") : `<p class="text-gray-400 italic">No customer records found.</p>`;
      }
    }
    if (ticketsRes.ok) {
      const ticketsData = await ticketsRes.json();
      const tickets = ticketsData.tickets || [];
      const tEl = document.getElementById("support-tickets-container");
      if (tEl) {
        tEl.innerHTML = tickets.length ? tickets.map(t => `
          <div class="p-2.5 bg-white rounded-lg border border-gray-200 flex justify-between items-start gap-2">
            <div>
              <span class="font-bold text-gray-900">#${t.id} [${t.category}] — ${t.customer_email}</span>
              <p class="text-[11px] text-gray-600 mt-0.5">${t.summary}</p>
              <span class="text-[10px] font-bold uppercase text-emerald-700">Status: ${t.status}</span>
            </div>
            ${t.status !== "resolved" ? `
              <button onclick="resolveSupportTicket('${t.id}')" class="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-[11px] font-bold">Resolve</button>
            ` : ""}
          </div>
        `).join("") : `<p class="text-gray-400 italic">No open support tickets or dispute escalations.</p>`;
      }
    }
  } catch (e) {
    console.error("Support module load error:", e);
  }
}

function openNewTicketModal() {
  const m = document.getElementById("support-ticket-modal");
  if (m) m.classList.remove("hidden");
}

function closeNewTicketModal() {
  const m = document.getElementById("support-ticket-modal");
  if (m) m.classList.add("hidden");
}

async function submitSupportTicket() {
  const customer_email = document.getElementById("ticket-customer-email").value.trim();
  const category = document.getElementById("ticket-category").value;
  const summary = document.getElementById("ticket-summary").value.trim();

  if (!customer_email || !summary) {
    alert("Please provide customer email and ticket summary.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/admin/support/tickets`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ customer_email, category, summary })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.message}`);
      document.getElementById("ticket-customer-email").value = "";
      document.getElementById("ticket-summary").value = "";
      closeNewTicketModal();
      loadSupportModule();
    } else {
      alert(`Error: ${data.detail || "Failed to create support ticket"}`);
    }
  } catch (e) {
    alert(`Network error: ${e.message}`);
  }
}

async function resolveSupportTicket(ticketId) {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/support/tickets/${ticketId}`, {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ status: "resolved" })
    });
    if (res.ok) {
      loadSupportModule();
    }
  } catch (e) {
    alert(`Network error: ${e.message}`);
  }
}


// ==============================================================================
// PATCH: LIVE PRODUCT AVAILABLE QUANTITY UPDATION (INR / KERALA)
// ==============================================================================
async function updateProductStockQty(productId) {
  const inputEl = document.getElementById(`admin-stock-qty-${productId}`);
  if (!inputEl) return;
  const newQty = parseInt(inputEl.value, 10);
  if (isNaN(newQty) || newQty < 0) {
    alert("Please enter a valid non-negative stock quantity.");
    return;
  }
  try {
    const res = await fetch(`${API_BASE_URL}/admin/products/${productId}/stock`, {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ stock_quantity: newQty })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ Available quantity updated to ${newQty} units.`);
      loadAdminData();
    } else {
      alert(`Error: ${data.detail || "Failed to update stock quantity."}`);
    }
  } catch (err) {
    alert("Network error while updating stock quantity.");
  }
}

// ============================================================================
// v8 ACTIVE CONTROLLERS: verified individual sessions and shared backend state.
// Original modules above are retained; these declarations replace legacy actions.
// ============================================================================
let fmvAdminProducts = new Map();
function getAuthHeaders(extra={}) { return {Authorization:'Bearer '+FMV.token,...extra}; }
function authenticateAdmin(){FMV.showAuth('signin');}
function checkAdminAuth(){
  const u=FMV.user;if(!u || u.portal!=='admin')return;
  document.getElementById('staff-login-section').classList.add('hidden');
  document.getElementById('staff-dashboard').classList.remove('hidden');
  document.getElementById('staff-role-badge').textContent=RBAC_ROLES[u.role]?.label || u.role;
  groupAdminPanels();applyRbacPermissions(u.role);refreshAdmin();
}
function handleStaffLogout(){return FMV.logout();}
function refreshAdmin(){
  if(!FMV.user || FMV.user.portal!=='admin')return;
  return FMV.refresh('admin',()=>FMV.guard(async()=>{
    const query='?delivery_date='+encodeURIComponent(FMV.val('admin-date-input'))+'&zone_id='+encodeURIComponent(FMV.val('admin-zone-select'))+'&workforce='+(fmvAdminActiveTab==='workforce');
    const snapshot=await FMV.snapshot(query),jobs=[];
    applyRbacPermissions(FMV.user.role);syncAdminNavigation();
    if(snapshot.products)jobs.push(loadAdminData(snapshot.products));
    if(snapshot.orders)jobs.push(loadAdminDeliveries(snapshot));
    if(snapshot.attendance)jobs.push(loadAdminAttendance(snapshot));
    if(snapshot.finance)jobs.push(loadFinanceModule(snapshot.finance));
    if(snapshot.users)jobs.push(loadSupportModule(snapshot));
    window.FMVOperations?.renderOrderCount(snapshot.order_summary);
    await Promise.all(jobs);
  }));
}
async function loadAdminData(supplied){return FMV.guard(async()=>{
  const products=Array.isArray(supplied)?supplied:await FMV.request('/products');fmvAdminProducts=new Map(products.map(p=>[p.id,p]));
  document.getElementById('stat-products-count').textContent=products.length;
  if(document.activeElement?.closest('#admin-product-table'))return;
  const e=FMV.escape;
  FMV.setHTML('admin-product-table',products.map(p=>`<tr><td class="py-3">${window.FMVOperations?.productImage(p) || ''}<strong>${e(p.name)}</strong><small class="block">${e(p.description)}</small></td><td>${e(p.unit)}</td><td><input aria-label="Price for ${e(p.name)}" class="fmv-input" type="number" min="0" step="0.01" id="fmv-price-${e(p.id)}" value="${Number(p.price)}"><small class="block">GST <input class="fmv-input" aria-label="GST rate" type="number" min="0" max="100" step="0.01" id="fmv-tax-${e(p.id)}" value="${Number(p.tax_rate || 0)}">%</small></td><td><strong>${Number(p.stock_quantity)} available</strong><div class="fmv-flex"><input aria-label="Stock for ${e(p.name)}" class="fmv-input" type="number" min="0" step="1" id="admin-stock-qty-${e(p.id)}" data-version="${Number(p.version)}" value="${Number(p.stock_quantity)}"><button class="fmv-btn" onclick="updateProductStockQty('${e(p.id)}')">Save stock & price</button></div></td><td><button class="fmv-btn secondary" data-operation="edit-product" data-id="${e(p.id)}">Edit details & image</button><button class="fmv-btn secondary" data-product-information-editor="${e(p.id)}">Specifications & expiry</button><button class="fmv-btn danger" onclick="deleteProduct('${e(p.id)}')">Delete</button></td></tr>`).join('') || '<tr><td colspan="5">No products. Add the first product.</td></tr>');
});}
async function updateProductStockQty(id){return FMV.guard(async()=>{
  const stock=Number(FMV.val('admin-stock-qty-'+id)),price=Number(FMV.val('fmv-price-'+id)),tax=Number(FMV.val('fmv-tax-'+id));
  if(!Number.isInteger(stock)||stock<0||!Number.isFinite(price)||price<0||!Number.isFinite(tax)||tax<0||tax>100)throw new Error('Enter valid stock, price and GST rate.');
  await FMV.request('/admin/products/'+encodeURIComponent(id)+'/stock',{method:'PATCH',body:{stock_quantity:stock,price,tax_rate:tax,version:Number(document.getElementById('admin-stock-qty-'+id).dataset.version)}});
  FMV.notice('Stock, price and GST rate saved.');document.activeElement?.blur();await loadAdminData();
});}
async function loadAdminDeliveries(supplied){return FMV.guard(async()=>{
  const day=FMV.val('admin-date-input'),zone=FMV.val('admin-zone-select');
  const [orders,drivers]=supplied?[supplied.orders,supplied.drivers]:await Promise.all([FMV.request('/admin/deliveries?delivery_date='+encodeURIComponent(day)+'&zone_id='+encodeURIComponent(zone)),FMV.request('/admin/drivers')]);
  if(window.FMVOperations){FMVOperations.renderDeliveries(orders,drivers);return;}
  const active=drivers.filter(d=>d.approved && !d.deleted),e=FMV.escape;
  if(document.activeElement?.closest('#admin-deliveries-container'))return;
  FMV.setHTML('admin-deliveries-container',orders.map(o=>`<div class="fmv-panel"><div class="fmv-row"><strong>${e(o.order_number)}</strong><span>${e(o.status)} · ${FMV.money(o.total_amount)}</span></div><p class="fmv-small">${e(o.customer_name)} · ${e(o.customer_phone)}<br>${e(o.delivery_address)}<br>${e(o.items_summary)}<br>Payment: ${e(o.payment_status)} · Driver: ${e(o.assigned_driver || 'Unassigned')}</p><div class="fmv-flex"><select class="fmv-input" id="assign-select-${e(o.id)}"><option value="">Choose driver</option>${active.map(d=>`<option value="${e(d.id)}" ${o.assigned_driver_id===d.id?'selected':''}>${e(d.name)}</option>`).join('')}</select><button class="fmv-btn" onclick="reassignOrder('${e(o.id)}')">Assign / reassign</button></div>${['Assigned','Picked Up','In Transit'].includes(o.status)?`<div class="fmv-flex"><button class="fmv-btn secondary" data-admin-action="dispatch-status" data-id="${e(o.id)}" data-status="Shipped" ${o.status==='In Transit'?'disabled':''}>Mark shipped</button><button class="fmv-btn" data-admin-action="dispatch-status" data-id="${e(o.id)}" data-status="Out for Delivery">Out for delivery</button></div>`:''}</div>`).join('') || FMV.empty('No deliveries for this date and zone.'));
});}
async function reassignOrder(id){return FMV.guard(async()=>{
  const driver=FMV.val('assign-select-'+id);if(!driver)throw new Error('Choose an approved driver.');
  await FMV.request('/admin/deliveries/'+encodeURIComponent(id)+'/assign',{method:'PATCH',body:{driver_key:driver}});
  FMV.notice('Assignment saved.');await loadAdminDeliveries();
});}
async function loadDriversList(){return FMV.guard(async()=>{
  const drivers=await FMV.request('/admin/drivers'),e=FMV.escape;
  FMV.setHTML('drivers-list-admin',drivers.map(d=>`<div class="fmv-row"><div><strong>${e(d.name)}</strong><p class="fmv-small">${e(d.email || 'Awaiting registration')} · ${e(d.phone)}<br>${e(d.address)}<br>${d.approved?'Approved':'Pending approval'}</p></div><div class="fmv-flex"><button class="fmv-btn secondary" data-admin-work="driver-details" data-id="${e(d.id)}">Performance & documents</button>${!d.approved && d.email?`<button class="fmv-btn" onclick="approveDriver('${e(d.id)}')">Approve</button>`:''}<button class="fmv-btn danger" onclick="deleteDriver('${e(d.id)}')">Delete permanently</button></div></div>`).join('') || FMV.empty('No registered drivers. Drivers can sign up at the driver portal.'));
});}
async function approveDriver(id){return FMV.guard(async()=>{const result=await FMV.request('/admin/drivers/'+encodeURIComponent(id)+'/approve',{method:'POST'});FMV.notice(result.message);loadDriversList();});}
async function deleteDriver(id){
  if(!confirm('Permanently remove this driver account? The driver will lose access immediately and must complete a new registration, email OTP and administrator approval to return. Completed operational and financial audit records are retained. Reassign open deliveries and clock out first.'))return;
  return FMV.guard(async()=>{
    const result=await FMV.request('/admin/drivers/'+encodeURIComponent(id),{method:'DELETE'});
    FMV.notice(result.message || 'Driver account permanently removed.');
    await loadDriversList();
  });
}
async function createNewDriver(){return FMV.guard(async()=>{
  const body={driver_key:FMV.val('new-driver-key'),name:FMV.val('new-driver-name'),phone:FMV.val('new-driver-phone'),address:FMV.val('new-driver-address')};
  const result=await FMV.request('/admin/drivers',{method:'POST',body});FMV.notice(result.message);await loadDriversList();
});}
async function submitNewProduct(){return FMV.guard(async()=>{
  const body={name:FMV.val('new-prod-name'),description:FMV.val('new-prod-desc'),price:Number(FMV.val('new-prod-price')),unit:FMV.val('new-prod-unit'),stock_quantity:Number(FMV.val('fmv-new-stock') || '0'),min_stock_threshold:20,image_url:''};
  if(!Number.isInteger(body.stock_quantity)||body.stock_quantity<0)throw new Error('Stock must be a non-negative integer.');
  const media=await window.FMVOperations?.newProductMedia();if(media)body.image_url=media.url;
  await FMV.request('/admin/products',{method:'POST',body});closeNewProductModal();FMV.notice('Product created.');await loadAdminData();
});}
async function deleteProduct(id){if(!confirm('Remove this product from the active catalog?'))return;return FMV.guard(async()=>{await FMV.request('/admin/products/'+encodeURIComponent(id),{method:'DELETE'});loadAdminData();});}
async function triggerDailyDispatches(){const target=prompt('Dispatch date (YYYY-MM-DD):',new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}));if(!target)return;return FMV.guard(async()=>{const result=await FMV.request('/admin/generate-deliveries',{method:'POST',body:{target_date:target}});FMV.notice('Dispatches ready: '+result.orders.length);loadAdminDeliveries();});}
async function loadRbacRoleKeys(){return FMV.guard(async()=>{
  const result=await FMV.request('/admin/rbac/roles');FMV.setHTML('rbac-role-keys-list',Object.entries(result.roles).map(([key,value])=>`<div class="fmv-row"><strong>${FMV.escape(RBAC_ROLES[key]?.label || key)}</strong><span class="fmv-small">Individual password + email OTP</span></div>`).join('')+'<button class="fmv-btn" onclick="inviteAdministrator()">Invite staff member</button>');
});}
async function inviteAdministrator(){return FMV.guard(async()=>{
  const email=prompt('Staff email address:');if(!email)return;
  const role=prompt('Role: super_admin, operations_manager, finance, customer_support','operations_manager');if(!role)return;
  const result=await FMV.request('/admin/invitations',{method:'POST',body:{email,role}});
  prompt('Private invitation code for '+email+' (expires in 24 hours):',result.invitation);
});}
function openChangeKeyModal(){FMV.notice('Use Forgot password on the sign-in screen to change your individual password. Shared keys are disabled.');}
function submitNewAdminKey(){openChangeKeyModal();}
function rotateRoleKey(){openChangeKeyModal();}
async function loadFinanceModule(supplied){return FMV.guard(async()=>{
  const result=supplied || await FMV.request('/admin/finance/overview'),l=result.ledger,t=result.tax_compliance,e=FMV.escape;
  for(const [id,value] of [['fin-gross-revenue',l.gross_revenue],['fin-vat-collected',l.vat_collected],['fin-payouts-settled',l.driver_payouts]]){const el=document.getElementById(id);if(el)el.textContent=FMV.money(value);}
  if(document.activeElement!==document.getElementById('fin-zatca-tin'))document.getElementById('fin-zatca-tin').value=t.gstin || '';if(document.activeElement!==document.getElementById('fin-vat-rate'))document.getElementById('fin-vat-rate').value=t.vat_rate;
  window.FMVOperations?.renderCash(result.driver_cash || []);
  document.getElementById('vat-zatca-badge').textContent='India GST';
  document.getElementById('fin-pending-refunds').textContent=result.refund_requests.filter(c=>c.status==='under_review').length;
  FMV.setHTML('finance-refunds-list',result.refund_requests.map(c=>`<div class="fmv-row"><div><strong>${e(c.id)}</strong><p class="fmv-small">${e(c.order_id)} · ${e(c.reason)}<br>${FMV.money(c.amount)} · ${e(c.status)}</p></div>${c.status==='under_review'?`<div class="fmv-flex"><button class="fmv-btn" onclick="authorizeRefund('${e(c.id)}','approved')">Approve review</button><button class="fmv-btn danger" onclick="authorizeRefund('${e(c.id)}','rejected')">Reject</button></div>`:''}</div>`).join('') || FMV.empty('No return or refund claims.'));
});}
async function saveTaxComplianceConfig(){return FMV.guard(async()=>{const result=await FMV.request('/admin/finance/tax-config',{method:'PATCH',body:{zatca_tin:FMV.val('fin-zatca-tin'),vat_rate:Number(FMV.val('fin-vat-rate')),zatca_mode:'india_gst'}});FMV.notice(result.message);loadFinanceModule();});}
async function authorizeRefund(id,status){return FMV.guard(async()=>{const result=await FMV.request('/admin/finance/refunds/'+encodeURIComponent(id),{method:'PATCH',body:{status}});FMV.notice(result.message);loadFinanceModule();});}
async function loadSupportModule(supplied){return FMV.guard(async()=>{
  const [users,tickets]=supplied?[supplied.users,supplied.tickets]:await Promise.all([FMV.request('/admin/support/users'),FMV.request('/admin/support/tickets')]),e=FMV.escape;
  FMV.setHTML('support-user-directory',users.users.map(u=>`<div class="fmv-row"><div><strong>${e(u.full_name)}</strong><p class="fmv-small">${e(u.email)} · ${e(u.phone)}<br>${e(u.address)}</p></div></div>`).join('') || FMV.empty('No customer accounts yet.'));
  FMV.setHTML('support-tickets-container',tickets.tickets.map(t=>`<div class="fmv-row"><div><strong>${e(t.subject || t.summary)}</strong><p class="fmv-small">${e(t.customer_email)} · ${e(t.category)} · ${e(t.status)}<br>${e(t.description)}</p></div>${t.status!=='resolved'?`<button class="fmv-btn" onclick="resolveSupportTicket('${e(t.id)}')">Resolve</button>`:''}</div>`).join('') || FMV.empty('No tickets.'));
});}
async function submitSupportTicket(){return FMV.guard(async()=>{await FMV.request('/admin/support/tickets',{method:'POST',body:{customer_email:FMV.val('ticket-customer-email'),category:FMV.val('ticket-category'),summary:FMV.val('ticket-summary')}});closeNewTicketModal();FMV.notice('Ticket saved.');loadSupportModule();});}
async function resolveSupportTicket(id){return FMV.guard(async()=>{await FMV.request('/admin/support/tickets/'+encodeURIComponent(id),{method:'PATCH',body:{status:'resolved'}});loadSupportModule();});}
async function loadAdminAttendance(supplied){return FMV.guard(async()=>{
  const [a,sos]=supplied?[supplied.attendance,supplied.sos]:await Promise.all([FMV.request('/admin/attendance'),FMV.request('/admin/sos')]),e=FMV.escape;
  FMV.setHTML('fmv-attendance-list',a.shifts.slice().reverse().map(sh=>`<div class="fmv-row"><div><strong>${e(sh.driver_name)}</strong><p class="fmv-small">${e(sh.clock_in)} · ${e(sh.status)}<br>${(sh.work_seconds/3600).toFixed(2)} work hours · ${(sh.break_duration_seconds/60).toFixed(0)} break minutes</p></div></div>`).join('') || FMV.empty('No attendance yet.'));
  FMV.setHTML('fmv-sos-list',sos.alerts.map(a=>`<div class="fmv-row"><div><strong>SOS · ${e(a.driver_name)}</strong><p class="fmv-small">${e(a.message)}<br>${e(a.created_at)}</p></div></div>`).join('') || FMV.empty('No SOS alerts.'));
});}
function exportAttendance(){return FMV.guard(async()=>{const month=prompt('Month (YYYY-MM):',new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}).slice(0,7));if(month)await FMV.download('/admin/attendance/export?month='+encodeURIComponent(month),'attendance-'+month+'.csv');});}
document.addEventListener('fmv:authenticated',checkAdminAuth);
document.addEventListener('fmv:sync',refreshAdmin);
document.addEventListener('DOMContentLoaded',()=>{
  const price=document.getElementById('new-prod-price');if(price){const label=document.createElement('label');label.className='block';label.textContent='Initial available stock';const input=document.createElement('input');input.id='fmv-new-stock';input.type='number';input.min='0';input.step='1';input.value='0';input.className=price.className;label.append(input);price.parentElement.after(label);}
  const table=document.getElementById('admin-product-table')?.closest('table');if(table){const wrapper=table.parentElement;if(wrapper.id==='fmv-admin-catalog-scroll')wrapper.classList.add('fmv-table-scroll');else{const scroll=document.createElement('div');scroll.className='fmv-table-scroll';table.parentElement.insertBefore(scroll,table);scroll.append(table);}}
  const dashboard=document.getElementById('staff-dashboard');if(dashboard){const panel=document.createElement('section');panel.className='fmv-panel';panel.setAttribute('data-rbac-module','operations_logistics');panel.setAttribute('data-admin-panel','logistics');panel.innerHTML='<div class="fmv-row"><h3>Driver attendance & fleet alerts</h3><button class="fmv-btn" onclick="exportAttendance()">Monthly hours CSV</button></div><div id="fmv-attendance-list"></div><h3>SOS alerts</h3><div id="fmv-sos-list"></div>';dashboard.append(panel);}
  const mode=document.getElementById('fin-zatca-mode');if(mode)mode.innerHTML='<option value="india_gst">India GST</option>';
});

RBAC_ROLES.finance.description = 'Financial ledgers, India GST settings, sales invoices and return/refund review.';
for (const row of RBAC_PERMISSION_MATRIX) row.module = row.module.replace('VAT/ZATCA Tax','India GST');

function shareCustomerDocument(){return FMV.guard(async()=>{
  const file=await FMV.readFile('fmv-share-file');const result=await FMV.request('/admin/documents',{method:'POST',body:{...file,customer_email:FMV.val('fmv-share-email'),title:FMV.val('fmv-share-title'),category:'Shared documents'}});FMV.notice(result.message);document.getElementById('fmv-share-file').value='';
});}
document.addEventListener('DOMContentLoaded',()=>{
  const dashboard=document.getElementById('staff-dashboard');if(!dashboard)return;
  const panel=document.createElement('section');panel.className='fmv-panel';panel.setAttribute('data-rbac-module','customer_support');panel.setAttribute('data-admin-panel','support');panel.innerHTML='<h3>Share a private document with a customer</h3><p class="fmv-small">PDF, PNG, JPEG or UTF-8 text · up to 1.5 MB</p><div class="fmv-flex"><input id="fmv-share-email" class="border rounded-lg p-2" type="email" placeholder="Customer email" aria-label="Customer email"><input id="fmv-share-title" class="border rounded-lg p-2" placeholder="Document title" aria-label="Document title"><input id="fmv-share-file" type="file" accept="application/pdf,image/png,image/jpeg,text/plain" aria-label="Document file"><button class="fmv-btn" onclick="shareCustomerDocument()">Share document</button></div>';dashboard.append(panel);
});


// Admin workspace navigation keeps every view subject to the authenticated role.
const ADMIN_WORKSPACE_TABS = Object.freeze({
  overview: {title:'Workspace overview',description:'Your daily operations, organised in one place.',module:null},
  workforce: {title:'Driver management',description:'Instructions, earnings, reviewed payouts, performance and delivery routes.',module:'driver_management'},
  catalog: {title:'Catalog & inventory',description:'Fresh products, clear prices and stock you can trust.',module:'catalog_inventory'},
  logistics: {title:'Deliveries & fleet',description:'Coordinate assignments, driver approvals and working time.',module:'operations_logistics'},
  finance: {title:'Finance & reviews',description:'Review paid-order revenue, tax settings and return decisions.',module:'finance_billing'},
  returns: {title:'Return Pickup',description:'Review returned items, schedule collection drivers and confirm warehouse receipt.',module:'return_collection'},
  quality: {title:'Yard Quality',description:'Inspect returned items, authorize verified refunds and investigate evidence-based driver loss cases.',module:'return_quality'},
  marketing: {title:'Ads & offers',description:'Publish banners, animated menus, offers and company posts.',module:'content_management'},
  website: {title:'Web Design',description:'Publish website text, animated media and custom sections.',module:'content_management'},
  assistant: {title:'Chatbot',description:'Publish approved knowledge for all company chatbots.',module:'content_management'},
  upi: {title:'Payment',description:'Super-admin control of receiving UPI ID and bank reconciliation.',module:'security_roles'},
  invitations: {title:'Administrator invitations',description:'Invite individual staff and designate content editors.',module:'security_roles'},
  support: {title:'Customer care',description:'Helpful conversations, shared documents and customer details.',module:'customer_support'}
});
let fmvAdminActiveTab = 'overview';
function adminWorkspaceModules(){
  const current=FMV.user;
  if(current?.portal!=='admin')return [];
  const modules=[...(RBAC_ROLES[current.role]?.modules || [])];
  if(['super_admin','operations_manager','finance'].includes(current.role) || current.driver_manager===true || current.payout_approver===true)modules.push('driver_management');
  if(current.content_editor===true && !modules.includes('content_management'))modules.push('content_management');
  if(current.role==='super_admin' || current.role==='operations_manager' || current.driver_manager===true)modules.push('return_collection');
  if(['super_admin','operations_manager','finance'].includes(current.role) || current.driver_manager===true || current.quality_manager===true || current.payout_approver===true) modules.push('return_quality');
  return modules;
}
function groupAdminPanels(){
  const dashboard=document.getElementById('staff-dashboard');if(!dashboard)return;
  for(const tab of Object.keys(ADMIN_WORKSPACE_TABS)){
    let group=document.getElementById('fmv-admin-panel-'+tab);
    if(!group){group=document.createElement('section');group.id='fmv-admin-panel-'+tab;group.className='admin-tab-panel';group.setAttribute('role','region');group.setAttribute('aria-labelledby','fmv-admin-tab-'+tab);dashboard.append(group);}
    for(const panel of Array.from(dashboard.children)){
      if(panel.getAttribute('data-admin-panel')===tab)group.append(panel);
    }
  }
}
function syncAdminNavigation(){
  const nav=document.getElementById('fmv-admin-nav');if(!nav)return;
  const authenticated=FMV.user?.portal==='admin';nav.hidden=!authenticated;
  const modules=adminWorkspaceModules();
  const available=Object.entries(ADMIN_WORKSPACE_TABS).filter(([key,tab])=>!tab.module || modules.includes(tab.module)).map(([key])=>key);
  if(!available.includes(fmvAdminActiveTab))fmvAdminActiveTab='overview';
  for(const button of nav.querySelectorAll('[data-admin-tab]')){
    const tab=button.dataset.adminTab;button.hidden=!authenticated || !available.includes(tab);button.disabled=button.hidden;
    if(tab===fmvAdminActiveTab && !button.hidden)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  }
  for(const tab of Object.keys(ADMIN_WORKSPACE_TABS)){
    const panel=document.getElementById('fmv-admin-panel-'+tab);if(panel)panel.hidden=!authenticated || tab!==fmvAdminActiveTab || !available.includes(tab);
  }
  const active=ADMIN_WORKSPACE_TABS[fmvAdminActiveTab];
  document.getElementById('fmv-admin-page-title').textContent=active.title;
  document.getElementById('fmv-admin-page-description').textContent=active.description;
}
function selectAdminTab(tab,options={}){
  const current=FMV.user,config=ADMIN_WORKSPACE_TABS[tab];
  if(current?.portal!=='admin' || !config || (config.module && !adminWorkspaceModules().includes(config.module)))return false;
  fmvAdminActiveTab=tab;groupAdminPanels();syncAdminNavigation();
  document.dispatchEvent(new CustomEvent('fmv:admin-tab',{detail:tab}));
  if(options.focus)document.querySelector('#fmv-admin-nav [data-admin-tab="'+tab+'"]').focus();
  if(options.scroll!==false && typeof window.scrollTo==='function')window.scrollTo({top:0,behavior:'auto'});
  return true;
}
function openRbacMatrixModal(){
  if(FMV.user?.portal!=='admin'){FMV.showAuth('signin');return;}
  const modal=document.getElementById('rbac-matrix-modal');if(!modal)return;
  const e=FMV.escape;
  document.getElementById('rbac-matrix-table-body').innerHTML=RBAC_PERMISSION_MATRIX.map(row=>'<tr><td>'+e(row.module)+'</td><td>'+e(row.super_admin)+'</td><td>'+e(row.operations_manager)+'</td><td>'+e(row.finance)+'</td><td>'+e(row.customer_support)+'</td></tr>').join('');
  const inviteBox=document.getElementById('rbac-key-management-box'),isSuper=FMV.user.role==='super_admin';inviteBox.classList.toggle('hidden',!isSuper);
  if(isSuper)loadRbacRoleKeys();
  modal.classList.remove('hidden');
}
document.addEventListener('DOMContentLoaded',()=>{
  groupAdminPanels();
  const nav=document.getElementById('fmv-admin-nav');
  nav.addEventListener('click',event=>{const button=event.target.closest('[data-admin-tab]');if(button && nav.contains(button))selectAdminTab(button.dataset.adminTab);});
  nav.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    const buttons=Array.from(nav.querySelectorAll('[data-admin-tab]')).filter(button=>!button.hidden && !button.disabled);if(!buttons.length)return;
    const current=event.target.closest('[data-admin-tab]');let index=buttons.indexOf(current);if(index<0)return;
    event.preventDefault();
    if(event.key==='Home')index=0;else if(event.key==='End')index=buttons.length-1;else index=(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+buttons.length)%buttons.length;
    selectAdminTab(buttons[index].dataset.adminTab,{focus:true});
  });
  syncAdminNavigation();
});
document.addEventListener('fmv:locked',()=>{
  fmvAdminActiveTab='overview';document.getElementById('fmv-admin-nav').hidden=true;document.getElementById('staff-dashboard').classList.add('hidden');
  for(const id of ['product-modal','driver-modal','change-key-modal','rbac-matrix-modal','support-ticket-modal'])document.getElementById(id)?.classList.add('hidden');
  syncAdminNavigation();
});
