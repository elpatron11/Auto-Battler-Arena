import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Each generated sheet is a three-by-three grid in reading order. Keep this
// layout beside the source sheets so individual card art can be recropped.
const cards = {
  frostmage: ['Glacial Bolt', 'Ice Tempest', 'Frost Pet', 'Blink', 'Firestorm', 'Hexform', 'Winter’s Edge', 'Deep Chill', 'Crystal Guard'],
  priest: ['Sanctuary Shield', 'Radiant Strike', 'Revive', 'Swift Shield', 'Umbral Ascension', 'Grace', 'Warding', 'Last Grace'],
  warrior: ['Cleave', 'Charge', 'Rampage', 'Steel Cyclone', 'Brutal Strikes', 'Iron Body', 'Executioner'],
  rogue: ['Smoke Veil', 'Ambush Strike', 'Death Mark', 'Disorient', 'Umbral Step', 'Precision', 'Quick Hands', 'Escape Artist'],
  paladin: ['Holy Smash', 'Blessing of Light', 'Divine Stand', 'Gladiator', 'Devotion', 'Aegis', 'Mercy'],
  archer: ['Piercing Shot', 'Mark Target', 'Rain of Arrows', 'Bear Trap', 'Beast Command', 'Marksman', 'Scout', 'Pack Hunter'],
  warlock: ['Agony Hex', 'Umbral Bolt', 'Dark Pact', 'Doom Curse', 'Affliction', 'Dark Fortitude', 'Malice'],
  druid: ['Tiger Form', 'Tree Form', 'Wild Surge', 'King of the Jungle', 'Wild Heart', 'Thick Hide', 'Tiger Fang'],
  shaman: ['Spirit Mend', 'Fireshock', 'Purge', 'Elemental Fury', 'Elemental Power', 'Earth Skin', 'Spirit Flow'],
};

const sheets = fileURLToPath(new URL('../../../attached_assets/generated_images/', import.meta.url));
const output = fileURLToPath(new URL('../public/collectibles/', import.meta.url));
let total = 0;
for (const [classId, names] of Object.entries(cards)) {
  const source = path.join(sheets, `${classId}-collectibles-sheet.png`);
  if (!existsSync(source)) throw new Error(`Missing ${source}`);
  const [width, height] = execFileSync('magick', ['identify', '-format', '%w %h', source], { encoding: 'utf8' }).trim().split(' ').map(Number);
  if (!width || !height || Math.abs(width - height) > 2 || width < 768) throw new Error(`Unexpected atlas dimensions for ${source}: ${width}x${height}`);
  for (const [index, name] of names.entries()) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const basename = `${classId}-${slug}`;
    if (!existsSync(path.join(output, `${basename}.svg`))) throw new Error(`Unknown card: ${basename}`);
    const column = index % 3;
    const row = Math.floor(index / 3);
    const left = Math.round(column * width / 3) + 5;
    const top = Math.round(row * height / 3) + 5;
    const cropWidth = Math.round((column + 1) * width / 3) - 5 - left;
    const cropHeight = Math.round((row + 1) * height / 3) - 5 - top;
    execFileSync('magick', [
      source, '-crop', `${cropWidth}x${cropHeight}+${left}+${top}`, '+repage',
      '-resize', '400x400', '-strip', '-quality', '84', path.join(output, `${basename}.webp`),
    ]);
    total++;
  }
}
console.log(`Wrote ${total} collectible illustrations.`);