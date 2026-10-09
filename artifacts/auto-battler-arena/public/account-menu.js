/* Additive legacy UI: per-class unlocked-ability Collection view and a
   Notifications button with unread badge in the main menu. Load after game.html
   globals (and mobile-game.js). */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  const style = document.createElement('style');
  style.textContent =
    '#mgNotifyBtn{display:flex;align-items:center;gap:10px;width:100%;margin:0 0 10px;padding:12px 14px;min-height:48px;border-radius:12px;font:inherit;font-weight:800;letter-spacing:.04em;cursor:pointer;color:#eef4ff;background:linear-gradient(135deg,#3a2a66,#1f3b6e);border:1px solid rgba(255,214,120,.55);text-align:left;touch-action:manipulation}' +
    '#mgNotifyBtn svg{width:22px;height:22px;flex:none}#mgNotifyBtn .mgNotifyLabel{flex:1}' +
    '#mgNotifyBadge{min-width:24px;height:24px;padding:0 7px;border-radius:12px;background:#ff5a4d;color:#fff;font-size:13px;line-height:24px;text-align:center;font-weight:900}' +
    '#mgNotifyBadge[hidden]{display:none}body.battleMode #mgNotifyBtn,body.teamBuilderMode #mgNotifyBtn{display:none}' +
    '#mgUnlocked{margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.12)}' +
    '#mgUnlocked h4{margin:10px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#ffd678}' +
    '#mgUnlocked .mgUnlockedEmpty{padding:10px 12px;border-radius:10px;border:1px dashed rgba(255,255,255,.25);font-size:12px;opacity:.8}' +
    '#mgUnlocked .mgUnlockedTitle{font-weight:800;font-size:14px}';
  document.head.appendChild(style);

  // ---- Notifications ----
  let unread = 0;
  function paintBadge() {
    const profileButton=$('profileNotificationsBtn');
    if(profileButton)profileButton.textContent='View Notifications'+(unread>0?' · '+unread+' unread':'');
    const badge = $('mgNotifyBadge'), btn = $('mgNotifyBtn');
    if (!badge || !btn) return;
    badge.hidden = unread <= 0;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    btn.setAttribute('aria-label', 'Notifications' + (unread > 0 ? ', ' + unread + ' unread' : ''));
  }
  const touchWired = new WeakSet();
  function wireNotificationTap(button) {
    if (touchWired.has(button)) return;
    touchWired.add(button);
    let touch = null, lastActivation = -Infinity;
    const moved = (start, end) => Math.hypot(end.clientX-start.x,end.clientY-start.y)>8;
    button.addEventListener('touchstart',event=>{
      const point=event.touches.length===1?event.touches[0]:null;
      touch=point?{id:point.identifier,x:point.clientX,y:point.clientY,time:performance.now()}:null;
    },{passive:true});
    button.addEventListener('touchmove',event=>{
      if(touch && (event.touches.length!==1 || moved(touch,event.touches[0])))touch=null;
    },{passive:true});
    button.addEventListener('touchcancel',()=>{touch=null;},{passive:true});
    button.addEventListener('touchend',event=>{
      const start=touch;touch=null;
      if(!start || button.disabled)return;
      const end=Array.from(event.changedTouches).find(point=>point.identifier===start.id);
      if(!end || moved(start,end) || performance.now()-start.time>600)return;
      lastActivation=performance.now();
      // Preserve the native handler/parent bridge; do not open a second panel.
      button.click();
    },{passive:true});
    button.addEventListener('click',event=>{
      // Safari/Chrome may still emit a compatibility click after our touch tap.
      if(event.isTrusted && performance.now()-lastActivation<800){
        event.preventDefault();event.stopImmediatePropagation();
      }
    },{capture:true});
  }
  function ensureButton() {
    const hub = $('mainHub');
    if (!hub || (typeof GUEST_TRIAL !== 'undefined' && GUEST_TRIAL)) return;
    const profile=$('profileModal')?.firstElementChild;
    if(profile && !$('profileNotificationsBtn')){
      const b=document.createElement('button');b.type='button';b.id='profileNotificationsBtn';
      b.textContent='View Notifications';
      b.style.cssText='width:100%;min-height:44px;margin-top:12px;border-radius:10px;background:#263954;color:#ffe0a0;border:1px solid #647d9e;font-weight:800;cursor:pointer';
      b.onclick=()=>window.parent.postMessage({type:'arena:notifications-open'},location.origin);
      profile.append(b);
    }
    if ($('mgNotifyBtn')) {
      wireNotificationTap($('mgNotifyBtn'));
      if (!hub.contains($('mgNotifyBtn'))) mount($('mgNotifyBtn'), hub);
      return;
    }
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'mgNotifyBtn';
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg><span class="mgNotifyLabel">NOTIFICATIONS</span><span id="mgNotifyBadge" hidden>0</span>';
    b.onclick = () => window.parent.postMessage({ type: 'arena:notifications-open' }, location.origin);
    wireNotificationTap(b);
    mount(b, hub);
    paintBadge();
  }
  function mount(b, hub) {
    const anchor = $('hubTeamSummary') || hub.querySelector('.hubBody');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(b, anchor);
    else hub.prepend(b);
  }
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    const d = e.data;
    if (!d || d.type !== 'arena:notifications-state') return;
    const n = Number(d.unread);
    if (!Number.isFinite(n) || n < 0) return;
    unread = Math.floor(n); paintBadge();
  });

  // ---- Collection: unlocked non-default abilities ----
  function section(title, items) {
    return '<h4>' + title + '</h4>' + (items.length ? items.join('') :
      '<div class="mgUnlockedEmpty">None unlocked yet. Find them as Arena drops or in the Player Market.</div>');
  }
  function paintUnlocked() {
    const box = $('profileSpellCollection');
    if (!box || typeof playerProfile === 'undefined' || !playerProfile) return;
    const key = typeof collectionViewClass !== 'undefined' ? collectionViewClass : null;
    if (!key || !CLASS_STATS[key]) return;
    let wrap = $('mgUnlocked');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'mgUnlocked'; }
    if (wrap.previousElementSibling !== box) box.after(wrap);
    const card = (icon, name, type, desc, art) => spellCardHtml(icon, esc(name), type, esc(desc), true, false, key, art);
    const spells = [], ults = [], talents = [];
    const ca = CUSTOM_ABILITIES[key];
    if (ca && ownsCustomAbility(key)) spells.push(card(customAbilityIcon(key), ca.label, 'Unlocked Spell', ca.line.short || ca.line.d || '', ca.label));
    const cu = CUSTOM_ULTS[key];
    if (cu && ownsCustomUlt(key)) ults.push(card(customUltIcon(key), cu.label, 'Unlocked Ultimate', cu.line.short || cu.line.d || '', variantArtName(key, 'ult', 'custom')));
    if (key === 'frostmage' && ownsCustomUlt(key)) ults.push(card('', MAGE_POLYMORPH_ULT.label, 'Unlocked Ultimate', MAGE_POLYMORPH_ULT.line.short || MAGE_POLYMORPH_ULT.line.d || '', 'Hexform'));
    const owned = (playerProfile.unlockedTalents && playerProfile.unlockedTalents[key]) || [];
    const free = freeTalentIds(key);
    (CLASS_TALENTS[key] || []).forEach(t => {
      if (Array.isArray(owned) && owned.includes(t.id) && !free.includes(t.id))
        talents.push(card('', t.name, 'Unlocked Talent · ' + t.branch, t.desc, t.name));
    });
    wrap.innerHTML = '<div class="mgUnlockedTitle">' + esc(CLASS_STATS[key].name) + ' — permanent unlocks</div>' +
      section('Spells', spells) + section('Talents', talents) + section('Ultimates', ults);
  }
  if (typeof renderProfileCollection === 'function') {
    const orig = renderProfileCollection;
    renderProfileCollection = function () {
      const r = orig.apply(this, arguments);
       try { paintUnlocked(); } catch (err) { console.error('Could not render permanent Collection unlocks',err); }
      return r;
    };
  }
  ['showMainHub', 'updateAccountUI'].forEach(name => {
    if (typeof window[name] !== 'function') return;
    const orig = window[name];
    window[name] = function () { const r = orig.apply(this, arguments); ensureButton(); return r; };
  });
  ensureButton();
  window.parent.postMessage({type:'arena:notifications-refresh'},location.origin);
})();
