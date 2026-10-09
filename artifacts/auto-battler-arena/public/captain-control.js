/* Local-only input adapter. Damage, cooldown consumption, casts and collision
   remain owned by game.html. No combat work is done by the UI polling loop. */
(function () {
  'use strict';
  let selectedMode = 'auto', match = null, captain = null, entry = {};
  let x = 0, y = 0, feedback = '', feedbackUntil = 0, attackTarget = null;
  const queue = [];
  const now = () => performance.now();
  function local(opts) {
    return !opts.onlineChallenge && !opts.tournament && !opts.dungeon &&
      !opts.replay && !opts.playback && !(tournament && tournament.active);
  }
  function available() {
    return local(entry) && teamSize === 3 && !!captainClass && selected.includes(captainClass);
  }
  function active() {
    return selectedMode === 'manual' && !!match && state === match && !match.over && !match.dungeon &&
      local(entry) && teamSize === 3 && !!match._captainManual;
  }
  function owns(e) {
    return active() && e === captain && !e.isPet && e.team === 'player';
  }
  function blocked(e, includeCast = true) {
    if (!e || !e.alive) return 'Captain defeated — teammates continue on AI.';
    if (e.team !== 'player') return 'Captain is not under your control.';
    const s = e.status;
    if (s.stunTimer > 0) return 'Captain stunned.';
    if (s.fearTimer > 0 || s.disorientTimer > 0 || s.polymorphed || s.sapTimer > 0) return 'Captain crowd-controlled.';
    if (includeCast && e.casting) return 'Casting — movement resumes when the cast finishes.';
    return '';
  }
  function release() { x = y = 0; queue.length = 0; }
  function say(text) { feedback = text; feedbackUntil = now() + 1800; }
  function valid(e, t) {
    return !!t && t.alive && t.team !== e.team && !t.status.untargetable &&
      (!t.status.invis || t.status.markedTimer > 0) && !(t.status.sapTimer > 0);
  }
  function eligibleEnemy(e, t, slot) {
    if (!valid(e, t)) return false;
    if (slot === 'racial') return true;
    const custom = e.a2Variant === 'custom';
    if (slot === 'dreambind') return canDreambindTarget(e, t) && dist(e, t) <= 210;
    if (slot === 'attack') return e.classId === 'priest' && e.extra.shadowForm > 0
      ? reach(e, t, e.range + 40)
      : reach(e, t, e.range, !['warrior', 'rogue'].includes(e.classId), ['warrior', 'rogue', 'paladin'].includes(e.classId));
    switch (e.classId) {
      case 'warrior':
        if (slot === 'a1') return reach(e, t, 70, false, true);
        if (slot === 'a2') return !(e.extra.bladestorm > 0) && reach(e, t, 280) &&
          meleeDistance(e, t) > e.range && navPathClear(e, {x:t.x + (e.x < t.x ? -40 : 40), y:t.y}, e.radius);
        return dist(e, t) < 200;
      case 'frostmage':
        if (slot === 'a1') return reach(e, t, e.range);
        if (slot === 'a2') return custom || dist(e, t) < 300;
        if (e.ultVariant === 'polymorph') return dist(e, t) <= 280 &&
          (t.isPet || (!t.status.invis && t.classId !== 'druid'));
        return e.ultVariant !== 'custom' || reach(e, t, FIRESTORM_RANGE);
      case 'priest': return reach(e, t, e.range); // Radiant Strike's offensive branch.
      case 'rogue':
        if (slot === 'a2') return custom ? !t.isPet && dist(e, t) <= 52 && !(t.status.disorientTimer > 0)
          : reach(e, t, 45, false, true) && t.status.stunTimer <= .3 && t.status.silenceTimer <= 0;
        return e.ultVariant === 'custom' ? reach(e, t, 280, false) && reach(e, t, 280, false, true)
          : reach(e, t, 45, false, true);
      case 'paladin': return slot === 'a1' ? reach(e, t, 50, true, true) : reach(e, t, 280);
      case 'archer':
        if (slot === 'a1') return reach(e, t, e.range);
        if (slot === 'a2') return custom ? (t.melee ? dist(e, t) < 200 && dist(e, t) > 40 : reach(e, t, e.range))
          : reach(e, t, e.range) && t.status.markedTimer <= 0;
        return e.ultVariant === 'custom' || reach(e, t, 300, false);
      case 'warlock':
        if (slot === 'a1') return reach(e, t, 240);
        if (slot === 'a2') return reach(e, t, 240) && (!custom || !t.status.lethalCurse);
        return reach(e, t, 260, false);
      case 'shaman':
        if (slot === 'a2') return reach(e, t, e.range + 40);
        return e.ultVariant === 'custom' ? reach(e, t, SHAMAN_CHAIN_FIRST_RANGE)
          : reach(e, t, e.range + 50) && isActingHealer(t);
      default: return true;
    }
  }
  function enemy(e, slot) {
    return state.entities.filter(t => eligibleEnemy(e, t, slot))
      .sort((a, b) => dist(e, a) - dist(e, b))[0] || null;
  }
  function reach(e, t, range, los = true, melee = false) {
    return !!t && (melee ? meleeDistance(e, t) : dist(e, t)) <= range &&
      (!los || hasLOS(e.x, e.y, t.x, t.y, WALLS));
  }
  function aimSpec(e, slot) {
    const custom = e.a2Variant === 'custom';
    let kind = 'enemy', range = e.range, radius = 0, los = true;
    if (slot === 'attack') range += ['warrior','rogue','paladin'].includes(e.classId) ? e.radius + 14 : (e.extra.shadowForm > 0 ? 40 : 0);
    else if (slot === 'dreambind') {range=210;los=false;}
    else switch (e.classId) {
      case 'warrior':
        kind=slot==='a2'?'enemy':'self';range=slot==='a1'?70+e.radius:slot==='a2'?280:200;radius=slot==='a1'?70:200;break;
      case 'frostmage':
        if(slot==='a2'&&!custom){kind='ground';range=300;radius=70;los=false;}
        else if(slot==='a2'){range=Math.hypot(typeof ARENA_W==='number'?ARENA_W:1000,typeof ARENA_H==='number'?ARENA_H:620);los=false;}
        else if(slot==='ult'&&e.ultVariant==='custom'){kind='ground';range=FIRESTORM_RANGE;radius=typeof FIRESTORM_RADIUS==='number'?FIRESTORM_RADIUS:100;}
        else if(slot==='ult'&&e.ultVariant==='polymorph'){range=280;los=false;}
        else if(slot==='ult'){kind='self';range=0;}
        break;
      case 'priest':
        kind=slot==='a2'&&!custom?'either':slot==='ult'?(e.ultVariant==='custom'?'self':'dead-ally'):'ally';
        range=slot==='ult'?600:e.range+(kind==='either'?40:50);break;
      case 'rogue':
        if(slot==='a1'){kind='self';range=0;}
        else {range=slot==='a2'?(custom?52:45+e.radius+14):(e.ultVariant==='custom'?280:45+e.radius+14);los=false;}break;
      case 'paladin':
        kind=slot==='a1'?'enemy':slot==='ult'?'self':custom?'either':'ally';
        range=slot==='a1'?50+e.radius+14:custom?280:150;
        if(slot==='ult'){range=0;radius=100;}break;
      case 'archer':
        if(slot==='ult'&&e.ultVariant!=='custom'){kind='ground';range=300;radius=80;los=false;}
        else if(slot==='ult'||slot==='a2'&&custom&&!e.extra.trapsPreplaced){kind='self';range=0;}
        break;
      case 'warlock':range=slot==='ult'?260:240;los=slot!=='ult';break;
      case 'druid':kind='self';range=0;break;
      case 'shaman':
        kind=slot==='a1'?'ally':slot==='ult'&&e.ultVariant!=='custom'?'either':'enemy';
        range=slot==='a1'?e.range+50:slot==='a2'?e.range+40:e.ultVariant==='custom'?SHAMAN_CHAIN_FIRST_RANGE:e.range+80;break;
    }
    return {slot,kind,range,radius,los};
  }
  function legalAim(e, t, slot) {
    const spec=aimSpec(e,slot);
    if(spec.kind==='self') return t===e;
    if(!t)return false;
    if(t.team!==e.team) return ['enemy','either'].includes(spec.kind)&&eligibleEnemy(e,t,slot);
    if(!['ally','either','dead-ally'].includes(spec.kind)||t.isPet)return false;
    if(spec.kind==='dead-ally')return !t.alive&&reach(e,t,600);
    if(!t.alive)return false;
    if(e.classId==='priest'){
      if(slot==='a1'||e.a2Variant==='custom')return t.status.shield<=0&&reach(e,t,e.range+50);
      return t.hp/t.maxHp<.6&&reach(e,t,e.range+40);
    }
    if(e.classId==='paladin'&&e.a2Variant==='custom')return !(t.status.gladiatorDmgTimer>0)&&(t===e||reach(e,t,130));
    if(e.classId==='paladin')return t===e||reach(e,t,150);
    if(e.classId==='shaman'&&slot==='ult')return t===e||reach(e,t,e.range+80)&&
      (needsCleanse(t)||t.status.stunTimer>0||t.status.fearTimer>0||t.status.rootTimer>0||t.status.silenceTimer>0||t.hp/t.maxHp<.35);
    return reach(e,t,spec.range);
  }
  function legalPoint(e, slot, p) {
    const spec=aimSpec(e,slot);
    return spec.kind==='ground'&&p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&
      reach(e,p,spec.range,spec.los)&&(slot!=='a2'||e.classId!=='frostmage'||dist(e,p)<300)&&
      inBounds(p.x,p.y,1)&&!collidesWalls(p.x,p.y,1,WALLS);
  }
  function ally(e, range, predicate = () => true, includeSelf = true) {
    const candidates = aliveAllies(e, includeSelf).filter(t => predicate(t) && reach(e, t, range));
    const preferred = lowestHpAlly(e, includeSelf);
    return candidates.includes(preferred) ? preferred :
      candidates.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] || null;
  }
  function cooldown(e, slot) {
    if (slot === 'attack') return e.classId === 'priest' && e.extra.shadowForm > 0 ? 0 : e.atkTimer;
    if (slot === 'dreambind') return 0;
    // Feral snare-breaking uses the existing shared shift lock, not a new timer.
    if (slot === 'a1' && e.classId === 'druid' && e.a2Variant === 'custom' &&
        (e.status.rootTimer > 0 || e.status.slowTimer > 0)) return e.extra.feralShiftLock || 0;
    return e.cd[slot] || 0;
  }
  function passive(e, slot) {
    return slot === 'a2' && e.classId === 'druid' && e.a2Variant === 'custom';
  }
  function slotBlocked(e, slot) {
    if (blocked(e) || passive(e, slot) || cooldown(e, slot) > 0) return true;
    // These particular physical/curse casts are not silence-gated by their
    // original AI dispatch. Preserve that rule, including the default variant.
    const silenceExempt = (e.classId === 'archer' && slot === 'a1') ||
      (e.classId === 'warlock' && (slot === 'a1' || (slot === 'a2' && e.a2Variant !== 'custom')));
    if (slot !== 'attack' && !silenceExempt && isSilenced(e)) return true;
    if (slot === 'attack' && e.classId === 'priest' && e.extra.shadowForm > 0 && isSilenced(e)) return true;
    if (slot === 'dreambind') return !e.status.invis || !!e.extra.sapUsedThisStealth;
    if (slot === 'a2' && e.classId === 'archer' && e.a2Variant === 'custom') return e.extra.trapCharges === 0;
    if (e.classId === 'druid' && e.extra.form === 'tree' && slot !== 'ult') return true;
    return false;
  }
  // Eligibility is the original class AI's mechanical range/LOS/resource gates.
  // Health thresholds, emergency priorities and autonomous navigation are not
  // cast rules: in manual mode the player chooses when to use a legal ability.
  function cast(e, slot, pressedTarget, explicit = false, ground = false) {
    if (slotBlocked(e, slot)) { say(isSilenced(e) && slot !== 'attack' ? 'Silenced.' : 'Ability is not ready.'); return false; }
    // Snapshot the nearest legal enemy on press; never substitute an AI focus.
    // Revalidate at dispatch in case it died, moved out of reach or became CCed.
    const t = ground ? (legalPoint(e,slot,pressedTarget)?pressedTarget:null) :
      (explicit ? (legalAim(e,pressedTarget,slot)?pressedTarget:null) : eligibleEnemy(e,pressedTarget,slot)?pressedTarget:null);
    if(explicit&&!t)return false;
    if (t && !ground && t.team !== e.team) e.lastTarget = t;
    const custom = e.a2Variant === 'custom';
    let target;
    if (slot === 'dreambind') {
      return !!t && castDreambind(e, t);
    }
    if (slot === 'attack') {
      if (e.classId === 'priest' && e.extra.shadowForm > 0) {
        if (!reach(e, t, e.range + 40)) return false;
        castShadowBeam(e, t); return true;
      }
      const meleeRange = ['warrior', 'rogue', 'paladin'].includes(e.classId);
      if (!reach(e, t, e.range, !['warrior', 'rogue'].includes(e.classId), meleeRange)) return false;
      autoAttack(e, t); return true;
    }
    switch (e.classId) {
      case 'warrior':
        if (slot === 'a1' && reach(e, t, 70, false, true)) { castCleave(e); return true; }
        if (slot === 'a2' && !(e.extra.bladestorm > 0) && reach(e, t, 280) &&
            meleeDistance(e, t) > e.range &&
            navPathClear(e, {x: t.x + (e.x < t.x ? -40 : 40), y: t.y}, e.radius)) { castCharge(e, t); return true; }
        if (slot === 'ult' && t && dist(e, t) < 200) {
          if (e.ultVariant === 'custom') castSteelCycloneUlti(e); else castWarriorUlti(e);
          return true;
        }
        break;
      case 'frostmage':
        if (slot === 'a1' && reach(e, t, e.range)) { castFrostBolt(e, t); return true; }
        if (slot === 'a2' && custom && t) { castBlink(e, t); return true; }
        if (slot === 'a2' && !custom && t && dist(e, t) < 300) { castIceTempest(e, t); return true; }
        if (slot === 'ult') {
          if (e.ultVariant === 'polymorph') {
            target = t;
            if (!target) return false;
          } else if (e.ultVariant === 'custom') {
            target = t;
            if (!reach(e, target, FIRESTORM_RANGE)) return false;
          } else target = t;
          castFrostUlti(e, target); return true;
        }
        break;
      case 'priest':
        if (slot === 'a1') {
          target = explicit ? t : ally(e, e.range + 50, a => a.status.shield <= 0);
          if (target) { castShield(e, target); return true; }
        }
        if (slot === 'a2' && custom) {
          target = explicit ? t : ally(e, e.range + 50, a => a.status.shield <= 0);
          if (target) { castSwiftShield(e, target); return true; }
        }
        if (slot === 'a2' && !custom) {
          // Radiant Strike already chooses its heal/offensive target and cast time.
          const before = e.casting;
          if(explicit)castRadiantStrike(e,t.team!==e.team?t:null,t.team===e.team?t:null);
          else castRadiantStrike(e, t);
          return !!e.casting && e.casting !== before;
        }
        if (slot === 'ult' && e.ultVariant === 'custom' && !(e.extra.shadowForm > 0)) { castShadowForm(e); return true; }
        if (slot === 'ult' && e.ultVariant !== 'custom') {
          target = explicit ? t : deadAlly(e);
          if (target && reach(e, target, 600)) { castPriestUlti(e, target); return true; }
        }
        break;
      case 'rogue':
        if (slot === 'a1' && !e.status.invis) { castSmokeVeil(e); return true; }
        if (slot === 'a2' && custom) {
          target = t;
          if (target) { castDisorient(e, target); return true; }
        }
        if (slot === 'a2' && !custom && reach(e, t, 45, false, true) &&
            t.status.stunTimer <= .3 && t.status.silenceTimer <= 0) { castCheapShot(e, t); return true; }
        if (slot === 'ult' && (e.ultVariant === 'custom' ?
            reach(e, t, 280, false) && reach(e, t, 280, false, true) : reach(e, t, 45, false, true))) {
          castRogueUlti(e, t); return true;
        }
        break;
      case 'paladin':
        if (slot === 'a1' && reach(e, t, 50, true, true)) { castHolySmash(e, t); return true; }
        if (slot === 'a2' && custom) {
          target = explicit ? t : ally(e, 130, a => !(a.status.gladiatorDmgTimer > 0), false);
          if (!target && !(e.status.gladiatorDmgTimer > 0)) target = e;
          if (!target && reach(e, t, 280)) target = t;
          if (target) { castGladiator(e, target); return true; }
        }
        if (slot === 'a2' && !custom) {
          target = explicit ? t : ally(e, 150, () => true, false) || e;
          if (target) { castBlessing(e, target); return true; }
        }
        if (slot === 'ult') { castPaladinUlti(e); return true; }
        break;
      case 'archer':
        if (slot === 'a1' && reach(e, t, e.range)) { castAimedShot(e, t); return true; }
        if (slot === 'a2' && custom) {
          // The first manual activation retains the existing three-trap opener.
          if (!e.extra.trapsPreplaced) { preplaceBearTraps(e); return true; }
          if (t && (t.melee ? dist(e, t) < 200 && dist(e, t) > 40 : reach(e, t, e.range))) {
            castBearTrap(e, t, {onTarget: !t.melee}); return true;
          }
        }
        if (slot === 'a2' && !custom) {
          target = t;
          if (reach(e, target, e.range) && target.status.markedTimer <= 0) { castMarkTarget(e, target); return true; }
        }
        if (slot === 'ult' && (e.ultVariant === 'custom' || reach(e, t, 300, false))) { castArcherUlti(e, t); return true; }
        break;
      case 'warlock':
        if (slot === 'a1') {
          target = t;
          if (valid(e, target) && reach(e, target, 240)) { castCurse(e, target); return true; }
        }
        if (slot === 'a2' && reach(e, t, 240)) {
          if (custom) {
            if (t.status.lethalCurse) return false;
            castDoomCurse(e, t);
          } else castShadowBolt(e, t);
          return true;
        }
        if (slot === 'ult' && reach(e, t, 260, false)) { castWarlockUlti(e, t); return true; }
        break;
      case 'druid':
        if (slot === 'a1' && (!custom || feralShiftReady(e))) {
          const breakCC = custom && (e.status.rootTimer > 0 || e.status.slowTimer > 0);
          if (e.extra.form === 'tiger' && !breakCC) return false;
          const fromBear = e.extra.form === 'bear';
          e.extra.huntAfterTree = false;
          castTigerForm(e);
          if (breakCC) feralBreakMovementCC(e);
          else if (custom && fromBear) e.extra.feralShiftLock = 3;
          return true;
        }
        if (slot === 'a2' && !custom) { castTreeForm(e); return true; }
        if (slot === 'ult' && e.extra.form) {
          if (e.extra.form === 'tree' && !deadAlly(e)) return false;
          castDruidUlti(e); return true;
        }
        break;
      case 'shaman':
        if (slot === 'a1') {
          target = explicit ? t : ally(e, e.range + 50);
          if (target) { castHealingWave(e, target); return true; }
        }
        if (slot === 'a2' && reach(e, t, e.range + 40)) { castFireshock(e, t); return true; }
        if (slot === 'ult' && e.ultVariant === 'custom' && reach(e, t, SHAMAN_CHAIN_FIRST_RANGE)) { castShamanUlti(e, t); return true; }
        if (slot === 'ult' && e.ultVariant !== 'custom') {
          target = explicit ? t : ally(e, e.range + 80, a => needsCleanse(a) || a.status.stunTimer > 0 ||
            a.status.fearTimer > 0 || a.status.rootTimer > 0 || a.status.silenceTimer > 0 || a.hp / a.maxHp < .35);
          if (!target && reach(e, t, e.range + 50) && isActingHealer(t)) target = t;
          castShamanUlti(e, target || e); return true;
        }
        break;
    }
    return false;
  }
  function step(e, dt) {
    if (!owns(e)) return;
    if (blocked(e)) { queue.length = 0; return; }
    const action = queue.shift();
    if (action && action.until >= now()) {
      if (cast(e, action.slot, action.target, action.explicit, action.ground)) feedback = '';
      else say('No eligible target: check range, line of sight or ability status.');
    }
    if (blocked(e)) return; // Newly started wind-ups/channels retain their lock.
    if (e.status.rootTimer > 0 || e.extra.form === 'tree') return;
    const magnitude = Math.hypot(x, y);
    if (magnitude < .12) return;
    // Same factors as moveToward; moveEntity owns wall sweeps, bounds and talents.
    const speed = e.speed * (e.status.slowFactor || 1) * (e.status.invis ? 1.4 : 1) *
      (e.extra.rampage > 0 ? 1.3 : 1) * (e.status.hasteFactor || 1) * teamMoveFactor(e);
    moveEntity(e, x / magnitude, y / magnitude, speed * Math.min(1, magnitude), dt);
  }
  function slots(e) {
    const names = CLASS_DESC[e.classId].filter(line => !line.p).map(line => line.t.replace(/^ULT:\s*/, '').replace(/\s*\([^)]*\)$/, ''));
    const labels = {
      attack: e.classId === 'priest' && e.extra.shadowForm > 0 ? 'Shadow Beam' : 'Attack',
      a1: names[0], a2: variantLabel(e.classId, 'ability', e.a2Variant),
      ult: variantArtName(e.classId, 'ult', e.ultVariant), dreambind: 'Dreambind'
    };
    const ids = ['attack', 'a1', 'a2', 'ult'];
    // This existing stealth passive is dispatched by class AI in AUTO.
    // Expose it explicitly rather than deleting it or running combat AI.
    if (e.classId === 'rogue') ids.push('dreambind');
    return ids.map(id => ({id, label: (id === 'a1' ? 'A1 · ' : id === 'a2' ? 'A2 · ' : id === 'ult' ? 'ULT · ' : '') +
      labels[id] + (passive(e, id) ? ' (passive)' : ''), cooldown: Math.max(0, cooldown(e, id)), disabled: slotBlocked(e, id)}));
  }
  window.CaptainControl = {
    focusTargetId(){return active()&&attackTarget?.alive?attackTarget.id:null;},
    owns, step, release,
    aim(slot) {
      if(!owns(captain))return null;
      if(attackTarget&&(!attackTarget.alive||attackTarget.team===captain.team))attackTarget=null;
      const spec=aimSpec(captain,slot);
      const targets=state.entities.filter(t=>(!t.isPet||t.team!==captain.team)&&
        (spec.kind==='dead-ally'?!t.alive:t.alive)&&
        (!t.status.untargetable&&(!t.status.invis||t.status.markedTimer>0)||t.team===captain.team))
        .map(t=>({id:t.id,x:t.x,y:t.y,radius:t.radius,name:t.name,ally:t.team===captain.team,valid:legalAim(captain,t,slot)}));
      return {...spec,disabled:slotBlocked(captain,slot),captain:{id:captain.id,x:captain.x,y:captain.y,radius:captain.radius},
        targets,selectedAttackTarget:attackTarget?.id??null};
    },
    pointValid(slot,p) {return owns(captain)&&legalPoint(captain,slot,p);},
    selectAttackTarget(id) {
      if(!owns(captain))return false;
      const t=state.entities.find(t=>t.id===id);
      if(id==null){attackTarget=null;return true;}
      if(!valid(captain,t))return false;
      attackTarget=t;return true;
    },
    racialTarget() {
      if (owns(captain)) captain.lastTarget = enemy(captain, 'racial');
    },
    cancel(slot) { for (let i = queue.length - 1; i >= 0; i--) if (queue[i].slot === slot) queue.splice(i, 1); },
    prepare(opts) { release(); attackTarget=null; match = captain = null; entry = opts || {}; feedback = ''; document.body.classList.remove('captainManualActive'); },
    begin(opts, hero) {
      release(); entry = opts || {}; match = state; captain = hero || null; feedback = '';
      if (selectedMode === 'manual' && available() && captain && !state.dungeon) {
        match._captainManual = true;
        match.replayable = false;
        match.replayUnavailableReason = 'Manual Captain input playback is not supported in this prototype.';
        document.body.classList.add('captainManualActive');
      }
    },
    end() { release(); attackTarget=null; match = captain = null; entry = {}; document.body.classList.remove('captainManualActive'); },
    setMode(mode) {
      if (state && !state.over && document.body.classList.contains('battleMode')) return false;
      if (mode !== 'auto' && mode !== 'manual') return false;
      if (mode === 'manual' && !available()) return false;
      selectedMode = mode; release(); return true;
    },
    input(dx, dy) {
      if (!active() || blocked(captain, false)) { release(); return; }
      x = Number.isFinite(dx) ? Math.max(-1, Math.min(1, dx)) : 0;
      y = Number.isFinite(dy) ? Math.max(-1, Math.min(1, dy)) : 0;
    },
    request(slot, aim) {
      if (!active() || !owns(captain) || blocked(captain) ||
          !['attack', 'a1', 'a2', 'ult', 'dreambind'].includes(slot) ||
          (slot === 'dreambind' && captain.classId !== 'rogue')) return false;
      if (slotBlocked(captain, slot)) return false;
      if (queue.some(action => action.slot === slot)) return true;
      if (queue.length >= 4) return false;
      let target, explicit=false, ground=false;
      if(aim?.point){
        if(!legalPoint(captain,slot,aim.point)){say('Invalid placement: check range, walls and line of sight.');return false;}
        target={x:aim.point.x,y:aim.point.y,alive:true};explicit=ground=true;
      }else if(aim&&Object.hasOwn(aim,'targetId')){
        target=state.entities.find(t=>t.id===aim.targetId);
        if(!legalAim(captain,target,slot)){say('That target is not valid or is out of range.');return false;}
        explicit=true;
        if(slot==='attack')attackTarget=target;
      }else{
        if(slot==='attack'&&attackTarget&&(!attackTarget.alive||attackTarget.team===captain.team))attackTarget=null;
        target=slot==='attack'&&valid(captain,attackTarget)?attackTarget:enemy(captain,slot);
      }
      queue.push({slot, target, explicit, ground, until: now() + 250});
      return true;
    },
    view() {
      const running = active(), allowed = available();
      const reason = !local(entry) ? 'Ranked, Tournament, Dungeon and replay use AUTO.' :
        teamSize !== 3 ? 'Choose 3v3.' : !captainClass || !selected.includes(captainClass) ? 'Choose a Captain in your squad.' : '';
      const lock = running ? blocked(captain, false) : '';
      if (running && (!captain.alive || captain.team !== 'player')) release();
      return {selected: allowed ? selectedMode : 'auto', available: allowed, active: running, enabled: running && !lock,
        reason, captainName: running ? captain.name : (CLASS_STATS[captainClass]?.name || ''),
        target: running && valid(captain, captain.lastTarget) ? 'Target: ' + captain.lastTarget.name : '',
        message: lock || (feedbackUntil > now() && feedback) || 'MANUAL · Local only · No saved replay',
        slots: running ? slots(captain) : []};
    }
  };
  window.addEventListener('blur', release);
  window.addEventListener('pagehide', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
  document.addEventListener('click', event => {
    if (event.target?.closest?.('#backBtn,#menuBtn,#endMenuBtn,#returnToArenaBtn,#battleBracketBtn,#teamBuilderBackBtn')) window.CaptainControl.end();
  }, true);
  window.addEventListener('message', event => {
    if (event.source === window.parent && event.origin === location.origin &&
        ['arena:show-team', 'arena:captain-input-release'].includes(event.data?.type)) window.CaptainControl.end();
  });
})();