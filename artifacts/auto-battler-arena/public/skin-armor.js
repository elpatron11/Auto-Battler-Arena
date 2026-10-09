/* Fantasy World Arenas — equipped-skin armor and regalia.
 * Draw after the existing body/2.5D finish, in the body's local coordinates.
 * This deliberately does not modify the entity, pose, or the renderer's state.
 */
const SKIN_ARMOR_VARIANTS = {
    frostmage: ['winterSovereign', 'emberScholar'],
    priest: ['sunlitOracle', 'duskConfessor'],
    warrior: ['royalVanguard', 'ashWarlord'],
    rogue: ['nightViper', 'scarletPhantom'],
    paladin: ['dawnBastion', 'obsidianOath'],
    archer: ['thornRanger', 'stormHawkeye'],
    warlock: ['voidRegent', 'cinderOccultist'],
    druid: ['groveWarden', 'moonclaw'],
    shaman: ['tempestCaller', 'magmaBinder']
};
function drawDistinctSkin(ctx, e, cls, skinId, t, castGlow, swing, moving) {
  if (!ctx) return;
  if ((cls === 'paladin' && skinId === 'wingedPaladin') || (cls === 'warrior' && skinId === 'emberLord')) {
    const paladin=cls==='paladin',color=paladin?'#ffd568':'#ff761d';
    const pulse=Math.max(0,Math.min(1,Math.max(castGlow||0,swing||0)));
    ctx.save();
    try {
      ctx.globalAlpha=.32+pulse*.25;ctx.strokeStyle=color;ctx.lineWidth=1.5+pulse*.45;
      ctx.beginPath();ctx.ellipse(0,18,16+pulse,5,0,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=.85;ctx.lineJoin='round';
      if(paladin){
        for(const side of [-1,1])for(let n=0;n<4;n++){
          ctx.fillStyle=n%2?'#fff0c5':color;ctx.beginPath();
          ctx.moveTo(side*11,-4);ctx.lineTo(side*(18+n*2),-26+n*7);
          ctx.lineTo(side*(16+n*2),-9+n*4);ctx.closePath();ctx.fill();
        }
        ctx.strokeStyle='#fff0b0';ctx.lineWidth=1+pulse;
        ctx.beginPath();ctx.moveTo(-8,-6);ctx.lineTo(-5,-11);ctx.lineTo(0,-6);ctx.lineTo(5,-11);ctx.lineTo(8,-6);ctx.stroke();
      }else{
        ctx.strokeStyle=color;ctx.lineWidth=1.3+pulse*.6;
        for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*6,-8);ctx.lineTo(side*3,-3);ctx.lineTo(side*5,0);ctx.lineTo(side*2,5);ctx.stroke();}
      }
    }finally{ctx.restore();}
    return;
  }
  if (!ctx || !SKIN_ARMOR_VARIANTS[cls] || !SKIN_ARMOR_VARIANTS[cls].includes(skinId)) return;
  const time = Number.isFinite(t) ? t : 0;
  const pulse = .5 + .5 * Math.sin(time * 3 + (Number.isFinite(e && e.id) ? e.id : 0));
  const charge = Number.isFinite(castGlow) ? Math.max(0, Math.min(1, castGlow)) : 0;
  const strike = Number.isFinite(swing) ? Math.max(0, Math.min(1, swing)) : 0;
  const step = Number.isFinite(moving) ? Math.max(0, Math.min(1, moving)) : 0;
  ctx.save();
  try {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Painterly facets: colored edge, dark recessed side, narrow reflected plane.
    function poly(points, fill, edge, width) {
      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (edge) {
        ctx.strokeStyle = edge;
        ctx.lineWidth = width || .8;
        ctx.stroke();
      }
    }
    function line(points, color, width) {
      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
      ctx.strokeStyle = color;
      ctx.lineWidth = width || 1;
      ctx.stroke();
    }
    function oval(x, y, rx, ry, fill, edge, width) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = width || .7; ctx.stroke(); }
    }
    function diamond(x, y, rx, ry, fill, edge) {
      poly([x,y-ry, x+rx,y, x,y+ry, x-rx,y], fill, edge);
    }
    function shoulder(side, fill, dark, gleam, size) {
      const s = side, reach = size || 12.5;
      poly([s*5,-10, s*9,-12, s*reach,-9, s*(reach+1),-5, s*8,-3, s*5,-6],
        fill, dark, 1);
      line([s*6,-9, s*9,-10.5, s*reach,-8.5], gleam, .85);
      line([s*reach,-8.5, s*(reach+1),-5, s*8,-3], dark, .75);
    }
    function skirt(fill, shadow, trim, split) {
      poly([-6,2, 6,2, 9,10, split ? 1 : 0,11, -9,10], fill, shadow, .8);
      line([-6,3,-9,10, split ? -1 : 0,10], trim, .7);
      line([6,3,9,10], trim, .7);
      if (split) line([0,3,1,10], shadow, 1);
    }
    function chest(fill, shadow, highlight) {
      poly([-6,-9, 0,-10, 6,-9, 6,2, 0,4, -6,2], fill, shadow, 1);
      poly([-5,-8, 0,-9, -1,2, -5,1], highlight);
      line([0,-9,5,-8,5,1,0,3], shadow, .7);
    }

    switch (cls + ':' + skinId) {
      case 'frostmage:winterSovereign':
        // A tall glacier diadem and faceted mantle, cut like glacial strata.
        skirt('#223653','#0e1b31','#88cbda',true);
        poly([-8,-9,-12,-8,-15,-3,-11,1,-7,-2], '#adcdd6','#344e69');
        poly([8,-9,12,-8,15,-3,11,1,7,-2], '#80b8cc','#344e69');
        chest('#253b61','#101e38','#577b9c');
        line([-5,-6,0,-3,5,-6], '#b6eaf0', 1.2);
        diamond(0,-2,2.4,3.2,'#c8f9f4','#3a798c');
        poly([-5,-21,-3,-25,0,-24,2,-27,4,-23,6,-21,3,-20,0,-22,-3,-20],
          '#b8e1e8','#284966');
        line([-3,-23,0,-22,3,-24], '#efffff', .8);
        line([-8,6,-4,7,-3,10], '#a2d8e2', .7);
        break;
      case 'frostmage:emberScholar':
        // Split scholar's hat, copper clasp, ember-bound spellbook.
        skirt('#38242d','#191923','#d08b58',true);
        chest('#49313b','#1b1922','#79534d');
        line([-5,-7,4,2], '#e5a262', 1.3);
        oval(2,-3,2,2,'#ffcf7a','#8a3827');
        poly([-8,-20,-6,-23,0,-25,5,-23,8,-20,4,-20,2,-22,-3,-22,-6,-19],
          '#493039','#231a22');
        line([-5,-21,4,-22], '#ed9d5d', 1);
        poly([-14,-6,-10,-7,-9,3,-14,4], '#754134','#271b22');
        line([-13,-5,-10,-5,-10,2,-13,3], '#efb376', .8);
        diamond(-11,-1,1,1.8,'#ffb362');
        break;
      case 'priest:sunlitOracle':
        // Radiating halo-crown and fan-pleated ceremonial stole.
        skirt('#efe3bd','#826844','#fef1cc');
        for (const s of [-1,1]) shoulder(s,'#cda44c','#68512a','#fff1b0',10.8);
        chest('#f5e7bd','#866a46','#fff8dc');
        poly([-3,-8,0,-6,3,-8,2,8,0,11,-2,8], '#d4ad5a','#82652e');
        line([0,-6,0,7], '#fff9cd', 1);
        oval(0,-2,2,2,'#fff7c5','#a17e38');
        for (const x of [-5,-2.5,0,2.5,5])
          line([x,-22.5, x*.8,-25-(x===0?1:0)], '#f9d681', 1.15);
        poly([-6,-21,0,-22,6,-21,5,-19,0,-20,-5,-19], '#d3ab59','#775c30');
        break;
      case 'priest:duskConfessor':
        // Severe high cowl, moonstone veil at the throat, tiered dark stole.
        poly([-9,-10,-12,-5,-9,10,-4,8,-6,-7], '#3b344c','#221b30');
        poly([9,-10,12,-5,9,10,4,8,6,-7], '#463851','#221b30');
        skirt('#5a4868','#241f34','#b5a3c5',true);
        chest('#62516d','#2c243c','#8f7c9d');
        poly([-7,-18,-6,-23,-2,-25,3,-25,7,-22,7,-17,5,-16,4,-20,0,-22,-4,-20,-5,-16],
          '#43364e','#211c2f');
        line([-6,-21,0,-23,6,-21], '#d1bbd6', .8);
        diamond(0,-7,2,3,'#d6d5e7','#796b9d');
        line([-3,0,0,2,3,0], '#c2b5d6', 1);
        break;
      case 'warrior:royalVanguard':
        // Broad tournament pauldrons and crested, open-faced cavalry helm.
        skirt('#aca698','#4d5056','#f1d689',true);
        chest('#d7d8cf','#4b5966','#f5f3d8');
        for (const s of [-1,1]) shoulder(s,'#d7d9d3','#576170','#fff1b4',14);
        poly([-5,-21,-5,-23,0,-24,5,-23,5,-21,4,-18,3,-19,0,-20,-3,-19,-4,-18],
          '#c9d0d4','#465768');
        poly([-1,-23,0,-27,2,-24,2,-21,-1,-21], '#e2b95c','#825d2d');
        line([-5,-7,0,-3,5,-7], '#eedb9a',1.3);
        diamond(0,-1,2.4,3,'#dcb45f','#655034');
        break;
      case 'warrior:ashWarlord':
        // Jagged overlapping black iron, sawtooth helm and forge slits.
        skirt('#372e30','#16191d','#b25c3e',true);
        chest('#37393a','#12181b','#626361');
        for (const s of [-1,1]) {
          poly([s*6,-10,s*10,-13,s*15,-12,s*12,-9,s*16,-6,s*10,-3,s*6,-5],
            '#414241','#15181a');
          line([s*8,-9,s*12,-8,s*10,-5], '#d46843',1);
        }
        poly([-5,-21,-4,-24,-2,-22,0,-26,2,-22,5,-24,5,-18,3,-19,0,-20,-3,-19,-5,-18],
          '#35383a','#15191b');
        line([-4,-20,-1,-21,1,-20,4,-21], '#eb7a49', .9);
        poly([-4,-8,0,-6,4,-8,2,1,0,3,-2,1], '#602c26','#251c1c');
        line([-2,-4,0,-1,2,-4], '#ed8753',1.1);
        break;
      case 'rogue:nightViper':
        // Forked hood, scale-leather shoulders and paired poison flasks.
        skirt('#1c2c29','#111b1e','#5f9d78',true);
        chest('#293b35','#111d1d','#405d4c');
        for (const s of [-1,1]) {
          shoulder(s,'#283c32','#101e1d','#7bb386',11.8);
          poly([s*6,-9,s*9,-7,s*6,-5], '#729e78','#17362b');
        }
        poly([-6,-18,-8,-22,-4,-21,-2,-25,0,-22,2,-25,4,-21,8,-22,6,-18,4,-19,0,-21,-4,-19],
          '#1d2927','#101b1b');
        line([-4,-10,0,-5,4,-10], '#a6d56d',1);
        oval(-7,1,1.6,2.4,'#76b35e','#203d2c');
        oval(7,1,1.6,2.4,'#76b35e','#203d2c');
        break;
      case 'rogue:scarletPhantom':
        // Wrapped duelist, asymmetric swept brim and face-revealing half-mask.
        skirt('#45222c','#191b22','#d77675',true);
        chest('#733840','#231d25','#ab5458');
        shoulder(-1,'#8b4146','#241c23','#ec8380',12);
        poly([5,-10,10,-8,11,-4,6,-5], '#34333a','#1b1c23');
        poly([-8,-21,-5,-24,2,-23,8,-21,6,-19,-8,-19], '#692d39','#251c25');
        poly([-3,-14,0,-13,5,-15,5,-12,-3,-12], '#48252e','#261e27');
        line([-7,-21,6,-21], '#e17d77', .8);
        line([-5,-7,2,0,5,-5], '#f18f84', 1.2);
        line([-13,-4,-10,-7,-7,-1], '#aeb2b4', 1);
        break;
      case 'paladin:dawnBastion':
        // Fortress-shoulders, parapet helmet and raised sunburst cuirass.
        skirt('#c8c4ab','#6f6446','#fff3b6');
        chest('#e0d8b1','#786744','#ffeed0');
        for (const s of [-1,1]) {
          poly([s*5,-11,s*8,-13,s*11,-12,s*11,-14,s*14,-13,s*15,-5,s*7,-3],
            '#e2d9b8','#86734a');
          line([s*6,-10,s*10,-11,s*13,-10], '#fff5c9', 1);
        }
        poly([-6,-22,-6,-24,-3,-24,-3,-23,0,-24,3,-23,3,-24,6,-24,6,-20,4,-19,0,-20,-4,-19],
          '#dfd8b9','#8b7751');
        oval(0,-3,2,2,'#fff1a5','#ac8338');
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          line([Math.cos(a)*3.2,-3+Math.sin(a)*3.2,
                Math.cos(a)*5.3,-3+Math.sin(a)*5.3], '#ffe69a', .9);
        }
        break;
      case 'paladin:obsidianOath':
        // Flared black enameled plate, hanging vow chains and molten visor.
        skirt('#29262b','#11131a','#b88e4d',true);
        chest('#3d3b40','#15151d','#5d595c');
        for (const s of [-1,1]) shoulder(s,'#3b393c','#16161c','#c0995b',14);
        poly([-6,-22,-4,-24,4,-24,6,-22,5,-18,3,-19,0,-20,-3,-19,-5,-18],
          '#343238','#15151d');
        line([-4,-20,4,-20], '#e2aa55',1);
        poly([-4,-8,0,-6,4,-8,2,1,0,4,-2,1], '#a37538','#3f3229');
        line([-2,-4,0,-1,2,-4], '#ffe0a0',.9);
        for (const s of [-1,1]) line([s*5,1,s*7,4,s*6,8], '#bb985c', .95);
        break;
      case 'archer:thornRanger':
        // Layered leaf-mail, thorned hood and a readable quiver of arrows.
        skirt('#2d4735','#172a27','#9ac783',true);
        chest('#3d6047','#193729','#709b68');
        for (const s of [-1,1]) {
          poly([s*5,-10,s*12,-11,s*10,-7,s*13,-5,s*7,-4],
            '#679258','#294634');
          line([s*6,-9,s*11,-9,s*8,-5], '#b9d797',.8);
        }
        poly([-6,-19,-7,-22,-1,-24,6,-21,6,-18,3,-20,-2,-21,-5,-17],
          '#31533b','#1a2b27');
        poly([-13,-6,-10,-8,-7,-6,-7,5,-12,5], '#604b32','#2f3027');
        for (const x of [-11.7,-10,-8.4])
          line([x,-6,x-.6,-11], '#d2bd86', .8);
        line([-5,-7,4,2], '#d3c994',1.1);
        break;
      case 'archer:stormHawkeye':
        // Raptor-beak visor, feathered scout mantle and fletched quiver.
        skirt('#354d5d','#172c3b','#91b8ca',true);
        chest('#486b7d','#203747','#85aabd');
        for (const s of [-1,1]) {
          poly([s*5,-10,s*10,-12,s*14,-9,s*11,-7,s*13,-5,s*7,-4],
            '#718b96','#263b4b');
          line([s*7,-10,s*12,-9,s*8,-6], '#d6e8e8',.8);
        }
        poly([-7,-20,-5,-23,2,-24,7,-21,3,-18,0,-19,-4,-18],
          '#5c7482','#243848');
        poly([2,-21,9,-19,3,-18], '#c1d2d4','#415769');
        poly([-13,-4,-10,-8,-7,-4,-8,5,-12,5], '#35434a','#1b2832');
        line([-10,-8,-10,-12], '#dae8e4',1);
        line([-5,-7,4,2], '#a8d8de',1.2);
        break;
      case 'warlock:voidRegent':
        // Regal high collar, floating-looking crown tips, astral embroidered panels.
        skirt('#332846','#181629','#9d82bf',true);
        poly([-8,-11,-12,-16,-10,-8,-7,-5], '#504069','#211d33');
        poly([8,-11,12,-16,10,-8,7,-5], '#504069','#211d33');
        chest('#433158','#1b192c','#695183');
        poly([-6,-21,-5,-26,-2,-23,0,-27,2,-23,5,-26,6,-21,4,-20,0,-22,-4,-20],
          '#594477','#281d3d');
        for (const s of [-1,1]) {
          diamond(s*3,-4,1.1,2.2,'#cbb0ee','#5f4686');
          line([s*3,-1,s*5,2,s*3,5], '#a782d1',.85);
        }
        oval(0,-3,1,1.2,'#e0ccff');
        break;
      case 'warlock:cinderOccultist':
        // Ash-lined ritual hood, hooked shoulder iron and a coal censer.
        skirt('#482d31','#1e1b25','#b86b56',true);
        chest('#553337','#231c25','#80504a');
        for (const s of [-1,1]) {
          poly([s*5,-10,s*10,-12,s*13,-10,s*11,-8,s*15,-7,s*9,-4,s*6,-5],
            '#3d3436','#1c1b22');
          line([s*8,-10,s*12,-9,s*10,-6], '#d57a53',.85);
        }
        poly([-6,-18,-7,-23,-2,-25,4,-23,7,-19,5,-17,4,-20,0,-22,-4,-20,-5,-17],
          '#3a2b31','#1b1922');
        line([-4,-21,0,-23,5,-20], '#d77754',.9);
        line([8,-3,10,1,10,5], '#9b6c53',.85);
        oval(10,6,2,2.1,'#633b32','#c17b54');
        oval(10,5.5,.8,.8, pulse+charge > .7 ? '#ffd097' : '#d98759');
        break;
      case 'druid:groveWarden':
        // Bark cuirass, layered living-leaf shoulders and branching antlers.
        skirt('#3c4e39','#233328','#8eb878',true);
        chest('#785b3c','#382c25','#ae8d5d');
        line([-4,-8,1,-4,-2,3], '#ba9e70',1);
        for (const s of [-1,1]) {
          poly([s*5,-10,s*10,-12,s*14,-9,s*11,-5,s*7,-4],
            '#669154','#314d34');
          poly([s*7,-8,s*13,-10,s*10,-6], '#a8ca79');
          line([s*3,-21,s*7,-25,s*9,-26], '#94734c',1.4);
          line([s*6,-24,s*5,-27], '#94734c',1);
        }
        diamond(0,-3,1.5,2.5,'#b4d685','#5e7842');
        break;
      case 'druid:moonclaw':
        // Fur-edged lunar mantle, crescent brow and paired claw talismans.
        skirt('#294a55','#172b36','#94c8c6',true);
        chest('#3f6470','#1b343e','#6c8e97');
        for (const s of [-1,1]) {
          poly([s*5,-10,s*10,-12,s*14,-10,s*12,-8,s*15,-6,s*9,-3,s*6,-5],
            '#9ab7ae','#34515a');
          line([s*7,-9,s*12,-10,s*10,-6], '#dfebe0',.8);
          poly([s*5,-21,s*8,-24,s*7,-19], '#a8cac7','#3c6570');
        }
        poly([-5,-22,-2,-24,0,-22,3,-24,5,-22,3,-20,0,-21,-3,-20],
          '#9cc4c5','#35626b');
        line([-3,-7,0,-5,3,-7], '#b7e7d6',1);
        for (const s of [-1,1]) line([s*6,3,s*8,7,s*7,9], '#c7e8df',1);
        break;
      case 'shaman:tempestCaller':
        // Lightning-rod headdress, stacked silver rune plates and charged cuffs.
        skirt('#355364','#1b303d','#91c8d2',true);
        chest('#577581','#263d48','#8eaeb5');
        for (const s of [-1,1]) {
          shoulder(s,'#829ca0','#2e4854','#d9e4d6',12);
          diamond(s*9,-7,1.3,1.8,'#b6eaf0','#476e78');
          poly([s*5,-21,s*7,-26,s*9,-25,s*7,-19], '#b8cace','#48636c');
        }
        poly([-4,-22,-2,-24,2,-24,4,-22,2,-20,-2,-20], '#a6c0c2','#344c58');
        line([-3,-8,1,-5,-2,-2,3,1], '#a8e7e9',1.1);
        for (const s of [-1,1]) line([s*9,0,s*11,2,s*9,4], '#d5f6ef',.9);
        break;
      case 'shaman:magmaBinder':
        // Basalt slab shoulders, forge-mask brow and restrained lava fissures.
        skirt('#483933','#252328','#b97b4c',true);
        chest('#454044','#212428','#696061');
        for (const s of [-1,1]) {
          poly([s*5,-11,s*9,-13,s*14,-11,s*15,-7,s*11,-3,s*6,-5],
            '#4b4545','#242428');
          line([s*7,-10,s*10,-8,s*9,-5], '#e99a5c',1);
        }
        poly([-6,-21,-4,-24,4,-24,6,-21,4,-20,0,-21,-4,-20],
          '#514a46','#27292a');
        line([-4,-21,4,-21], '#ec9c5c',.8);
        line([-4,-8,-1,-5,-2,-1,2,1,3,4], '#e4884b',1.2);
        line([5,-7,2,-4,3,-2], '#f8b877',.85);
        diamond(0,3,1.2,1.5,pulse+charge > .7 ? '#ffd099' : '#df8955');
        break;
    }
    // One tiny specular response to casting/attacking; never a battlefield aura.
    if (charge > .05 || strike > .05) {
      ctx.globalAlpha = Math.min(.34, charge * .22 + strike * .16);
      line([-5,-9,-2,-10], '#fff5de', .7);
    }
    if (step > .3) {
      ctx.globalAlpha = Math.min(.23, step * .2);
      line([-7,8,-8,10], '#f2ead4', .6);
    }
  } finally {
    ctx.restore();
  }
}