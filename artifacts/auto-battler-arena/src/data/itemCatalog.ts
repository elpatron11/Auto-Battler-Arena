/** Display-only index of the loadout definitions in public/game.html.
 * IDs for alternate drops match the economy's ability:/ult:/class:talent IDs.
 * Default loadout entries are intentionally not market items.
 */
export type CatalogKind = 'spell' | 'ultimate' | 'talent';
export type CatalogEntry = {
  kind: CatalogKind;
  id: string;
  classId: string;
  name: string;
  variant: 'default' | 'alternate' | 'starter' | 'unlock';
  summary: string;
  effect: string;
  art: string;
};

const artPath = (classId: string, name: string) => `/collectibles/${classId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.webp`;

export const classNames: Record<string, string> = {
  frostmage: 'Cryomancer', priest: 'Priest', warrior: 'Warrior',
  rogue: 'Rogue', paladin: 'Paladin', archer: 'Archer',
  warlock: 'Warlock', druid: 'Druid', shaman: 'Shaman',
};

const spell = (classId: string, name: string, summary: string, effect: string, slot: number): CatalogEntry =>
  ({ kind: 'spell', classId, id: `default:spell:${classId}:${slot}`, name, variant: 'default', summary, effect, art: artPath(classId, name) });
const ult = (classId: string, name: string, summary: string, effect: string): CatalogEntry =>
  ({ kind: 'ultimate', classId, id: `default:ultimate:${classId}`, name, variant: 'default', summary, effect, art: artPath(classId, name) });
const alternate = (kind: 'spell' | 'ultimate', classId: string, name: string, summary: string, effect: string): CatalogEntry =>
  ({ kind, classId, id: `${kind === 'spell' ? 'ability' : 'ult'}:${classId}`, name, variant: 'alternate', summary, effect, art: artPath(classId, name) });
const talent = (classId: string, id: string, name: string, branch: string, effect: string, starter = false): CatalogEntry =>
  ({ kind: 'talent', classId, id: `${classId}:${id}`, name, variant: starter ? 'starter' : 'unlock', summary: branch, effect, art: artPath(classId, name) });

