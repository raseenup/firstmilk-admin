/* Public configuration only. Never put service-role, email, JWT or payment secrets here.
   Same origin is recommended. For separately hosted portals set an HTTPS API origin
   and add each exact portal origin to ALLOWED_ORIGINS on the backend. */
window.FMV_CONFIG = Object.freeze({apiBase: (["localhost","127.0.0.1"].includes(location.hostname) || ["/customer/","/admin-portal/","/driver-portal/"].some(path => location.pathname.startsWith(path))) ? "" : "https://backend.firstmilkventure.com", country: "India", state: "Kerala", currency: "INR"});
