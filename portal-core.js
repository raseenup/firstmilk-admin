/* Shared security, API access, entry gate and revision polling for all three portals. */
(() => {
  'use strict';
  const configured = window.FMV_CONFIG?.apiBase;
  const apiBase = (configured || (location.protocol === 'file:' ? 'http://localhost:8000' : location.origin)).replace(/\/$/, '');
  if (location.protocol === 'https:' && !apiBase.startsWith('https://')) throw new Error('The API must use HTTPS.');
  const nativeFetch = window.fetch.bind(window);
  const portal = () => document.body?.dataset.portal || 'customer';
  let user = null, revision = null, syncTimer = null, challenge = null, authMode = 'signin', lastActivity = Date.now(), authBusy = false;
  const tokenKey = () => 'fmv_session_' + portal();
  const token = () => sessionStorage.getItem(tokenKey()) || '';
  const pendingKey = () => 'fmv_pending_auth_' + portal();
  let pending = null, challengeClock = null, challengeTimer = null, resendBusy = false, expiredNotice = false;
  let authGeneration = 0, restoreBusy = false, hiddenAt = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const val = id => document.getElementById(id)?.value?.trim() || '';
  const money = amount => new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR'}).format(Number(amount || 0));
  const setHTML = (id, html) => {const el=document.getElementById(id);if(el) el.innerHTML=html;};
  function notice(message, error=false) {
    let el=document.getElementById('fmv-notice');
    if(!el){el=document.createElement('div');el.id='fmv-notice';el.setAttribute('role','status');document.body.append(el);}
    el.textContent=message;el.className=error?'fmv-notice error':'fmv-notice';el.hidden=false;
    clearTimeout(el.dismissTimer);el.dismissTimer=setTimeout(()=>el.hidden=true,8000);
  }
  function validationMessage(data, status) {
    if(typeof data?.detail==='string') return data.detail;
    const labels={email:'Email address',identifier:'Email or mobile',password:'Password',new_password:'New password',full_name:'Full name',phone:'Mobile number',address:'Delivery address',invitation:'Administrator invitation',portal:'Portal',otp:'Verification code',challenge_id:'Verification session',quantity:'Quantity'};
    const messages=Array.isArray(data?.detail)?data.detail.map(issue=>{
      if(!issue || typeof issue!=='object') return '';
      const field=Array.isArray(issue.loc)?[...issue.loc].reverse().find(part=>typeof part==='string' && Object.hasOwn(labels,part)):undefined;
      const label=labels[field] || 'This field';
      const message=typeof issue.msg==='string'?issue.msg:'';
      if(issue.type==='missing') return field?label+' is required.':'Please complete the required fields.';
      if(issue.type==='string_too_short'){
        const minimum=message.match(/at least (\d+) characters?/i)?.[1];
        return minimum?label+' must contain at least '+minimum+(Number(minimum)===1?' character.':' characters.'):label+' is too short.';
      }
      if(issue.type==='string_too_long'){
        const maximum=message.match(/at most (\d+) characters?/i)?.[1];
        return maximum?label+' must contain no more than '+maximum+(Number(maximum)===1?' character.':' characters.'):label+' is too long.';
      }
      if(field==='email') return 'Enter a valid email address.';
      if(field==='otp') return 'Enter the six-digit verification code from your email.';
      if(field==='phone') return 'Enter a valid Indian mobile number.';
      if(issue.type==='int_parsing' || issue.type==='int_type') return label+' must be a whole number.';
      return field?label+' is invalid. Please check it and try again.':'Please check the form fields and try again.';
    }).filter(Boolean):[];
    return messages.length?[...new Set(messages)].join(' '):'The request could not be completed ('+status+').';
  }
  function signupPasswordMessage(password) {
    const length=Array.from(password).length;
    if(length<12) return 'Password must contain at least 12 characters.';
    if(length>128) return 'Password must contain no more than 128 characters.';
    if(!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Password must contain at least one letter and one number.';
    return '';
  }
  const reads=new Map(), refreshes=new Map();
  let changeTimer=null, syncFailures=0, mutationEpoch=0;
  async function rawRequest(path, options={}) {
    const headers=new Headers(options.headers || {});
    const requestToken=token();
    if(requestToken) headers.set('Authorization','Bearer '+requestToken);
    if(options.body && typeof options.body !== 'string'){headers.set('Content-Type','application/json');options={...options,body:JSON.stringify(options.body)};}
    let response;
    try{response=await nativeFetch(apiBase+path,{...options,headers,credentials:'omit',cache:'no-store',signal:options.signal || AbortSignal.timeout(30000)});}
    catch(e){throw new Error('The server could not be reached. Please retry.');}
    const contentType=response.headers.get('content-type') || '';
    const data=contentType.includes('json')?await response.json():null;
    if(!response.ok){
      if(response.status===401 && requestToken && !path.startsWith('/auth/') && token()===requestToken) lock();
      const error=new Error(validationMessage(data,response.status));error.status=response.status;
      const numberHeader=name=>{const value=response.headers.get(name);return value!==null && Number.isFinite(Number(value))?Number(value):null;};
      error.timing={server_time:numberHeader('X-Server-Time'),resend_available_at:numberHeader('X-Resend-Available-At'),expires_at:numberHeader('X-OTP-Expires-At'),retry_after:numberHeader('Retry-After')};
      throw error;
    }
    if(requestToken && token()!==requestToken){const error=new Error('Session changed.');error.stale=true;throw error;}
    if(user && !['GET','HEAD'].includes((options.method || 'GET').toUpperCase()) && !path.startsWith('/auth/')){
      mutationEpoch++;clearTimeout(changeTimer);changeTimer=setTimeout(()=>{if(user)document.dispatchEvent(new CustomEvent('fmv:sync'));},80);
    }
    return data;
  }
  function request(path,options={}){
    const method=(options.method || 'GET').toUpperCase();
    if(method!=='GET' || options.signal)return rawRequest(path,options);
    const key=token()+':'+path;
    if(!reads.has(key))reads.set(key,rawRequest(path,options).finally(()=>reads.delete(key)));
    return reads.get(key);
  }
  async function snapshot(query=''){
    const epoch=mutationEpoch,data=await request('/portal/snapshot'+query);
    if(epoch!==mutationEpoch)return snapshot(query);
    if(user){Object.assign(user,data.user);revision=data.revision;}
    return data;
  }
  function refresh(name,action){
    if(refreshes.has(name)){const current=refreshes.get(name);current.again=true;return current.promise;}
    const current={again:false},sessionToken=token();refreshes.set(name,current);
    current.promise=(async()=>{do{current.again=false;await action();}while(current.again && user && token()===sessionToken);})()
      .finally(()=>{if(refreshes.get(name)===current)refreshes.delete(name);});
    return current.promise;
  }
  function scheduleSync(delay=2000){
    clearTimeout(syncTimer);if(user && !document.hidden)syncTimer=setTimeout(pollSync,delay);
  }
  async function pollSync(){
    if(!user || document.hidden)return;
    if(Date.now()-lastActivity>30*60*1000){await logout();return;}
    try{
      const data=await request('/sync');
      if(syncFailures)notice('Connection restored. Your records are updating.');syncFailures=0;
      if(revision!==data.revision)document.dispatchEvent(new CustomEvent('fmv:sync')); // Snapshot success acknowledges the revision; failed refreshes retry.
    }catch(error){if(user && !error.stale && !syncFailures++)notice(error.message,true);}
    scheduleSync(Math.min(15000,2000*Math.max(1,syncFailures)));
  }
  // Retained module functions that still call fetch receive the same scoped session.
  window.fetch=(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.origin===new URL(apiBase).origin && token()){
      const headers=new Headers(options.headers || (input instanceof Request?input.headers:undefined));
      headers.set('Authorization','Bearer '+token());options={...options,headers,credentials:'omit'};
    }
    return nativeFetch(input,options);
  };
  function gateMessage(message,error=false){const e=document.getElementById('fmv-auth-message');if(e){e.textContent=message;e.classList.toggle('error',error);}}
  function hideExistingAccount(){const panel=document.getElementById('fmv-existing-account');if(panel)panel.hidden=true;}
  function showExistingAccount(message){
    const panel=document.getElementById('fmv-existing-account');
    if(!panel){gateMessage(message,true);return;}
    document.getElementById('fmv-existing-account-message').textContent=message;
    panel.hidden=false;gateMessage('');
  }
  function clearChallenge(){
    challenge=null;pending=null;challengeClock=null;expiredNotice=false;
    clearInterval(challengeTimer);challengeTimer=null;sessionStorage.removeItem(pendingKey());
  }
  function challengeNow(){
    return pending.server_time+(challengeClock.elapsed+Math.max(0,performance.now()-challengeClock.monotonic))/1000;
  }
  function updateChallengeClock(){
    const button=document.getElementById('fmv-resend');if(!button)return;
    if(!challenge || !pending){button.disabled=true;button.textContent='Resend code';document.getElementById('fmv-auth-submit').disabled=authBusy || resendBusy;return;}
    const now=challengeNow(),seconds=Math.max(0,Math.ceil(pending.resend_available_at-now)),expired=now>=pending.expires_at;
    button.disabled=authBusy || resendBusy || seconds>0 || expired;
    button.textContent=expired?'Code expired':resendBusy?'Sending code…':seconds?'Resend code in '+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'):'Resend code';
    document.getElementById('fmv-auth-submit').disabled=authBusy || resendBusy || expired;
    if(expired && !expiredNotice){expiredNotice=true;gateMessage('Verification code expired. Choose Start again to sign in or sign up.',true);}
  }
  function useChallenge(data,restored=false){
    if(typeof data.challenge_id!=='string' || !data.challenge_id)throw new Error('The verification request could not be confirmed. Please try again.');
    const finite=value=>typeof value==='number' && Number.isFinite(value);
    const server=finite(data.server_time)?data.server_time:Date.now()/1000;
    challenge=data.challenge_id;
    // Persist only challenge identity, portal/mode and timing, never form input.
    pending={portal:portal(),mode:authMode,challenge_id:challenge,server_time:server,
      resend_available_at:finite(data.resend_available_at)?data.resend_available_at:server+60,
      expires_at:finite(data.expires_at)?data.expires_at:server+(finite(data.expires_in)?data.expires_in:300),
      received_at:restored?data.received_at:Date.now()};
    challengeClock={monotonic:performance.now(),elapsed:restored?Math.max(0,Date.now()-pending.received_at):0};
    hiddenAt=document.hidden?Date.now():null;
    sessionStorage.setItem(pendingKey(),JSON.stringify(pending));expiredNotice=false;
    clearInterval(challengeTimer);challengeTimer=setInterval(updateChallengeClock,250);
    renderAuth();
  }
  function restoreChallenge(){
    try{
      const data=JSON.parse(sessionStorage.getItem(pendingKey()) || 'null');
      if(!data)return false;
      if(data.portal!==portal() || !['signin','signup'].includes(data.mode) || typeof data.challenge_id!=='string' || !data.challenge_id || data.challenge_id.length>200 || !['server_time','resend_available_at','expires_at','received_at'].every(key=>typeof data[key]==='number' && Number.isFinite(data[key])) || data.expires_at<data.server_time)throw new Error('Invalid pending verification.');
      authMode=data.mode;useChallenge(data,true);return true;
    }catch(e){clearChallenge();return false;}
  }
  function authFieldsVisible(visible){
    const fields=document.getElementById('fmv-auth-fields'),check=document.getElementById('fmv-session-check');
    if(fields)fields.hidden=!visible;if(check)check.hidden=visible;
  }
  function setMode(mode){authGeneration++;authMode=mode;clearChallenge();document.getElementById('fmv-auth-form').reset();authFieldsVisible(true);renderAuth();}
  function renderAuth(){
    const signup=authMode==='signup';
    hideExistingAccount();
    document.getElementById('fmv-auth-subtitle').textContent=challenge?'One more step to keep your account secure.':signup?'Create your account and start your fresh routine.':'Welcome back. Sign in securely to continue.';
    document.getElementById('fmv-auth-identifier-label').textContent=signup?'Email address':'Email or mobile';
    document.getElementById('fmv-password-reset').hidden=signup || !!challenge;
    document.getElementById('fmv-signup-fields').hidden=!signup;
    document.getElementById('fmv-auth-otp-fields').hidden=!challenge;
    document.getElementById('fmv-auth-credentials').hidden=!!challenge;
    document.getElementById('fmv-auth-submit').textContent=challenge?'Verify code':signup?'Create account & send code':'Sign in & send code';
    document.getElementById('fmv-tab-signin').setAttribute('aria-selected',String(!signup));
    document.getElementById('fmv-tab-signup').setAttribute('aria-selected',String(signup));
    document.getElementById('fmv-auth-name').required=signup && !challenge;
    document.getElementById('fmv-auth-phone').required=signup && !challenge;
    document.getElementById('fmv-auth-address').required=signup && !challenge;
    document.getElementById('fmv-auth-identifier').required=!challenge;
    document.getElementById('fmv-auth-password').required=!challenge;
    document.getElementById('fmv-auth-otp').required=!!challenge;
    document.getElementById('fmv-admin-invite').hidden=portal()!=='admin';
    document.getElementById('fmv-auth-invitation').required=portal()==='admin' && signup && !challenge;
    document.getElementById('fmv-admin-invitation-help').hidden=portal()!=='admin' || !!challenge;
    const input=document.getElementById('fmv-auth-identifier');input.type=signup?'email':'text';input.placeholder=signup?'you@example.com':'Email or Indian mobile number';
    const passwordInput=document.getElementById('fmv-auth-password');
    passwordInput.autocomplete=signup?'new-password':'current-password';
    passwordInput.setCustomValidity('');
    if(signup && !challenge) passwordInput.setAttribute('minlength','12');
    else passwordInput.removeAttribute('minlength');
    document.getElementById('fmv-password-help').hidden=!signup || !!challenge;
    gateMessage(challenge?'Enter the six-digit code from your email. It expires after five minutes.':signup && portal()==='driver'?'Driver accounts need email verification and administrator approval.':signup && portal()==='admin'?'Use the invitation issued for your email address.':'');
    updateChallengeClock();
  }
  async function submitAuth(event){
    event.preventDefault();if(authBusy)return;authBusy=true;
    const generation=authGeneration,btn=document.getElementById('fmv-auth-submit');btn.disabled=true;
    try{
      if(challenge){
        if(challengeNow()>=pending.expires_at)throw new Error('Verification code expired. Choose Start again.');
        const result=await request('/auth/verify-otp',{method:'POST',body:{challenge_id:challenge,otp:val('fmv-auth-otp')}});
        if(generation!==authGeneration)return;
        if(result.pending_approval){
          setMode('signin');sessionStorage.setItem('fmv_driver_application_submitted','true');
          const banner=document.getElementById('fmv-driver-submitted');banner.hidden=false;
          document.getElementById('fmv-driver-submitted-message').textContent=result.message;banner.focus();return;
        }
        if(!result.access_token || !result.user || result.user.portal!==portal())throw new Error('The session could not be confirmed. Start sign-in again.');
        sessionStorage.setItem(tokenKey(),result.access_token);user=result.user;clearChallenge();unlock();
      }else{
        const signup=authMode==='signup';
        if(signup){const message=signupPasswordMessage(document.getElementById('fmv-auth-password').value);if(message)throw new Error(message);}
        const body=signup?{email:val('fmv-auth-identifier'),password:document.getElementById('fmv-auth-password').value,full_name:val('fmv-auth-name'),phone:val('fmv-auth-phone'),address:val('fmv-auth-address'),invitation:val('fmv-auth-invitation'),portal:portal()}:{identifier:val('fmv-auth-identifier'),password:document.getElementById('fmv-auth-password').value,portal:portal()};
        const result=await request('/auth/'+(signup?'signup':'signin'),{method:'POST',body});
        if(generation!==authGeneration)return;
        document.getElementById('fmv-auth-password').value='';useChallenge(result);document.getElementById('fmv-auth-otp').focus();
      }
    }catch(e){if(generation===authGeneration){if(!challenge && authMode==='signup' && e.status===409)showExistingAccount(e.message);else gateMessage(e.message,true);}}finally{authBusy=false;btn.disabled=false;updateChallengeClock();}
  }
  function lock(){
    authGeneration++;sessionStorage.removeItem(tokenKey());clearChallenge();user=null;clearTimeout(syncTimer);syncTimer=null;clearTimeout(changeTimer);reads.clear();refreshes.clear();revision=null;
    document.documentElement.classList.add('fmv-locked');
    document.getElementById('fmv-auth-gate')?.removeAttribute('hidden');
    if(document.getElementById('fmv-session-bar'))document.getElementById('fmv-session-bar').hidden=true;
    if(document.getElementById('fmv-auth-form')){authMode='signin';document.getElementById('fmv-auth-form').reset();authFieldsVisible(true);renderAuth();}
    document.dispatchEvent(new CustomEvent('fmv:locked'));
  }
  function unlock(){
    clearChallenge();
    document.documentElement.classList.remove('fmv-locked');document.getElementById('fmv-auth-gate').hidden=true;
    document.getElementById('fmv-auth-form').reset();lastActivity=Date.now();
    document.getElementById('fmv-session-bar').hidden=portal()==='customer';
    document.getElementById('fmv-session-name').textContent=(user.full_name || user.email)+' · '+portal();
    document.dispatchEvent(new CustomEvent('fmv:authenticated',{detail:user}));
    sessionStorage.removeItem('fmv_driver_application_submitted');
    scheduleSync();
  }
  async function logout(){
    const revocation=token()?request('/auth/logout',{method:'POST'}):Promise.resolve();lock();
    try{await revocation;}catch(e){if(![401,403].includes(e.status))gateMessage('Signed out on this device. The server could not confirm revocation of this session; it may remain valid until its normal expiry.',true);}
  }
  async function resendCode(){
    updateChallengeClock();if(document.getElementById('fmv-resend').disabled)return;
    const generation=authGeneration;resendBusy=true;updateChallengeClock();
    try{
      const result=await request('/auth/request-otp',{method:'POST',body:{challenge_id:challenge}});
      if(generation!==authGeneration)return;
      document.getElementById('fmv-auth-otp').value='';useChallenge(result);gateMessage(result.message || 'A new verification code has been sent.');
    }catch(e){
      if(generation!==authGeneration)return;
      if(e.status===429 && pending){
        const times=e.timing || {},server=times.server_time??challengeNow();
        useChallenge({challenge_id:challenge,server_time:server,resend_available_at:times.resend_available_at??server+(times.retry_after??60),expires_at:times.expires_at??pending.expires_at});
      }
      gateMessage(e.message,true);
    }finally{resendBusy=false;updateChallengeClock();}
  }
  async function restoreSession(){
    if(restoreBusy || !token())return;
    restoreBusy=true;const storedToken=token(),generation=authGeneration;authFieldsVisible(false);
    document.getElementById('fmv-session-status').textContent='Checking your saved session…';
    document.getElementById('fmv-session-retry').hidden=true;document.getElementById('fmv-session-discard').hidden=true;
    try{
      const result=await request('/auth/session');
      if(token()!==storedToken || generation!==authGeneration)return;
      if(result.user && result.user.portal!==portal()){lock();gateMessage('This saved session belongs to a different portal. Please sign in here.',true);return;}
      if(!result.user)throw new Error('The session response could not be confirmed.');
      user=result.user;unlock();
    }catch(e){
      if(token()!==storedToken || generation!==authGeneration)return;
      if([401,403].includes(e.status)){lock();gateMessage('Your saved session has expired or was revoked. Please sign in again.',true);}
      else{
        document.getElementById('fmv-session-status').textContent='We could not check your saved session. Your sign-in is kept on this device. Retry when the connection returns.';
        document.getElementById('fmv-session-retry').hidden=false;document.getElementById('fmv-session-discard').hidden=false;
      }
    }finally{restoreBusy=false;}
  }
  async function guard(action){try{return await action();}catch(e){if(!e.stale)notice(e.message,true);return null;}}
  async function download(path,name){
    const response=await nativeFetch(apiBase+path,{headers:{Authorization:'Bearer '+token()},credentials:'omit'});
    if(!response.ok)throw new Error('Download is unavailable.');
    const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;const disposition=response.headers.get('Content-Disposition') || '';const encodedName=disposition.match(/filename\*=UTF-8''([^;]+)/i);a.download=encodedName?decodeURIComponent(encodedName[1]):name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function pay(orderId){
    const details=await request('/payments/create',{method:'POST',body:{order_id:orderId}});
    if(!window.Razorpay){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://checkout.razorpay.com/v1/checkout.js';s.onload=resolve;s.onerror=()=>reject(new Error('Payment checkout could not be loaded.'));document.head.append(s);});}
    await new Promise((resolve,reject)=>{
      const checkout=new window.Razorpay({key:details.key_id,amount:details.amount,currency:'INR',order_id:details.provider_order_id,name:'First Milk Venture',
        prefill:{name:user.full_name,email:user.email,contact:user.phone},
        handler:async response=>{try{await request('/payments/verify',{method:'POST',body:{order_id:orderId,...response}});notice('Payment verified.');document.dispatchEvent(new CustomEvent('fmv:sync'));resolve();}catch(e){reject(e);}},
        modal:{ondismiss:()=>reject(new Error('Payment was not completed. You can resume it from Orders.'))}});
      checkout.on('payment.failed',()=>reject(new Error('Payment failed. Check Orders before retrying.')));checkout.open();
    });
  }
  function readFile(inputId){return new Promise((resolve,reject)=>{const file=document.getElementById(inputId)?.files?.[0];if(!file){reject(new Error('Choose a file.'));return;}if(file.size>1500000){reject(new Error('Choose a file smaller than 1.5 MB.'));return;}const reader=new FileReader();reader.onerror=()=>reject(new Error('The file could not be read.'));reader.onload=()=>resolve({filename:file.name,mime_type:file.type || 'text/plain',data_base64:String(reader.result).split(',')[1]});reader.readAsDataURL(file);});}
  function empty(message='No records yet.'){return '<p class="fmv-empty">'+escape(message)+'</p>';}
  window.FMV={apiBase,request,snapshot,refresh,escape,val,money,setHTML,notice,guard,download,pay,empty,logout,lock,readFile,
    showAuth:mode=>{lock();setMode(mode || 'signin');},get user(){return user;},get token(){return token();},get portal(){return portal();}};
  // Preserve the original event attributes in source, but execute only named, trusted
  // application actions through listeners. No eval, Function constructor or inline
  // script permission is needed, including for newly rendered cart/order controls.
  const trustedActions=new Set(["addToCart", "adjustQty", "appendChat", "applyRbacPermissions", "applyWhiteLabelBranding", "approveAndConvertQuote", "approveDriver", "authenticateAdmin", "authorizeRefund", "cancelCustomerOrder", "changeCartQty", "changePortalCurrency", "changePortalLanguage", "checkAdminAuth", "checkUserSession", "checkoutCart", "clockOut", "closeAuthModal", "closeCartDrawer", "closeChangeKeyModal", "closeDriverModal", "closeEPODModal", "closeEditProfileModal", "closeNewProductModal", "closeNewTicketModal", "closeRbacMatrixModal", "closeSearchModal", "computeOrderOTP", "createNewDriver", "createQuickForumPost", "deleteDriver", "deleteProduct", "downloadInvoice", "downloadInvoicePDF", "downloadSOAStatement", "downloadSharedFile", "driverOrderCard", "escalateChatToHuman", "executeSearch", "exportAttendance", "filterKnowledgeBase", "formatPortalAmount", "getAuthHeaders", "getDefaultOrders", "handleCustomerSignIn", "handleCustomerSignUp", "handleEnterpriseSSO", "handleLogin", "handleSignOut", "handleStaffLogout", "hideAllViews", "hydrateEnterprisePortalFromBackend", "initEnterprisePortal", "inviteAdministrator", "inviteB2BTeamMember", "isProfileComplete", "loadAdminAttendance", "loadAdminData", "loadAdminDeliveries", "loadDashboardStatus", "loadDriversList", "loadFinanceModule", "loadManifest", "loadProducts", "loadRbacRoleKeys", "loadSupportModule", "logoutDriver", "markNotificationsRead", "oneClickReorder", "openAuthModal", "openCartDrawer", "openChangeKeyModal", "openDriverModal", "openEPODModal", "openEditProfile", "openEditProfileModal", "openExpenseModal", "openNewProductModal", "openNewTicketModal", "openPortalHub", "openRbacMatrixModal", "openSearchModal", "payInvoiceOnline", "previewEPODPhoto", "reassignOrder", "refreshAdmin", "refreshCustomer", "refreshDriver", "removeFromCart", "renderAnalyticsAndAuditLogs", "renderB2BTeamList", "renderCartItems", "renderCommunityForum", "renderCreditAccountSummary", "renderDriverShift", "renderERPConnectors", "renderInvoicesRepository", "renderManifest", "renderNotificationsFeed", "renderPortalTickets", "renderProducts", "renderQuotesList", "renderRMAClaimsList", "renderSharedDocuments", "replyToTicket", "requestNewCustomQuote", "resetPortalIdleTimer", "resolveSupportTicket", "resumePayment", "rotateRoleKey", "saveDriverProfile", "saveFmvCart", "saveProfileDetails", "saveTaxComplianceConfig", "selectDriverTab", "sendAIChatMessage", "sendCustomerAuthOTP", "setAuthTab", "shareCustomerDocument", "showCustomerTracking", "showDashboard", "showProfileView", "showShiftView", "startShift", "submitCSATNPSSurvey", "submitEPOD", "submitNewAdminKey", "submitNewProduct", "submitPortalTicket", "submitRMAClaim", "submitSupportTicket", "subscribeProduct", "switchLanguage", "switchTab", "timeText", "toggleBreak", "togglePortal2FA", "triggerDailyDispatches", "triggerERPSync", "triggerPasswordResetFlow", "triggerSOS", "updateCartBadge", "updateCustomerSubscription", "updateProductStockQty", "updateProfileUI", "updateRouteStatus", "updateWorkTimers", "upgradeSubscriptionPlan", "voteForumTopic"]);
  const boundActions=new WeakMap();
  function bindActions(element){
    if(element.nodeType!==1)return;
    for(const attribute of Array.from(element.attributes)){
      if(!attribute.name.startsWith('on'))continue;
      const eventName=attribute.name.slice(2),source=attribute.value;
      element.removeAttribute(attribute.name);
      const commands=source.split(';').map(s=>s.trim()).filter(Boolean),parsed=[];
      let valid=['click','submit','change','input','keydown','keyup'].includes(eventName);
      for(const command of commands){
        const match=command.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/);
        if(!match || !trustedActions.has(match[1])){valid=false;break;}
        const argumentsText=match[2].trim(),args=[];
        if(argumentsText){
          for(const raw of argumentsText.split(',')){
            const value=raw.trim();
            if(value==='event')args.push({kind:'event'});
            else if(value==='this.value')args.push({kind:'value'});
            else if(value==='this.checked')args.push({kind:'checked'});
            else if(/^'(?:[^'\\]*)'$/.test(value) || /^"(?:[^"\\]*)"$/.test(value))args.push({kind:'literal',value:value.slice(1,-1)});
            else if(/^-?\d+(?:\.\d+)?$/.test(value))args.push({kind:'literal',value:Number(value)});
            else{valid=false;break;}
          }
        }
        parsed.push({name:match[1],args});
      }
      let handlers=boundActions.get(element);if(!handlers){handlers={};boundActions.set(element,handlers);}
      if(handlers[eventName])element.removeEventListener(eventName,handlers[eventName]);
      if(!valid)continue;
      const listener=event=>{
        for(const command of parsed){
          const action=window[command.name];if(typeof action!=='function')continue;
          const args=command.args.map(a=>a.kind==='event'?event:a.kind==='value'?element.value:a.kind==='checked'?element.checked:a.value);
          try{const result=action(...args);if(result?.catch)result.catch(e=>notice(e.message,true));}catch(e){notice(e.message,true);}
        }
      };
      element.addEventListener(eventName,listener);handlers[eventName]=listener;
    }
  }
  function adoptActions(root){if(root.nodeType!==1)return;bindActions(root);for(const child of root.querySelectorAll('*'))bindActions(child);}
  new MutationObserver(records=>{for(const record of records){if(record.type==='attributes')bindActions(record.target);for(const node of record.addedNodes)adoptActions(node);}}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['onclick','onsubmit','onchange','oninput','onkeydown','onkeyup']});

  // The class is set before body rendering, preventing a protected-content flash.
  document.documentElement.classList.add('fmv-locked');
  document.addEventListener('DOMContentLoaded',async()=>{
    adoptActions(document.body);
    const gate=document.createElement('section');gate.id='fmv-auth-gate';gate.setAttribute('aria-label','Portal authentication');
    gate.innerHTML=`<div class="fmv-auth-card"><div class="fmv-brand">FIRST MILK VENTURE</div><p class="fmv-eyebrow">Kerala, India · INR</p><h1>${escape(portal()[0].toUpperCase()+portal().slice(1))} portal</h1><div id="fmv-session-check" hidden><p id="fmv-session-status" role="status">Checking your saved session…</p><button id="fmv-session-retry" type="button" class="fmv-primary" hidden>Retry session check</button><button id="fmv-session-discard" type="button" class="fmv-text-button" hidden>Sign out on this device</button></div><div id="fmv-auth-fields"><p id="fmv-auth-subtitle" class="fmv-subtitle">Welcome back. Sign in securely to continue.</p><div class="fmv-auth-tabs" role="tablist"><button id="fmv-tab-signin" type="button" role="tab">Sign in</button><button id="fmv-tab-signup" type="button" role="tab">Sign up</button></div><aside id="fmv-admin-invitation-help" class="fmv-invitation-help" hidden><strong>Joining as an administrator?</strong><p>Choose Sign up and enter the private invitation code issued for your email address.</p><button type="button" id="fmv-accept-invitation" class="fmv-text-button">Accept administrator invitation →</button><small>Need the first administrator account? The backend owner creates your invitation with manage.py.</small></aside><section id="fmv-driver-submitted" class="fmv-success-banner" role="status" tabindex="-1" hidden><strong>Application submitted successfully</strong><p id="fmv-driver-submitted-message">You will receive an email notification once your driver profile has been approved.</p></section><form id="fmv-auth-form"><div id="fmv-auth-credentials"><div id="fmv-signup-fields"><label>Full name<input id="fmv-auth-name" maxlength="150" autocomplete="name"></label><label>Indian mobile number<input id="fmv-auth-phone" type="tel" placeholder="+91 9XXXXXXXXX" autocomplete="tel"></label><label>Delivery address / assigned area<textarea id="fmv-auth-address" maxlength="1000" autocomplete="street-address" placeholder="Street, town, Kerala, PIN code"></textarea></label><label id="fmv-admin-invite">Administrator invitation code<input id="fmv-auth-invitation" type="password" maxlength="200" autocomplete="off" placeholder="Paste your private invitation code"><small>Use the exact email address named in the invitation. Codes expire after 24 hours.</small></label></div><label><span id="fmv-auth-identifier-label">Email or mobile</span><input id="fmv-auth-identifier" autocomplete="username" maxlength="254"></label><label>Password<input id="fmv-auth-password" type="password" maxlength="128" autocomplete="current-password" aria-describedby="fmv-password-help" placeholder="At least 12 characters, letters and numbers"><small id="fmv-password-help">Use 12–128 characters, including letters and numbers.</small></label></div><div id="fmv-auth-otp-fields" hidden><label>Six-digit email code<input id="fmv-auth-otp" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"></label><button id="fmv-resend" type="button" class="fmv-text-button">Resend code</button><button id="fmv-restart" type="button" class="fmv-text-button">Start again</button></div><div id="fmv-existing-account" class="fmv-existing-account" role="alert" hidden><span class="fmv-existing-account-badge">Already registered</span><h2>Welcome back to First Milk</h2><p id="fmv-existing-account-message"></p><button id="fmv-existing-signin" type="button" class="fmv-primary">Sign in instead</button><small>You can reset your password from the sign-in screen.</small></div><p id="fmv-auth-message" role="status"></p><button class="fmv-primary" id="fmv-auth-submit" type="submit">Sign in & send code</button><button id="fmv-password-reset" type="button" class="fmv-text-button">Forgot password?</button></form><p class="fmv-footer-note">Every sign-in requires an email verification code.</p></div></div>`;
    // Choose the loading state before insertion: no sign-in flash while validating.
    gate.querySelector('#fmv-auth-fields').hidden=!!token();
    gate.querySelector('#fmv-session-check').hidden=!token();
    document.body.prepend(gate);
    const bar=document.createElement('div');bar.id='fmv-session-bar';bar.hidden=true;bar.innerHTML='<span id="fmv-session-name"></span><button type="button" id="fmv-logout">Sign out</button>';document.body.append(bar);
    document.getElementById('fmv-logout').addEventListener('click',logout);
    document.getElementById('fmv-auth-form').addEventListener('submit',submitAuth);
    document.getElementById('fmv-auth-password').addEventListener('invalid',()=>{if(authMode==='signup' && !challenge){const message=signupPasswordMessage(document.getElementById('fmv-auth-password').value);if(message)gateMessage(message,true);}});
    document.getElementById('fmv-tab-signin').addEventListener('click',()=>setMode('signin'));
    document.getElementById('fmv-tab-signup').addEventListener('click',()=>setMode('signup'));
    document.getElementById('fmv-accept-invitation').addEventListener('click',()=>{setMode('signup');document.getElementById('fmv-auth-invitation').focus();});
    document.getElementById('fmv-existing-signin').addEventListener('click',()=>{const identifier=val('fmv-auth-identifier');setMode('signin');document.getElementById('fmv-auth-identifier').value=identifier;document.getElementById('fmv-auth-password').focus();});
    for(const id of ['fmv-auth-identifier','fmv-auth-phone'])document.getElementById(id).addEventListener('input',hideExistingAccount);
    document.getElementById('fmv-restart').addEventListener('click',()=>setMode(authMode));
    document.getElementById('fmv-resend').addEventListener('click',resendCode);
    document.getElementById('fmv-session-retry').addEventListener('click',restoreSession);
    document.getElementById('fmv-session-discard').addEventListener('click',logout);
    document.getElementById('fmv-password-reset').addEventListener('click',()=>guard(async()=>{
      if(authMode!=='signin' || challenge || document.getElementById('fmv-auth-fields').hidden || document.getElementById('fmv-auth-gate').hidden)return;
      const email=prompt('Registered email address:');if(!email)return;
      const result=await request('/auth/password-reset/request',{method:'POST',body:{email,portal:portal()}});
      const otp=prompt('Six-digit code from your email:');if(!otp)return;
      const verified=await request('/auth/verify-otp',{method:'POST',body:{challenge_id:result.challenge_id,otp}});
      const password=prompt('New password (12–128 characters with letters and numbers):');if(!password)return;
      await request('/auth/password-reset/confirm',{method:'POST',body:{reset_token:verified.reset_token,new_password:password}});gateMessage('Password changed. Sign in with your new password.');
    }));
    for(const evt of ['pointerdown','keydown','touchstart'])document.addEventListener(evt,()=>lastActivity=Date.now(),{passive:true});
    const refreshCountdown=()=>{
      if(pending && hiddenAt!==null){
        // On resume, account for platforms whose monotonic clock pauses in sleep.
        // Active-page clock edits never change the monotonic countdown. The server
        // still rejects early resend requests and returns authoritative new anchors.
        const elapsed=challengeClock.elapsed+Math.max(0,performance.now()-challengeClock.monotonic);
        challengeClock={monotonic:performance.now(),elapsed:Math.max(elapsed,Date.now()-pending.received_at,0)};
        hiddenAt=null;
      }
      updateChallengeClock();
    };
    document.addEventListener('visibilitychange',()=>{if(document.hidden)hiddenAt=Date.now();else refreshCountdown();});
    window.addEventListener('pageshow',refreshCountdown);window.addEventListener('focus',refreshCountdown);
    renderAuth();
    if(portal()==='driver' && sessionStorage.getItem('fmv_driver_application_submitted'))document.getElementById('fmv-driver-submitted').hidden=false;
    document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(syncTimer);else scheduleSync(0);});
    window.addEventListener('online',()=>scheduleSync(0));
    if(token()){
      // Let all controller DOMContentLoaded handlers finish building their views
      // before an authenticated event can start rendering data into them.
      setTimeout(restoreSession,0);
    }else restoreChallenge();
  });
})();
