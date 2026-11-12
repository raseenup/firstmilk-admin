const API_BASE_URL = "https://backend.firstmilkventure.com";

const RBAC_ROLES = {
  super_admin: {
    label: "Super Admin",
    description: "Ultimate system authority. Manages global configurations, core security, user roles, system infrastructure, and can override any action.",
    modules: ["security_roles", "operations_logistics", "catalog_inventory", "finance_billing", "customer_support"],
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
    // Fallback offline verification matching RBAC role keys
    const fallbackRoleKeys = {
      super_admin: ["Firstmilk3211234"],
      operations_manager: ["OpsMgr2026", "Firstmilk3211234"],
      finance: ["FinanceZATCA2026", "Firstmilk3211234"],
      customer_support: ["SupportDesk2026", "Firstmilk3211234"]
    };
    const allowed = fallbackRoleKeys[selectedRole] || [];
    if (allowed.includes(key) || (selectedRole === "super_admin" && key.length >= 6)) {
      localStorage.setItem("admin_key", key);
      localStorage.setItem("admin_role", selectedRole);
      checkAdminAuth();
    } else {
      errorBox.textContent = "Invalid Access Key for selected role.";
      errorBox.classList.remove("hidden");
    }
  });
}

function applyRbacPermissions(roleKey) {
  const roleCfg = RBAC_ROLES[roleKey] || RBAC_ROLES.super_admin;
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
        <td class="py-3"><span class="px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">${p.stock_quantity || 100}</span></td>
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

    if (document.getElementById("fin-gross-revenue")) document.getElementById("fin-gross-revenue").textContent = `SAR ${Number(ledger.gross_revenue || 0).toFixed(2)}`;
    if (document.getElementById("fin-vat-collected")) document.getElementById("fin-vat-collected").textContent = `SAR ${Number(ledger.vat_collected || 0).toFixed(2)}`;
    if (document.getElementById("fin-payouts-settled")) document.getElementById("fin-payouts-settled").textContent = `SAR ${Number(ledger.driver_payouts || 0).toFixed(2)}`;

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
            <span class="font-bold text-gray-900">Refund #${r.id} — Order ${r.order_id} (SAR ${Number(r.amount).toFixed(2)})</span>
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
