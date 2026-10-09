/* Class-select details helper. Presentation only: reads the cards the game already
   rendered from CLASS_DESC and tags the first non-passive ability so CSS can show
   passive(s) + basic ability on desktop without opening the card. */
(function (root) {
  'use strict';
  // The original embedded JPEG is damaged; use the restored shared portrait.
  if(typeof CLASS_PORTRAIT_IMG!=='undefined'){
    var oldDruid=CLASS_PORTRAIT_IMG.druid;
    CLASS_PORTRAIT_IMG.druid='class-portraits/druid-full.png';
    root.document.querySelectorAll('img').forEach(function(image){
      if(image.src===oldDruid)image.src=CLASS_PORTRAIT_IMG.druid;
    });
  }
  function tagCard(card) {
    if (!card || !card.querySelectorAll) return 0;
    var items = card.querySelectorAll(':scope > ul > li[data-idx]'), done = 0;
    for (var i = 0; i < items.length; i++) {
      var li = items[i]; li.classList.remove('firstAbility');
      if (!done && !li.classList.contains('passive')) { li.classList.add('firstAbility'); done = 1; }
    }
    return done;
  }
  function tagAll(doc) {
    var cards = (doc || root.document).querySelectorAll('#classGrid .card'), n = 0;
    for (var i = 0; i < cards.length; i++) n += tagCard(cards[i]);
    return n;
  }
  function init() {
    var doc = root.document, grid = doc && doc.getElementById('classGrid');
    if (!grid) return;
    tagAll(doc);
    if (root.MutationObserver) new root.MutationObserver(function () { tagAll(doc); }).observe(grid, { childList: true });
  }
  var api = { tagCard: tagCard, tagAll: tagAll, init: init };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.document) {
    root.ClassDetails = api;
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init); else init();
  }
})(typeof window !== 'undefined' ? window : this);
