// Usage: node tools/build-fantasy-music.mjs /tmp/fantasy-music
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const input=process.argv[2]||'/tmp/fantasy-music';
const output=new URL('../public/audio/music/',import.meta.url);
mkdirSync(output,{recursive:true});
const tracks=[
  {id:'menu',title:'A New Town (RPG Theme)',original:'025_A_New_Town.mp3',page:'https://opengameart.org/content/a-new-town-rpg-theme'},
  {id:'battle',title:'Battle Theme A',original:'battleThemeA.mp3',page:'https://opengameart.org/content/battle-theme-a'},
];
const manifest={version:1,tracks:{}};
for(const track of tracks){
  const source=path.join(input,track.original),file=new URL(track.id+'.mp3',output);
  execFileSync('ffmpeg',['-v','error','-y','-i',source,'-vn','-af',
    'loudnorm=I=-22:TP=-3:LRA=10,aresample=44100,alimiter=limit=0.71:attack=5:release=100:level=0',
    '-ac','2','-ar','44100','-codec:a','libmp3lame','-b:a','112k','-map_metadata','-1',file.pathname]);
  const bytes=readFileSync(file);
  manifest.tracks[track.id]={
    title:track.title,file:track.id+'.mp3',creator:'The Cynic Project / cynicmusic',
    creatorWebsite:'https://cynicmusic.com',sourcePage:track.page,
    sourceDownload:'https://opengameart.org/sites/default/files/'+track.original,
    original:track.original,license:'CC0-1.0',
    licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceSha256:createHash('sha256').update(readFileSync(source)).digest('hex'),
    sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,
    duration:Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',file.pathname],{encoding:'utf8'})),
    edits:'Full composition retained; -22 LUFS/-3 dBTP normalization target; final peak safety limiter; stereo 44.1kHz MP3 112kbps.',
  };
}
writeFileSync(new URL('manifest.json',output),JSON.stringify(manifest,null,2)+'\n');
console.log(Object.values(manifest.tracks).map(t=>`${t.title}: ${t.duration}s, ${t.bytes} bytes`).join('\n'));
