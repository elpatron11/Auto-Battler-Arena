/* Portrait keeps its existing banner. Landscape uses a canvas overlay, never
   a layout row, so opponent identity cannot reduce the battlefield. */
(function () {
  'use strict';
  const screen = document.getElementById('battleScreen');
  const originalStart = window.startBattle;
  if (!screen || typeof originalStart !== 'function') return;
  const label = document.createElement('div');
  label.id = 'arenaOpponentLabel';
  label.setAttribute('role', 'status');
  label.setAttribute('data-testid', 'text-arena-battle-opponent');
  label.style.cssText = 'padding:10px 14px;margin:0 0 10px;border:1px solid #b79346;border-radius:12px;background:#172136;color:#ffe2a0;font-size:15px;font-weight:800;text-align:center;overflow-wrap:anywhere;';
  label.hidden = true;
  screen.prepend(label);
  const portraitStyle=label.style.cssText;
  const landscape=window.matchMedia('(orientation: landscape)');
  function positionLabel() {
    if(!landscape.matches) {label.style.cssText=portraitStyle;return;}
    const canvas=screen.querySelector('canvas');
    if(!canvas || label.hidden)return;
    const rect=canvas.getBoundingClientRect();
    if(!rect.width || !rect.height)return;
    const width=Math.min(240,rect.width-24);
    label.style.cssText=`position:fixed;z-index:35;pointer-events:none;box-sizing:border-box;width:${width}px;max-width:calc(100vw - 24px);padding:4px 8px;margin:0;border-radius:8px;background:#172136dd;color:#ffe2a0;font-size:11px;line-height:16px;font-weight:700;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
    // Stay inside the map and away from visible battle buttons, including
    // skills/speed and bottom-row team/replay actions.
     const controls=[...screen.querySelectorAll('button')].filter(button=>button.getClientRects().length)
      .map(button=>button.getBoundingClientRect());
    const left=rect.left+(rect.width-width)/2;
     const candidates=[rect.top+8,rect.top+36,rect.bottom-32,rect.bottom-60,rect.top+(rect.height-24)/2]
       .flatMap(y=>[left,rect.left+8,rect.right-width-8].map(x=>({x,y})));
     const placement=candidates.find(({x,y})=>!controls.some(control=>x<control.right+6&&x+width>control.left-6&&y<control.bottom+6&&y+24>control.top-6))
       ??{x:left,y:rect.top+8};
     label.style.left=`${placement.x}px`;label.style.top=`${placement.y}px`;
  }
  landscape.addEventListener('change',positionLabel);
  window.addEventListener('resize',positionLabel);
  const canvas=screen.querySelector('canvas');
  if(canvas && window.ResizeObserver)new ResizeObserver(positionLabel).observe(canvas);
  window.startBattle = function (options) {
    const result = originalStart.apply(this, arguments);
    const name = options?.onlineChallenge && options?._onlineOpponentName;
    label.textContent = name ? `Arena opponent: ${name}` : '';
    label.hidden = !name;
    positionLabel();
    requestAnimationFrame(positionLabel);
    return result;
  };
})();