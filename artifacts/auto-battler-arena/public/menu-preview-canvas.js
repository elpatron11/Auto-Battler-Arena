/* Presentation canvases only: CSS geometry stays unchanged; backing pixels follow visible size. */
(function(root){
  'use strict';
  const sizes=new WeakMap(),MAX_EDGE=1024,MAX_DPR=3;
  function prepare(canvas,width,height){
    let logical=sizes.get(canvas);
    if(!logical){
      logical={width:width||canvas.width,height:height||canvas.height};
      sizes.set(canvas,logical);
    }
    const rect=canvas.getBoundingClientRect();
    const dpr=Math.max(1,Math.min(MAX_DPR,Number(root.devicePixelRatio)||1));
    const scale=Math.min(MAX_EDGE/Math.max(logical.width,logical.height),
      Math.max(.5,(rect.width||logical.width)*dpr/logical.width,
        (rect.height||logical.height)*dpr/logical.height));
    const w=Math.max(1,Math.round(logical.width*scale));
    const h=Math.max(1,Math.round(logical.height*scale));
    if(canvas.width!==w)canvas.width=w;
    if(canvas.height!==h)canvas.height=h;
    const ctx=canvas.getContext('2d');
    if(ctx){
      ctx.setTransform(w/logical.width,0,0,h/logical.height,0,0);
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    }
    return logical;
  }
  let frame=null;
  function refresh(){
    if(frame!==null)return;
    frame=root.requestAnimationFrame(()=>{
      frame=null;
      document.querySelectorAll('canvas[data-menu-preview-class]').forEach(canvas=>{
        if(canvas.getBoundingClientRect().width>0)
          root.drawProfileSkinPreview?.(canvas,canvas.dataset.menuPreviewClass,canvas.dataset.menuPreviewSkin);
      });
    });
  }
  root.MenuPreviewCanvas=Object.freeze({prepare,MAX_EDGE,MAX_DPR});
  root.addEventListener('resize',refresh);
  root.addEventListener('orientationchange',refresh);
  const grid=document.getElementById('profileSkinGrid');
  const resize=grid&&root.ResizeObserver?new root.ResizeObserver(refresh):null;
  const changes=grid&&root.MutationObserver?new root.MutationObserver(refresh):null;
  resize?.observe(grid);changes?.observe(grid,{childList:true});
  root.addEventListener('pagehide',()=>{
    resize?.disconnect();changes?.disconnect();
    root.removeEventListener('resize',refresh);root.removeEventListener('orientationchange',refresh);
    if(frame!==null)root.cancelAnimationFrame(frame);
  },{once:true});
})(window);