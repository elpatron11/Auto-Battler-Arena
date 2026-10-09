# Fantasy World Arenas — combat audio credits

The per-file inventory is `manifest.json`: creator, original filename, original
download, source page, license link, edits, input/output SHA-256, size and duration.
The original archives are not shipped in the app. Runtime files are optimized
MP3 derivatives. They are available alongside this document, in the subfolders
listed in the inventory.

## CC0 1.0 Universal / public-domain dedication

These creators expressly offer the listed source packs under CC0. CC0 permits
commercial use, modification and redistribution, without required attribution.
We retain credits voluntarily and select CC0 where multiple licenses are offered.

| Creator | Pack / authoritative license evidence |
| --- | --- |
| Kenney | [RPG Audio](https://kenney.nl/assets/rpg-audio), [Impact Sounds](https://kenney.nl/assets/impact-sounds) |
| artisticdude | [RPG Sound Pack](https://opengameart.org/content/rpg-sound-pack) |
| rubberduck | [80 CC0 RPG SFX](https://opengameart.org/content/80-cc0-rpg-sfx) |
| HaelDB and the pack's four vocal performers | [Male Grunt/Yelling sounds](https://opengameart.org/content/male-gruntyelling-sounds), CC0 option selected |
| cicifyre | [Voice Clip Packs for Visual Novels and RPGs](https://opengameart.org/content/voice-clip-packs-for-visual-novels-and-rpgs), Mature Female pack, nonverbal clips only |
| AntumDeluge | [Evil Laugh](https://opengameart.org/content/evil-laugh), original performance for Stendhal |

[CC0 license and legal code](https://creativecommons.org/publicdomain/zero/1.0/).
The creator pages were inspected for their explicit license statements during
this import. No ripped game sounds, imitated characters, or recognizable dialogue
are included. Generic nonverbal performances are used, not character impersonations.

## Bow-release exception — CC BY-SA 3.0

`weapon/bow-release.mp3` is an adaptation of **Bow & Arrow Shot** by **dorkster**,
based on source recordings by **qubodup** and **remaxim**.

- [Source and attribution chain](https://opengameart.org/content/bow-arrow-shot)
- [Swish/bamboo recording](https://opengameart.org/content/swish-bamboo-stick-weapon-swhoshes)
- [Arrow hit twang](https://opengameart.org/content/arrow-hit-twang)
- [CC BY-SA 3.0 license](https://creativecommons.org/licenses/by-sa/3.0/)
- [CC BY-SA 3.0 legal code](https://creativecommons.org/licenses/by-sa/3.0/legalcode)
- [Download this adapted recording](./weapon/bow-release.mp3)

This adapted recording remains **CC BY-SA 3.0**, including permission for
commercial use with attribution and ShareAlike for adaptations of the recording.
It was trimmed, EQ'd, loudness-normalized and converted to mono 32 kHz MP3;
see its inventory entry for exact processing and hashes. No additional restrictions
are placed on the recording. The separate gameplay code is not derived from it.
If distributing a changed bow recording, retain attribution and the same license.

## Processing and distribution

Background music is **A New Town (RPG Theme)** and **Battle Theme A** by
**The Cynic Project / cynicmusic** — [cynicmusic.com](https://cynicmusic.com),
[pixelsphere.org](https://pixelsphere.org).
The creator's [menu-track page](https://opengameart.org/content/a-new-town-rpg-theme)
and [battle-track page](https://opengameart.org/content/battle-theme-a) expressly
offer CC0. Full compositions are retained, normalized and converted to stereo
44.1 kHz MP3 at 112 kbps. `music/manifest.json` records both tracks' original
downloads, authorship, license, processing and input/output SHA-256.

Spell projectile, holy, magic and frost-wind derivatives now use processed
Kenney CC0 cloth/air sweeps, not metallic/glass hits. The historical
`ice-crack-*` filenames are retained for compatibility, not as a description
of a glass source. Healing uses a quiet 65 ms original sine beep.

All imported samples: leading silence removed; modest high/low-pass EQ;
normalized to -20 LUFS with -3 dB true-peak target; short nonverbal cuts; short
end fade where the cut reaches its maximum; final -4 dB sample-peak safety limiter
before mono 32 kHz VBR MP3 encoding. Source files are
never concatenated into new words. Existing original UI click and purchase
oscillator cues are retained, separately from the imported samples.

Include this credits document, the inventory, and the in-game credits link in
future web/native distributions. These notices concern imported assets, not
permission to publish this project.
