/* Arena lobby skin. Presentation layer only: every control below is either a
   native node moved into the new layout (Find Battle, mode selector, Captain
   Control, notifications, Dungeon card) or a shortcut that forwards .click()
   to the native button. No combat, matchmaking or progression code is touched. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const hub = $('mainHub');
  if (!hub || $('alRoot')) return;

  const I = {
    swords: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4 3 5 1 11 11-3 3L6 7 4 3Z"/><path d="m20 3-5 1-3 3m-5 6-4 4 3 3 4-4M4 20l3-3m10 0 3 3"/></svg>',
    helm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 21V10a7 7 0 0 1 14 0v11l-3-2v-4h-2v6h-4v-6H8v4l-3 2Z"/><path d="M9 11h6"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M9 3h6l-1.5 3h-3L9 3Z"/><path d="M8 8c-3 3-5 6-5 9a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4c0-3-2-6-5-9"/><path d="M12 11v6m-2-4h3a1.5 1.5 0 0 1 0 3h-3"/></svg>',
    skull: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M3 4c1 4 3 6 5 6M21 4c-1 4-3 6-5 6"/><path d="M7 12a5 5 0 0 1 10 0v4l-2 1v3H9v-3l-2-1v-4Z"/><path d="M10 13h.01M14 13h.01"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 4-8 8-8s8 3 8 8"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/></svg>',
    bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V4m-8 9H2m20 0h-2"/><path d="M9 13h.01M15 13h.01M9 16h6"/></svg>',
    crown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 18 2 7l5 4 5-7 5 7 5-4-1 11H3Z"/></svg>',
    coins: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="11" cy="23" rx="8" ry="3.5"/><path d="M3 23v-5c0 2 3.6 3.5 8 3.5s8-1.5 8-3.5v5"/><ellipse cx="11" cy="18" rx="8" ry="3.5"/><path d="M3 18v-5c0 2 3.6 3.5 8 3.5"/><ellipse cx="21" cy="12" rx="8" ry="3.5"/><path d="M13 12V8c0-2 3.6-3.5 8-3.5S29 6 29 8v4c0 2-3.6 3.5-8 3.5"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
    shield: '<svg viewBox="0 0 48 52" fill="none"><path d="M24 2 44 9v17c0 12-8 20-20 24C12 46 4 38 4 26V9L24 2Z" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M24 11 35 15v10c0 7-4.5 12-11 15-6.500-3-11-8-11-15V15l11-4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m24 17 4 7-4 7-4-7 4-7Z" fill="currentColor"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 20 1-4L16 5l3 3L8 19l-4 1Z"/></svg>'
  };

  // Forwarders: always resolve the native node at click time.
  const fwd = (ids, fn) => {
    const action=()=>{
      for (const id of [].concat(ids)) { const n = $(id); if (n) { n.click(); return; } }
      if (fn && typeof window[fn] === 'function') window[fn]();
    };
    action.nativeIds=[].concat(ids);return action;
  };

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const btn = (cls, html, label, onClick) => {
    const b = el('button', cls, html); b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    if(onClick.nativeIds)b.dataset.nativeIds=onClick.nativeIds.join(' ');
    b.addEventListener('click', onClick); return b;
  };

  /* ---------- structure ---------- */
  const root = el('div'); root.id = 'alRoot';
  root.innerHTML =
    '<div class="alBg" aria-hidden="true"></div>' +
    '<header class="alTop">' +
      '<div class="alAvatar" id="alAvatar" aria-hidden="true"></div>' +
      '<div class="alWho"><div class="alName" id="alName">New Challenger</div><div class="alMeta" id="alMeta"></div></div>' +
      '<div class="alGold" title="Gold"><span class="alCoin" aria-hidden="true"></span><b id="alGold">0</b></div>' +
      '<span id="alBellSlot"></span><span id="alGearSlot"></span>' +
    '</header>' +
    '<nav class="alTabs" id="alTabs" aria-label="Main menu"></nav>' +
    '<section class="alScene" aria-label="Your squad">' +
      '<div class="alBanner l"></div><div class="alBanner r"></div>' +
      '<div class="alTorch l"></div><div class="alTorch r"></div>' +
      '<div class="alFloor"></div><div id="alPartySlot"></div>' +
    '</section>' +
    '<section class="alStats" aria-label="Rank">' +
      '<div class="alRank"><span class="alEmblem" id="alEmblem">' + I.shield + '</span><div><div class="alTier" id="alTier">Unranked</div><div class="alRP"><b id="alRP">1000</b> RP</div></div></div>' +
      '<div class="alRec"><div class="alWL" id="alWL">0W / 0L</div><div class="alWR" id="alWR">NO MATCHES YET</div></div>' +
      '<div class="alEdit" id="alEditSlot"></div>' +
    '</section>' +
    '<section class="alCtl"><div class="alAi" id="alAi"><span class="alAiIc">' + I.bot + '</span><div><b id="alAiT">AI TEAM</b><small id="alAiS">The whole team fights on AI.</small></div></div><div class="alCap" id="alCapSlot"></div></section>' +
    '<section class="alMode"><div class="alSecT"><span>' + I.swords + '</span>GAME MODE</div><div id="alModeSlot"></div></section>' +
    '<div class="alFind" id="alFindSlot"></div>' +
    '<section class="alShort" id="alShort"></section>' +
    '<details class="alMore" id="alMore"><summary>More</summary><div class="alMoreGrid" id="alMoreGrid"></div></details>';
  hub.insertBefore(root, hub.firstChild);
  const q = s => root.querySelector(s);

  // Tabs
  const tabs = [
    ['ARENA', I.swords, fwd('hubArenaBtn')],
    ['CLASSES', I.helm, fwd('classShopBtn')],
    ['MARKET', I.bag, fwd(['hubMarketBtn', 'marketBtn'])],
    ['DUNGEON', I.skull, fwd('hdHomeBtn')],
    ['PROFILE', I.user, fwd('profileBtn','openProfile')]
  ];
  tabs.forEach(([name, icon, fn], i) => {
    const b = btn('alTab' + (i === 0 ? ' on' : ''), icon + '<span>' + name + '</span>', name, fn);
    if (i === 0) b.setAttribute('aria-current', 'page');
    q('#alTabs').appendChild(b);
  });

  // Gear -> More
  q('#alGearSlot').appendChild(btn('alIconBtn', I.gear, 'More options', () => {
    const d = q('#alMore'); d.open = !d.open;
    if (d.open) d.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
  q('.alGold').appendChild(btn('alPlus', I.plus, 'Open Market', fwd(['hubMarketBtn', 'marketBtn'])));

  // Edit Team: existing squad editor
  q('#alEditSlot').appendChild(btn('alEditBtn', I.pencil + '<span>Edit Team</span>', 'Edit Team', () => {
    const native = document.querySelector('.ar-edit-squad') || $('hubTeamBtn');
    if (native) native.click(); else if (typeof showTeamBuilder === 'function') showTeamBuilder();
  }));
  q('#alEditSlot').appendChild(el('small', null, 'Manage your squad'));

  // Shortcuts (exactly three)
  function openStore(section) {
    if (window.parent === window) {
      // Direct game.html links have no React host to receive bridge messages.
      window.location.assign(new URL('store?section=' + section, location.href).href);
      return;
    }
    window.parent.postMessage({type:'arena:open-store',section}, location.origin);
  }
  const short = q('#alShort');
  const card = (cls, icon, title, sub, fn) => btn('alCard ' + cls,
    '<span class="alCardIc">' + icon + '</span><span class="alCardTx"><b>' + title + '</b><small>' + sub + '</small></span><span class="alChev">' + I.chev + '</span>', title, fn);
  short.appendChild(card('market', I.coins, 'MARKET', 'Buy &amp; sell spells, talents', fwd(['hubMarketBtn', 'marketBtn'])));
  const dunSlot = el('div', 'alDunSlot'); short.appendChild(dunSlot);
  short.appendChild(card('battlepass', I.crown, 'BATTLE PASS', 'Open Shop &amp; rewards', () => openStore('battle-pass')));

  /* ---------- reparent native nodes ---------- */
  function adopt() {
    const hero = $('hubPartyVisual'); if (hero && hero.parentNode !== q('#alPartySlot')) q('#alPartySlot').appendChild(hero);
    const modes = $('hubModeMount'); if (modes && modes.parentNode !== q('#alModeSlot')) q('#alModeSlot').appendChild(modes);
    const join = $('hubJoinBtn'); if (join && join.parentNode !== q('#alFindSlot')) q('#alFindSlot').prepend(join);
    const cc = hub.querySelector('.ccSel'); if (cc && cc.parentNode !== q('#alCapSlot')) { q('#alCapSlot').appendChild(cc); bindCC(cc); }
    const nb = $('mgNotifyBtn'); if (nb && nb.parentNode !== q('#alBellSlot')) q('#alBellSlot').appendChild(nb);
    const dun = $('hdHomeBtn'); if (dun && dun.parentNode !== dunSlot) dunSlot.appendChild(dun);
    const warn = $('tournamentResumeWarning'); if (warn && warn.parentNode !== root) root.insertBefore(warn, q('.alTop').nextSibling);
    const admin = $('adminPracticeBtn'); if (admin && admin.parentNode !== q('#alMoreGrid')) q('#alMoreGrid').appendChild(admin);
  }
  let ccBound = null;
  function bindCC(cc) {
    if (ccBound === cc) return; ccBound = cc;
    cc.addEventListener('click', () => setTimeout(refresh, 0));
  }

  // More area: forwarders to native buttons, plus legacy containers stay mounted.
  q('#alMoreGrid').appendChild(btn('alMoreBtn', 'Shop / Store', 'Shop / Store', () => openStore('featured')));
  [['Team & Characters', 'hubTeamBtn'], ['Join Tournament', 'hubJoinTournamentBtn'], ['Tournament', 'hubTournamentBtn'],
   ['Online Arena', 'hubArenaBtn'], ['Rankings', 'hubArenaRankingsBtn'], ['Leaders', 'hubTournamentLeadersBtn'],
    ['History', 'hubTournamentHistoryBtn'], ['Defense', 'defenseBtn'], ['Balance Lab', 'balanceBtn'], ['Arena Help','arenaHelpBtn']
  ].forEach(([label, id]) => { if ($(id)) q('#alMoreGrid').appendChild(btn('alMoreBtn', label, label, fwd(id))); });

  /* ---------- live state ---------- */
  let tiers = [];
  function rankOf(rp) {
    if (!tiers.length) return null;
    let i = 0; tiers.forEach((t, k) => { if (rp >= t.minimum) i = k; });
    const tier = tiers[i], next = tiers[i + 1];
    const step = next && tier.divisions > 1
      ? Math.min(tier.divisions - 1, Math.max(0, Math.floor((rp - tier.minimum) / ((next.minimum - tier.minimum) / tier.divisions)))) : 0;
    return {name:tier.name,div:next && tier.divisions > 1?' '+['I','II','III'][tier.divisions - 1 - step]:'',
      idx:i,color:tier.color};
  }
  const setText = (node, v) => { if (node && node.textContent !== v) node.textContent = v; };
  const setAttr = (node, k, v) => { if (node && node.getAttribute(k) !== v) node.setAttribute(k, v); };
  const lastText = id => ($(id)?.textContent || '').trim();
  const previewCopies = new WeakMap();
  let previewFrame = null, previewFailureReported = false;
  function schedulePreviews() {
    if(previewFrame !== null || hub.style.display === 'none' ||
      document.body.classList.contains('battleMode') || document.body.classList.contains('teamBuilderMode'))return;
    previewFrame=requestAnimationFrame(()=>{
      previewFrame=null;
      if(hub.style.display==='none' || document.body.classList.contains('battleMode') ||
        document.body.classList.contains('teamBuilderMode'))return;
      const layer=window.GameBody3D;
      if(!layer?.drawPreview)return;
      const portraits=[];
      document.querySelectorAll('#hubPartyVisual .hubPartyFace').forEach(face=>{
        const canvas=face.querySelector('canvas');
        if(!canvas || !face.dataset.paintKey)return;
        const [classId,,racial,skin,index]=JSON.parse(face.dataset.paintKey);
        let copy=previewCopies.get(canvas);
        if(!copy || copy.key!==face.dataset.paintKey){
          copy={key:face.dataset.paintKey,entity:{id:1000+index,classId,team:'player',
            alive:true,hp:1000,maxHp:1000,x:0,y:0,radius:17,moveSpeed:0,status:{},extra:{},
            casting:null,atkTimer:0,lobbyFacing:0,visualFacing:1,visualRace:racial||undefined,skinId:skin||'default'}};
          previewCopies.set(canvas,copy);
        }
        face.style.setProperty('--al-captain-lift',Math.round(canvas.clientWidth*1.1)+'px');
        window.MenuPreviewCanvas?.prepare(canvas,180,220);
        portraits.push({canvas,copy,face});
      });
      const party=portraits.map(p=>p.copy.entity),time=performance.now()/1000;
      const requiredPixels=Math.max(256,...portraits.map(p=>85*2.15*p.canvas.width/180));
      portraits.forEach(({canvas,copy,face})=>{
        const key=copy.key+'|'+layer.enabled+'|'+canvas.width+'x'+canvas.height;
        if(canvas.dataset.alThreeKey===key)return;
        const c=canvas.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);
        c.save();c.scale(canvas.width/180,canvas.height/220);
        c.translate(90,132);c.scale(2.15,2.15);
        c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
        const drawn=layer.drawPreview(c,copy.entity,party,time,requiredPixels);
        c.restore();
        if(!drawn)originalHero(canvas,copy.entity.classId,face.classList.contains('alCaptain'));
        canvas.dataset.alThreeKey=key;
        const stats=layer.previewStats||layer.stats;
        if(stats.phase==='failed' && !previewFailureReported){
          previewFailureReported=true;console.warn('Lobby uses original previews: 3D is unavailable',stats.error);
        }
      });
    });
  }
  const originalHero=window.drawHubLiveHero;
  const resizePreviews=()=>schedulePreviews();
  const previewResize=window.ResizeObserver?new ResizeObserver(resizePreviews):null;
  const previewContainer=$('hubPartyVisual');if(previewContainer)previewResize?.observe(previewContainer);
  window.addEventListener('resize',resizePreviews);
  window.addEventListener('orientationchange',resizePreviews);
  window.addEventListener('pagehide',()=>{
    previewResize?.disconnect();
    window.removeEventListener('resize',resizePreviews);
    window.removeEventListener('orientationchange',resizePreviews);
    if(previewFrame!==null)cancelAnimationFrame(previewFrame);
  },{once:true});
  if(typeof originalHero==='function')window.drawHubLiveHero=function(canvas){
    const result=originalHero.apply(this,arguments);
    if(canvas?.closest('#hubPartyVisual')){delete canvas.dataset.alThreeKey;schedulePreviews();}
    return result;
  };
  document.addEventListener('change',e=>{
    if(e.target.matches('[data-game-graphics]')){
      document.querySelectorAll('#hubPartyVisual canvas').forEach(c=>delete c.dataset.alThreeKey);
      setTimeout(refresh,0);
    }
  });

  function refresh() {
    try {
      adopt();
      const guest=typeof GUEST_TRIAL!=='undefined' && GUEST_TRIAL;
      root.querySelectorAll('button[data-native-ids]').forEach(button=>{
        const native=button.dataset.nativeIds.split(' ').map($).find(Boolean);
        button.disabled=!!native && (native.disabled || (guest && getComputedStyle(native).display==='none'));
        if(button.disabled)button.title=guest?'Sign in to use this feature':'Currently unavailable';
        else button.removeAttribute('title');
      });
      const name = lastText('accountName') || 'New Challenger';
      setText($('alName'), name);
      setText($('alMeta'), lastText('accountMeta'));
      const avatar = document.querySelector('#accountBar .acctAvatar');
      if (avatar && avatar.parentNode !== $('alAvatar')) $('alAvatar').replaceChildren(avatar);
      const g = (lastText('goldDisplay').match(/[\d,]+/) || ['0'])[0];
      setText($('alGold'), g);

      // Rank + record: same server-fed source as squad-ratings.js
      let rec = { rating: 1000, wins: 0, losses: 0 }, team = null;
      if (window.SquadRatings) { rec = window.SquadRatings.activeScore() || rec; team = window.SquadRatings.activeTeam(); }
      else if (typeof playerProfile !== 'undefined' && playerProfile) rec = { rating: playerProfile.rating || 1000, wins: playerProfile.battleWins || 0, losses: playerProfile.battleLosses || 0 };
      if(guest && typeof playerProfile!=='undefined' && playerProfile)
        rec={rating:0,wins:playerProfile.battleWins||0,losses:playerProfile.battleLosses||0};
      const rating=Number(rec.rating);
      const rp = Number.isFinite(rating) ? Math.max(0,Math.round(rating)) : 1000, w = Number(rec.wins) || 0, l = Number(rec.losses) || 0;
      const rk = rankOf(rp);
      setText($('alTier'), typeof GUEST_TRIAL!=='undefined' && GUEST_TRIAL ? 'Practice squad' : rk ? rk.name + rk.div : 'Rank loading');
      setText($('alRP'), String(rp));
      q('.alRP').classList.toggle('alTrialRP',guest);
      setText($('alWL'), w + 'W / ' + l + 'L');
      setText($('alWR'), w + l ? Math.round(100 * w / (w + l)) + '% WIN RATE' : 'NO MATCHES YET');
      if(rk){setAttr($('alEmblem'), 'data-tier', String(rk.idx));$('alEmblem').style.color=rk.color;}

      // Find Battle caption (native button text/handler untouched)
      const ts = typeof teamSize !== 'undefined' ? teamSize : 3;
      const j = $('hubJoinBtn');
      const rankedSize = !guest && (ts === 2 || ts === 3);
      setAttr(j,'aria-label','Find Battle');
      setAttr(j, 'data-al-sub', ts + 'v' + ts + (rankedSize
        ? ' \u00b7 ' + (rk ? rk.name + rk.div + ' \u00b7 ' : '') + rp + ' RP' : ' \u00b7 Local Arena'));
      root.dataset.size = String(ts);

      // Captain crown on the matching live preview (no repaint of canvases)
      const capName = typeof captainClass !== 'undefined' && captainClass && CLASS_STATS[captainClass] ? CLASS_STATS[captainClass].name : null;
      const captainIndex = typeof selected !== 'undefined' ? selected.indexOf(captainClass) : -1;
      let captainMarked = false;
      document.querySelectorAll('#hubPartyVisual .hubPartyFace').forEach(f => {
        const label = f.querySelector('.hubPreviewBadge')?.textContent || '';
        const paint = f.dataset.paintKey ? JSON.parse(f.dataset.paintKey) : null;
        const isCaptain = !!capName && !captainMarked && label === capName &&
          (!paint || paint[4] === captainIndex);
        f.classList.toggle('alCaptain', isCaptain);
        if(isCaptain)captainMarked=true;
      });

      // Auto/Manual status card
      const v = window.CaptainControl?.view ? window.CaptainControl.view() : null;
      const manual = !!v && v.selected === 'manual' && v.available;
      setText($('alAiT'), manual ? 'MANUAL CAPTAIN' : 'AI TEAM');
      setText($('alAiS'), manual ? 'You steer your Captain.' : 'The whole team fights on AI.');
      $('alAi').classList.toggle('manual', manual);

      document.querySelectorAll('#alModeSlot .modeBtn').forEach(b => {
        const on = Number(b.dataset.size) === ts;
        b.classList.toggle('selected',on);
      });
      schedulePreviews();
    } catch (e) { console.error('Arena lobby could not refresh',e); }
  }

  ['updateHubTeamSummary', 'showMainHub', 'setTeamSize', 'updateAccountUI', 'renderSavedTeams'].forEach(n => {
    const orig = window[n];
    if (typeof orig !== 'function') return;
    window[n] = function () { const r = orig.apply(this, arguments); refresh(); return r; };
  });
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    if(e.data?.type==='arena:ranked-progression' && Array.isArray(e.data.rankTiers))tiers=e.data.rankTiers;
    setTimeout(refresh, 0);
  });
  // Mode buttons set teamSize in native handlers; re-read after they run.
  root.addEventListener('click', e => { if (e.target.closest('.modeBtn')) setTimeout(refresh, 0); });
  // Reposition Captain labels when CSS resizes the portraits after rotation.
  window.addEventListener('resize', schedulePreviews);
  // Late-created native nodes (dungeon card, notifications) are adopted shortly after load.
  [250, 1200, 3000].forEach(t => setTimeout(refresh, t));
  document.body.classList.add('alLobby');
  refresh();
  window.parent.postMessage({type:'arena:ranked-progression-request'},location.origin);
})();