export const itemCatalog: CatalogEntry[] = [
  // CLASS_DESC: both default abilities and the default ultimate of every class.
  spell('frostmage', 'Glacial Bolt', '1s cast · no cooldown', '30 damage (60 vs frozen); slows movement and attack speed for 3s.', 1),
  spell('frostmage', 'Ice Tempest', '6s cooldown', 'Area damage and a 3s freeze around the target; hits through walls.', 2),
  ult('frostmage', 'Frost Pet', '12s cooldown', 'Summons a tanky bolt-firing pet for 6s, dealing 80% of your damage and carrying one Ice Tempest charge.'),
  spell('priest', 'Sanctuary Shield', '1s cooldown', 'Shields self or an ally for 40 for 10s.', 1),
  spell('priest', 'Radiant Strike', '1.2s cast · no cooldown', 'Damages an enemy or heals an ally.', 2),
  ult('priest', 'Revive', '10s cooldown · 1.5s cast', 'Brings a fallen ally back with partial health.'),
  spell('warrior', 'Cleave', '5s cooldown', 'Melee area damage and an 80% snare for 5s; reflects the next hit and its spell effects for 1s.', 1),
  spell('warrior', 'Charge', '5s cooldown', 'Dashes to an enemy, damaging and stunning them.', 2),
  ult('warrior', 'Rampage', '9s cooldown', 'For 5s: +130% damage, faster movement and 35% lifesteal from direct damage.'),
  spell('rogue', 'Smoke Veil', '5s cooldown', 'Clears debuffs and grants stealth, +40% movement and 10 health/sec regeneration for 16s.', 1),
  spell('rogue', 'Ambush Strike', '7s cooldown', 'Deals 24 area damage, stuns, then slows by 60% for 3s.', 2),
  ult('rogue', 'Death Mark', '5s cooldown', 'Burst and heavy bleed on a nearby target; they take 30% more damage from everyone.'),
  spell('paladin', 'Holy Smash', '3s cooldown', 'A hard melee hit that heals the paladin.', 1),
  spell('paladin', 'Blessing of Light', '3s cooldown', 'Shields, heals and cleanses two debuffs on an ally; also applies to the paladin.', 2),
  ult('paladin', 'Divine Stand', '9s cooldown', 'Deals 20 damage and stuns nearby enemies; heals nearby allies.'),
  spell('archer', 'Piercing Shot', '6s cooldown', 'Heavy single-target damage and 50% reduced healing on the target for 4s.', 1),
  spell('archer', 'Mark Target', '6s cooldown', 'Marks for 8s: target takes 35% more damage and remains targetable while stealthed.', 2),
  ult('archer', 'Rain of Arrows', '8s cooldown', 'Arrows arc over walls for 3s of area damage, followed by a small poison effect.'),
  spell('warlock', 'Agony Hex', '1.6s cooldown', 'Applies a stacking damaging curse to a nearby enemy without it.', 1),
  spell('warlock', 'Umbral Bolt', '1s cast', '25 shadow damage and refreshes the curse; every third cast becomes a 75-damage Chaos Lance.', 2),
  ult('warlock', 'Dark Pact', '14s cooldown', 'Area curse through walls that fears everyone hit for 3.2s.'),
  spell('druid', 'Tiger Form', '4s cooldown', 'Doubles movement and attack speed for 8s.', 1),
  spell('druid', 'Tree Form', '10s cooldown', 'Rooted 6s grove heals allies and deals 8 damage/sec to enemies; cleanses and blocks debuffs.', 2),
  ult('druid', 'Wild Surge', '12s cooldown', 'Empowers current form: Bear gains damage and stagger, Tiger bleeds, Tree revives fallen allies at 1 HP.'),
  spell('shaman', 'Spirit Mend', '1.5s cast', 'Heals for 60 and grants three Earth Orbs; each heals 15 when consumed by a hit.', 1),
  spell('shaman', 'Fireshock', '4s cooldown', 'Interrupts a cast, deals 50 fire damage and leaves a 5-damage-per-tick burn.', 2),
  ult('shaman', 'Purge', '3s cooldown', 'Enemy: strip shields and buffs and silence for 6s. Ally: cleanse all debuffs and grant three Earth Orbs.'),

  // CUSTOM_ABILITIES: replacements for ability 2.
  alternate('spell', 'frostmage', 'Blink', '4s cooldown', 'Teleports away, gains speed, heals 14/sec for 4s and makes Glacial Bolt instant (at most once/sec).'),
  alternate('spell', 'priest', 'Swift Shield', '7s cooldown', 'Shields for 57, heals 7/sec and grants +90% speed to self or an ally.'),
  alternate('spell', 'rogue', 'Disorient', '15s cooldown', 'Interrupts a cast and makes a nearby enemy wander helplessly for 6.5s.'),
  alternate('spell', 'paladin', 'Gladiator', '8s cooldown · damage role', 'Gives an ally and self +35 physical damage and +30% speed for 20s; when charged, a ranged 20-damage stun.'),
  alternate('spell', 'archer', 'Bear Trap', '3 charges · 10s recovery', 'Predictive traps root and bleed for 4s, then deal 28 area damage; unsprung traps detonate after 6s.'),
  alternate('spell', 'warlock', 'Doom Curse', '10s cooldown', 'Detonates for 60 damage the first time the cursed target is healed.'),
  alternate('spell', 'druid', 'King of the Jungle', 'Passive · damage role', 'Permanent empowered Tiger/Bear forms replace Tree. Bear mitigates 70% damage and heals 6 HP/sec. Grants the team +15% all stats.'),

  // CUSTOM_ULTS. Hexform is an additional Cryomancer variant in game.html,
  // but shares ult:frostmage with Firestorm and has no separate drop ID.
  alternate('ultimate', 'warrior', 'Steel Cyclone', '12s cooldown', 'Breaks crowd control; spins for 4s with immunity, +30% speed, no incoming damage and 22 area damage/sec.'),
  alternate('ultimate', 'priest', 'Umbral Ascension', '20s cooldown', '15s shadow transformation: Radiant Strike becomes a slowing damaging beam; shields explode and fear when broken.'),
  alternate('ultimate', 'frostmage', 'Firestorm', '12s cooldown · 1.5s cast', 'A 5s fire rune deals 30 damage/sec; interrupting its cast grants a 50-damage Fire Shield.'),
  { kind: 'ultimate', classId: 'frostmage', id: 'variant:polymorph:frostmage', name: 'Hexform', variant: 'alternate', summary: '12s cooldown · 1s cast', effect: 'Transforms a non-Druid enemy for 6s; when it ends, chains to another nearby non-Druid target. Shares the Cryomancer alternate ultimate unlock.', art: artPath('frostmage', 'Hexform') },
  alternate('ultimate', 'archer', 'Beast Command', '14s cooldown', 'Runs hawk and snake together and doubles pet movement and attack speed for 8s; calls a turtle if a pet falls.'),
  alternate('ultimate', 'rogue', 'Umbral Step', '10s cooldown', 'Teleports behind the target to stun then silence; dodges everything and attacks 100% faster for 3s.'),
  alternate('ultimate', 'shaman', 'Elemental Fury', '3s cast · no cooldown', 'Chain Lightning hits up to four targets for 85, 95, 105 and 115 damage.'),

  // CLASS_TALENTS: first talent of each class is its starter.
  talent('frostmage', 'frostbite', 'Winter’s Edge', 'Damage', '+18% frost damage.', true),
  talent('frostmage', 'deepchill', 'Deep Chill', 'Glacial Bolt', 'Glacial Bolt slows 30% more.'),
  talent('frostmage', 'icearmor', 'Crystal Guard', 'Survival', '+20% maximum health.'),
  talent('priest', 'grace', 'Grace', 'Healing', '+20% healing done.', true),
  talent('priest', 'warding', 'Warding', 'Protection', '+25% shield strength.'),
  talent('priest', 'lastgrace', 'Last Grace', 'Passive', 'Healing allies below 30% HP is 30% stronger.'),
  talent('warrior', 'brutal', 'Brutal Strikes', 'Damage', '+18% physical damage.', true),
  talent('warrior', 'iron', 'Iron Body', 'Survival', '+20% maximum health.'),
  talent('warrior', 'executioner', 'Executioner', 'Passive', '+25% damage to enemies below 30% HP.'),
  talent('rogue', 'precision', 'Precision', 'Damage', '+18% damage.', true),
  talent('rogue', 'quickhands', 'Quick Hands', 'Speed', '+20% attack speed.'),
  talent('rogue', 'escape', 'Escape Artist', 'Passive', '+25% movement speed while below 35% HP.'),
  talent('paladin', 'devotion', 'Devotion', 'Support', '+18% healing and shielding.', true),
  talent('paladin', 'aegis', 'Aegis', 'Survival', '+20% maximum health.'),
  talent('paladin', 'mercy', 'Mercy', 'Passive', 'Healing allies below 30% HP is 30% stronger.'),
  talent('archer', 'marksman', 'Marksman', 'Damage', '+18% ranged damage.', true),
  talent('archer', 'scout', 'Scout', 'Speed', '+20% movement speed.'),
  talent('archer', 'hunter', 'Pack Hunter', 'Passive', 'Your pets gain +25% health.'),
  talent('warlock', 'affliction', 'Affliction', 'Damage', '+20% damage-over-time damage.', true),
  talent('warlock', 'demonhide', 'Dark Fortitude', 'Survival', '+20% maximum health.'),
  talent('warlock', 'malice', 'Malice', 'Passive', '+20% damage against enemies carrying multiple debuffs.'),
  talent('druid', 'wildheart', 'Wild Heart', 'Healing', '+18% healing done.', true),
  talent('druid', 'bearhide', 'Thick Hide', 'Bear', 'Bear Form takes 20% less damage.'),
  talent('druid', 'tigerfang', 'Tiger Fang', 'Tiger', 'Tiger Form deals +20% damage.'),
  talent('shaman', 'elements', 'Elemental Power', 'Damage', '+18% spell damage.', true),
  talent('shaman', 'earth', 'Earth Skin', 'Survival', '+20% maximum health.'),
  talent('shaman', 'spirit', 'Spirit Flow', 'Healing', '+18% healing done.'),
];

export const catalogByKey = new Map(itemCatalog.map(entry => [`${entry.kind}:${entry.id}`, entry]));