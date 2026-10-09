(function () {
  'use strict';
  const variants=(stem,n)=>Array.from({length:n},(_,i)=>`${stem}-${i+1}`);
  const layer=(files,gain=.36,rate=1)=>({files:Array.isArray(files)?files:[files],gain,rate});
  const sword=layer(variants('weapon/sword-swing',3));
  const blade=layer(variants('weapon/blade-impact',3),.3);
  const body=layer(variants('weapon/body-hit',3),.32);
  const heavy=layer(variants('weapon/heavy-impact',3),.4);
  // Soft air/fabric sweeps, not glass/metal strikes or ringing pots.
  const ice=layer(variants('spell/ice-crack',3),.28);
  const magic=layer(variants('spell/magic',2),.3);
  const holy=layer('spell/holy',.3);
  const dark=layer('spell/shadow',.38);
  const fire=layer(variants('spell/fire',3),.4);
  const cue=(layers,priority=2,gap=.22,group='feature')=>({layers,priority,gap,group});
  const ultimate=(layers)=>cue([layer('events/ultimate',.55),...layers],4,.65);
  const cues={
    sword:cue([sword],0,.09,'routine'),
    dagger:cue([layer(variants('weapon/dagger',2),.34)],0,.09,'routine'),
    hammer:cue([layer('weapon/charge-rush',.24),heavy],0,.13,'routine'),
    axe:cue([layer('weapon/axe-chop',.35)],0,.13,'routine'),
    bow:cue([layer('weapon/bow-release',.4)],0,.1,'routine'),
    claw:cue([layer(variants('weapon/dagger',2),.26)],0,.12,'routine'),
    frostAttack:cue([layer('spell/projectile',.24)],0,.16,'routine'),
    holyAttack:cue([layer('spell/holy',.22)],0,.16,'routine'),
    shadowAttack:cue([layer('spell/projectile',.23,.9)],0,.16,'routine'),
    castFrost:cue([layer('spell/magic-1',.22)],1,.4,'routine'),
    castHoly:cue([layer('spell/holy',.22)],1,.4,'routine'),
    castShadow:cue([layer('spell/shadow',.22)],1,.4,'routine'),
    castNature:cue([layer('spell/nature',.25)],1,.4,'routine'),
    castSteel:cue([layer('weapon/sword-swing-1',.22)],1,.4,'routine'),
    bladeHit:cue([blade],0,.1,'routine'),
    hammerHit:cue([heavy],0,.1,'routine'),
    axeHit:cue([layer('weapon/axe-chop',.32),body],0,.14,'routine'),
    arrowHit:cue([layer('weapon/arrow-impact',.33)],0,.1,'routine'),
    bodyHit:cue([body],0,.1,'routine'),
    frostHit:cue([ice],0,.13,'routine'),
    holyHit:cue([layer('spell/holy',.25)],0,.16,'routine'),
    shadowHit:cue([layer('spell/shadow',.25)],0,.16,'routine'),
    shieldBlock:cue([layer(variants('weapon/shield-block',3),.36)],1,.16),
    shieldBreak:cue([layer('status/shield-break',.5)],3,.25),
    frostbolt:cue([layer('spell/projectile',.36),ice]),
    blizzard:cue([magic,ice],3,.4),
    frostpet:ultimate([ice]),
    blink:cue([layer('status/stealth',.35),magic]),
    freeze:cue([ice],2,.2),
    chainlightning:ultimate([fire,layer('spell/projectile',.26,1.12)]),
    polymorph_cast:cue([magic]),
    polymorph:ultimate([magic]),
    stun:cue([body,layer('status/interrupt',.25)],2,.22),
    fear:cue([layer('status/fear',.45)],3,.3),
    disorient:cue([magic,layer('status/fear',.25)],2,.3),
    sap:cue([body],2,.22),
    poison:cue([layer('status/poison',.27)],1,.6),
    interrupt:cue([layer('status/interrupt',.45)],3,.25),
    shield:cue([holy]),
    smite:cue([holy,layer('spell/projectile',.28)]),
    heal:cue([],0,.55,'routine'), // Quiet, short sine beep in the audio engine.
    revive:ultimate([holy]),
    shadowform:ultimate([dark]),
    shadowbeam:cue([dark],2,.3),
    blackshield:cue([dark,layer(variants('weapon/shield-block',3),.2)]),
    cleave:cue([sword,blade],3,.25),
    charge:cue([layer('weapon/charge-rush',.5),heavy],3,.4),
    rampage:ultimate([heavy]),
    bladestorm:ultimate([sword,blade]),
    gladiatorstrike:cue([heavy,holy],3,.35),
    vanish:cue([layer('status/stealth',.42),dark]),
    cheapshot:cue([layer(variants('weapon/dagger',2),.43),body],3,.3),
    mindcontrol:cue([magic,dark],3,.4),
    mcbreak:cue([layer('spell/projectile',.34,1.15),ice],3,.3),
    deathmark:ultimate([blade,dark]),
    holysmash:cue([heavy,holy],3,.3),
    blessing:cue([holy]),
    cleanse:cue([holy,layer('spell/nature',.2)]),
    divinestand:ultimate([heavy,holy]),
    aimedshot:cue([layer('weapon/bow-release',.52)],3,.3),
    marktarget:cue([layer('spell/nature',.25)],1,.3),
    rainofarrows:ultimate([layer('weapon/bow-release',.38),layer('spell/nature',.25)]),
    beartrap:cue([layer('status/interrupt',.32)],1,.25),
    beastmaster:ultimate([layer('vocal/beast-effort',.4)]),
    trapsnap:cue([blade,heavy],3,.3),
    curse:cue([dark],2,.35),
    shadowbolt:cue([layer('spell/projectile',.38,.9),dark]),
    darkpact:ultimate([layer('status/fear',.45),dark]),
    doomcurse:cue([dark,magic],3,.4),
    doomtrigger:cue([layer('events/ultimate',.55),heavy],4,.45),
    bearform:cue([heavy,layer('spell/nature',.32)],3,.4),
    tigerform:cue([sword,layer('spell/nature',.32)],3,.4),
    treeform:cue([layer('spell/nature',.4),holy],3,.4),
    entangle:cue([layer('spell/nature',.4)],2,.3),
    totem:cue([layer('weapon/axe-chop',.35),magic],2,.35),
    lightningzap:cue([fire],2,.28),
    shockwave:cue([heavy],3,.3),
    healingwave:cue([holy,magic],3,.4),
    fireshock:cue([fire,layer('spell/projectile',.3)],3,.3),
    purge:cue([magic,layer('spell/projectile',.26)],3,.35),
    death:cue([body],5,.08),
    ultimate:ultimate([magic]),
    victory:cue([layer('events/victory',.68),holy],6,1,'event'),
    defeat:cue([layer('events/defeat',.6)],6,1,'event'),
    matchstart:cue([layer('weapon/shield-block-1',.32),magic],3,1,'event'),
  };
  window.FantasyAudioCues=cues;
})();
