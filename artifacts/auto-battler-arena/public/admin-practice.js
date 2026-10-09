/* 4321 is deliberately a public convenience code. Practice uses an isolated,
   disposable game document; it never grants an authenticated admin role. */
(function () {
  if (PRACTICE_ONLY) {
    const originalStart = startBattle;
    startBattle = function (opts) {
      if (opts && (opts.onlineChallenge || opts.tournament)) {
        showUnlockToast('Practice supports local AI battles only.');
        return;
      }
      return originalStart(opts);
    };
    startTournament = function () {
      showUnlockToast('Tournaments are unavailable in practice.');
    };
    const subtitle = document.querySelector('.hubSub');
    if (subtitle) subtitle.textContent = 'All classes, spells, ultimates, racials, talents and skins are available for unlimited AI practice.';
    window.parent.postMessage({ type: 'arena:practice-ready' }, location.origin);
    return;
  }

  const button = document.getElementById('adminPracticeBtn');
  if (!button) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'adminPracticeDialog';
  dialog.setAttribute('aria-labelledby', 'adminPracticeTitle');
  dialog.innerHTML = '<form id="adminPracticeForm">' +
    '<h2 id="adminPracticeTitle">Admin practice</h2>' +
    '<p>Enter the public code to try every class, spell, ultimate, racial, talent and skin.</p>' +
    '<p>Practice only. Your saved squad, Gold, market inventory and ranked progress stay unchanged. Practice builds disappear when you exit.</p>' +
    '<label for="adminPracticeCode">Code</label>' +
    '<input id="adminPracticeCode" type="text" inputmode="numeric" maxlength="4" autocomplete="off" required aria-describedby="adminPracticeError" data-testid="input-admin-code">' +
    '<div id="adminPracticeError" class="adminPracticeError" role="alert"></div>' +
    '<div class="adminPracticeActions"><button class="secondary" type="button" id="adminPracticeCancel">Cancel</button>' +
    '<button class="primary" type="submit" data-testid="button-unlock-practice">Unlock practice</button></div></form>';
  document.body.appendChild(dialog);
  const form = dialog.querySelector('form');
  const code = dialog.querySelector('input');
  const error = dialog.querySelector('#adminPracticeError');
  let stage = null, frame = null, loadTimer = null;
  let resumeMusic = false, previousMusicMode = 'menu';

  function closePractice() {
    if (loadTimer) clearTimeout(loadTimer);
    loadTimer = null;
    // Removing the document releases its RAF, timers, audio and temporary
    // profile. Practice never attaches landscape listeners to its parent.
    if (frame) frame.remove();
    frame = null;
    if (stage) stage.remove();
    stage = null;
    dialog.classList.remove('practiceOpen');
    document.body.classList.remove('adminPracticeOpen');
    dialog.setAttribute('aria-labelledby', 'adminPracticeTitle');
    form.hidden = false;
    code.value = '';
    error.textContent = '';
    code.removeAttribute('aria-invalid');
    if (resumeMusic) setMusicMode(previousMusicMode);
    resumeMusic = false;
  }
  function dismiss() {
    dialog.close();
    closePractice();
    window.parent.postMessage({ type: 'arena:practice-dialog-closed' }, location.origin);
    button.focus({ preventScroll: true });
  }
  button.addEventListener('click', function () {
    if (document.body.classList.contains('battleMode') || (state && !state.over)) {
      showUnlockToast('Return to the main menu before opening practice.');
      return;
    }
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('adminPracticeOpen');
    window.parent.postMessage({ type: 'arena:practice-dialog-open' }, location.origin);
    code.focus();
  });
  dialog.querySelector('#adminPracticeCancel').addEventListener('click', dismiss);
  dialog.addEventListener('cancel', function (event) { event.preventDefault(); dismiss(); });
  dialog.addEventListener('close', closePractice);
  code.addEventListener('input', function () { error.textContent = ''; code.removeAttribute('aria-invalid'); });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (code.value.trim() !== '4321') {
      error.textContent = 'Incorrect code. Try again.';
      code.setAttribute('aria-invalid', 'true');
      code.select();
      return;
    }
    resumeMusic = !!musicTimer;
    previousMusicMode = musicMode;
    stopGameMusic();
    form.hidden = true;
    dialog.classList.add('practiceOpen');
    stage = document.createElement('section');
    stage.className = 'adminPracticeStage';
    stage.innerHTML = '<header class="adminPracticeHeader"><div><strong id="adminPracticeStageTitle">Admin practice · Everything unlocked</strong>' +
      '<span>No Gold, trading or ranked progress</span></div><button type="button" class="secondary" data-testid="button-exit-practice">Exit practice</button></header>' +
      '<div class="adminPracticeViewport"><div class="adminPracticeLoading" role="status">Loading practice…</div></div>';
    dialog.appendChild(stage);
    dialog.setAttribute('aria-labelledby', 'adminPracticeStageTitle');
    stage.querySelector('button').addEventListener('click', dismiss);
    frame = document.createElement('iframe');
    frame.className = 'adminPracticeFrame';
    frame.title = 'Everything-unlocked practice game';
    frame.setAttribute('data-testid', 'iframe-admin-practice');
    const url = new URL('./game.html', location.href);
    url.search = '?guest=1&practice=1';
    frame.src = url.href;
    stage.querySelector('.adminPracticeViewport').appendChild(frame);
    loadTimer = setTimeout(function () {
      const loading = stage && stage.querySelector('.adminPracticeLoading');
      if (loading && !loading.hidden) {
        loading.textContent = 'Practice is taking longer than expected. Exit and try again.';
      }
    }, 12000);
    stage.querySelector('button').focus();
  });
  window.addEventListener('message', function (event) {
    if (event.origin !== location.origin) return;
    if (event.source === window.parent) {
      if (event.data?.type === 'arena:ping') {
        window.parent.postMessage({ type: 'arena:practice-available' }, location.origin);
      }
      if (event.data?.type === 'arena:open-practice') button.click();
    }
    if (!frame || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'arena:practice-ready') {
      if (loadTimer) clearTimeout(loadTimer);
      loadTimer = null;
      stage.querySelector('.adminPracticeLoading').hidden = true;
    }
    if (event.data?.type === 'arena:practice-close') dismiss();
  });
  // A ranked ticket delivered by the host must never start a hidden account
  // battle behind practice. Close the overlay before any original-game start.
  const originalStart = startBattle;
  startBattle = function (...args) {
    if (dialog.open) dismiss();
    return originalStart(...args);
  };
  window.parent.postMessage({ type: 'arena:practice-available' }, location.origin);
})();