// Rebuild the small, licensed runtime library. Originals stay outside the app.
// Usage: node tools/build-fantasy-audio.mjs /tmp/fantasy-audio
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root = process.argv[2] || '/tmp/fantasy-audio';
const output = new URL('../public/audio/', import.meta.url);
const sources = {
  'kenney-rpg': ['Kenney', 'https://kenney.nl/assets/rpg-audio', 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip'],
  'kenney-impact': ['Kenney', 'https://kenney.nl/assets/impact-sounds', 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip'],
  artisticdude: ['artisticdude', 'https://opengameart.org/content/rpg-sound-pack', 'https://opengameart.org/sites/default/files/rpg_sound_pack.zip'],
  rubberduck: ['rubberduck', 'https://opengameart.org/content/80-cc0-rpg-sfx', 'https://opengameart.org/sites/default/files/80-CC0-RPG-SFX_0.zip'],
  haeldb: ['HaelDB (four vocal performers)', 'https://opengameart.org/content/male-gruntyelling-sounds', 'https://opengameart.org/sites/default/files/yelling%20sounds.zip'],
  cicifyre: ['cicifyre', 'https://opengameart.org/content/voice-clip-packs-for-visual-novels-and-rpgs', 'https://opengameart.org/sites/default/files/Free%20Voice%20Clips%20Pack%20-%20Mature%20Female.zip'],
  laugh: ['AntumDeluge', 'https://opengameart.org/content/evil-laugh', 'https://opengameart.org/sites/default/files/laugh-evil-1_0.ogg'],
  bow: ['dorkster; source recordings by qubodup and remaxim', 'https://opengameart.org/content/bow-arrow-shot', 'https://opengameart.org/sites/default/files/shoot.ogg'],
};
const recipes = [];
function add(id, pack, original, max = 1.2, filter = '') {
  recipes.push({id, pack, original, max, filter});
}
for (let i=1;i<=3;i++) {
  add(`weapon/sword-swing-${i}`, 'artisticdude', `RPG Sound Pack/battle/swing${i===1?'':i}.wav`, .5);
  add(`weapon/blade-impact-${i}`, 'rubberduck', `blade_0${i}.ogg`, .65);
  add(`weapon/shield-block-${i}`, 'kenney-impact', `Audio/impactMetal_medium_00${i-1}.ogg`, .65);
  add(`weapon/heavy-impact-${i}`, 'kenney-impact', `Audio/impactPlate_heavy_00${i-1}.ogg`, .65);
  add(`weapon/body-hit-${i}`, 'kenney-impact', `Audio/impactPunch_heavy_00${i-1}.ogg`, .4);
  add(`spell/ice-crack-${i}`, 'kenney-rpg', `Audio/cloth${i}.ogg`, .65,
    'highpass=f=1100,lowpass=f=6500,aecho=0.7:0.55:37|71:0.18|0.10');
}
add('weapon/dagger-1', 'kenney-rpg', 'Audio/knifeSlice.ogg', .4);
add('weapon/dagger-2', 'kenney-rpg', 'Audio/knifeSlice2.ogg', .4);
add('weapon/axe-chop', 'kenney-rpg', 'Audio/chop.ogg', .6);
add('weapon/bow-release', 'bow', 'bow.ogg', .4);
add('weapon/arrow-impact', 'kenney-impact', 'Audio/impactWood_medium_000.ogg', .45);
add('weapon/charge-rush', 'artisticdude', 'RPG Sound Pack/battle/swing3.wav', .65, 'asetrate=36000,aresample=32000');
for(let i=1;i<=2;i++) add(`spell/magic-${i}`, 'kenney-rpg', `Audio/cloth${i+1}.ogg`, .85,
  'areverse,highpass=f=650,lowpass=f=4400,aecho=0.7:0.55:53|101:0.20|0.12');
for(let i=1;i<=3;i++) add(`spell/fire-${i}`, 'rubberduck', `spell_fire_0${i}.ogg`, 1.1);
add('spell/holy', 'kenney-rpg', 'Audio/cloth4.ogg', .9,
  'highpass=f=400,lowpass=f=3800,aecho=0.7:0.55:61|117:0.20|0.12');
add('spell/projectile', 'kenney-rpg', 'Audio/cloth1.ogg', .65,
  'areverse,highpass=f=950,lowpass=f=6200,aecho=0.7:0.55:43:0.12');
add('spell/shadow', 'artisticdude', 'RPG Sound Pack/NPC/shade/shade1.wav', 1.1, 'lowpass=f=1800');
add('spell/nature', 'kenney-rpg', 'Audio/cloth3.ogg', .6);
add('status/fear', 'artisticdude', 'RPG Sound Pack/NPC/shade/shade3.wav', 1.1, 'lowpass=f=2400');
add('status/poison', 'rubberduck', 'creature_slime_01.ogg', .6);
add('status/interrupt', 'kenney-impact', 'Audio/impactMetal_light_000.ogg', .35);
add('status/shield-break', 'kenney-impact', 'Audio/impactGlass_heavy_000.ogg', .8);
add('status/stealth', 'kenney-rpg', 'Audio/cloth4.ogg', .7);
add('events/victory', 'kenney-impact', 'Audio/impactBell_heavy_000.ogg', 2);
add('events/defeat', 'artisticdude', 'RPG Sound Pack/NPC/shade/shade10.wav', 1.4, 'lowpass=f=1200');
add('events/ultimate', 'rubberduck', 'spell_fire_07.ogg', 1.25);
for(const [family,prefix] of [['soldier','1'],['knight','2'],['agile','3'],['mystic','']]) {
  for(let i=1;i<=2;i++) {
    add(`vocal/${family}-effort-${i}`, 'haeldb', `yelling sounds/${prefix==='3'?'3grunt':prefix+'yell'}${i}.wav`, .6);
    add(`vocal/${family}-hurt-${i}`, 'haeldb', `yelling sounds/${prefix}yell${i+4}.wav`, .65);
  }
  add(`vocal/${family}-death`, 'haeldb', `yelling sounds/${prefix}yell10.wav`, 1.25);
  add(`vocal/${family}-cry`, 'haeldb', `yelling sounds/${prefix}yell8.wav`, .85);
}
const female = 'Free Voice Clips Pack - Mature Female/noises/';
for(const [id,original,max] of [
  ['female-effort-1','anime_uh',.5],['female-effort-2','anime_haa',.55],
  ['female-hurt-1','gasp1',.6],['female-hurt-2','anime_ah',.6],
  ['female-death','sigh2',1],['female-laugh','small_single_laugh',1],
]) add(`vocal/${id}`, 'cicifyre', `${female}${original}.wav`,max);
add('vocal/dark-laugh', 'laugh', 'evil-laugh.ogg', 1.1, 'lowpass=f=2800');
add('vocal/beast-effort', 'rubberduck', 'creature_roar_01.ogg', .6);
add('vocal/beast-death', 'rubberduck', 'creature_die_01.ogg', 1);
const manifest = {version:1, format:'MP3, mono, 32 kHz, VBR quality 4', assets:{}};
mkdirSync(output,{recursive:true});
for(const r of recipes) {
  const input = path.join(root, r.pack==='laugh'||r.pack==='bow'?'':r.pack,r.original);
  const target = new URL(`${r.id}.mp3`, output);
  mkdirSync(new URL('./',target), {recursive:true});
  const trim='silenceremove=start_periods=1:start_duration=0.008:start_threshold=-45dB';
  // Trim only leading silence; never concatenate phrases or truncate gaps into new words.
  const filters=[trim,r.filter,'highpass=f=65','lowpass=f=12500',
    'loudnorm=I=-20:TP=-3:LRA=7',`atrim=duration=${r.max}`,
    `afade=t=out:st=${Math.max(0,r.max-.045)}:d=0.045`,
    'aresample=32000','alimiter=limit=0.63:attack=1:release=40:level=0'].filter(Boolean).join(',');
  execFileSync('ffmpeg',['-v','error','-y','-i',input,'-vn','-af',filters,
    '-ac','1','-ar','32000','-codec:a','libmp3lame','-q:a','4','-map_metadata','-1',target.pathname]);
  const bytes=readFileSync(target);
  const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',target.pathname],{encoding:'utf8'}).trim());
  manifest.assets[r.id] = {
    file:`${r.id}.mp3`,creator:sources[r.pack][0],sourcePage:sources[r.pack][1],
    sourceDownload:sources[r.pack][2],original:r.original,
    license:r.pack==='bow'?'CC-BY-SA-3.0':'CC0-1.0',
    licenseUrl:r.pack==='bow'?'https://creativecommons.org/licenses/by-sa/3.0/':'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceSha256:createHash('sha256').update(readFileSync(input)).digest('hex'),
    sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,duration,
    edits:`Leading-silence trim; mono/32kHz; EQ; -20 LUFS/-3 dBTP target; -4 dB sample-peak safety limiter before MP3; max ${r.max}s; short fade${r.filter?'; '+r.filter:''}`,
  };
}
writeFileSync(new URL('manifest.json',output),JSON.stringify(manifest,null,2)+'\n');
// Avoid runtime JSON import analysis and extra fetch/parse; tiny plain script.
const runtime=Object.fromEntries(Object.entries(manifest.assets).map(([id,a])=>[id,{
  file:a.file,duration:a.duration,revision:a.sha256.slice(0,12),
}]));
writeFileSync(new URL('bank.js',output),'window.FantasyAudioBank = '+JSON.stringify(runtime)+';\n');
console.log(`${recipes.length} assets; ${Object.values(manifest.assets).reduce((sum,a)=>sum+a.bytes,0)} bytes`);
