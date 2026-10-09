# Combat audio audit and mixing contract

## Before this pass

The legacy game used a procedural `SFX` table, three additional class-audio
helpers (cast, attack, attack accent), and a shared oscillator/noise AudioContext.
There were no imported combat recordings and no existing volume sliders.
Music and SFX each had an independently persisted on/off checkbox.

- Keep: quiet triangle UI click and short purchase chord.
- Replace: noisy/beeping weapon/cast/impact cues, all synthetic death cues,
  spell/status signatures, and the major-result cues.
- Add: restrained recorded effort/pain/death vocals, charge cries, occasional
  Warlock and Shadow Priest laughter, shield absorption/break, accepted CC,
  poison application and actual cast interruption.

## Timing

The native combat source remains unchanged. External audio observers call the
original functions exactly once and return the original result.

- Swing/release: existing `classAttackSfx`, at the attack animation's start.
- Cast accent: existing `classCastSfx`, not an additional combat/cast timer.
- Spell release/ultimate/result: existing named `sfx` calls.
- Physical/spell hit: after actual HP loss, excluding DoT ticks.
- Block/break: after the authoritative shield amount decreases/reaches zero.
- Pain: only actual non-DoT HP loss on a still-living character.
- Death: existing per-class death call inside `handleDeath`; pets use creature vocals.
- CC: accepted status-burst hook, not an attempted immune/invalid CC.
- Interrupt: only when a real casting object was interrupted.
- Poison: accepted newly-added poison/venom DoT; not every poison tick.
- Channeled ultimates: cast-start power cue when a new casting object exists;
  native completion cues remain at completion. Shared form/purge/vanish cues
  receive extra emphasis only in ultimate context.

No game timers, cast callbacks, RNG, class/ability data, AI, geometry, animation,
VFX, targeting or rewards are modified. Audio randomness uses its own PRNG.
Cold samples are loaded for future use, never played late as stale hits.

## Organization and performance

`audio/weapon`, `audio/spell`, `audio/vocal`, `audio/status`, `audio/events`.
The two retained UI cues are generated, not imported; their category is `ui`.
`fantasy-audio-cues.js` maps all the old named cues and the new outcome observers.
`audio/manifest.json` traces every imported file to creator, source and license.

74 short mono MP3 recordings occupy approximately 400 KiB before filesystem
overhead. Only optimized derivatives ship. Three background fetch/decode workers
warm the library after user interaction, using the browser cache. Decoded-buffer
LRU budget is 12 MiB; at most 10 short sources play simultaneously, with
sub-budgets of 4 routine sounds, 4 featured sounds and 2 vocals. Higher-priority
events can evict lower-priority sounds. Important events duck routine sounds;
a compressor protects the final mix.

Variations never repeat the same sample consecutively for a cue. Recorded
effects vary rate by at most ±4.5% and gain by ±7%; vocal rate changes stay
within ±1.5%. Voices have a 3-second per-entity gap, 0.85-second global gap
and 22% effort/pain chance; deaths bypass the ordinary gap with high priority.
All slots/caches are independent of game entities. Backgrounding or muting
stops active SFX. Browser autoplay is unlocked by touch/click or keyboard.

The original Music checkbox is retained; the old beep sequencer is replaced by
streamed CC0 harp/orchestral compositions, on a separate music gain. The existing SFX
checkbox gates every new sound, including vocals, UI and accents. Optional
numeric `sfxVolume` values are respected if supplied; this pass does not invent
a new saved settings schema or change the profile ledger.

## Player-requested audio revision

Healing/HoT ticks use a quiet 65 ms sine beep, globally coalesced to at most
one per 0.55 seconds; full-health/no-op healing is silent. Cast, projectile,
holy and frost textures use soft processed CC0 air/cloth sweeps, not glass
or metal clangs. Physical weapon/shield metal impacts are retained.

Menus use **A New Town (RPG Theme)** (harp); fights use **Battle Theme A**
(strings/horns), both by The Cynic Project / cynicmusic under CC0. Full
compositions stream through one reused media element and a separate Web Audio
gain, not the SFX decoded-buffer cache. Music honors its own checkbox, pauses
in the background and ducks under important effects. Combined tracks total
approximately 2.2 MB. Track provenance is in `audio/music/manifest.json`.

Screen Wake Lock is requested only for a visible, running fight. It is released
when the fight ends, pauses, the page hides or the parent game frame is hidden,
and reacquired when appropriate. Unsupported, policy-blocked and battery-refused
requests fail safely without affecting combat. Both guest and account frames
explicitly delegate autoplay and screen-wake-lock. A browser can still refuse
these features through an ancestor permissions policy; no claim of universal
phone wake-lock support is made.

## Verification limits

Regression tests cover trigger outcomes, unchanged combat results and RNG,
throttling, simultaneous-source bounds, priority, mute/background behavior,
asset integrity/license traceability and source isolation. Browser verification
checks real Web Audio decoding/playback and guest 3v3 triggers. Real-device
Android/iOS audio latency and subjective listening remain device-specific;
do not claim physical-phone verification from a desktop viewport.

### Completed preview checks

The browser guest 3v3 reached Victory with recorded weapon/material, spell,
cast, death and result counters advancing. All 74 samples decoded, using
7,618,600 bytes; peak concurrency was 10 and there were no audio-load/playback
errors. Turning SFX off suppressed combat cues during a second real fight
while Music stayed on. Credits rendered from the in-game link. A 390×844
viewport also unlocked and decoded the complete library without audio errors.

Immediate cancellation of already-playing SFX is covered by the automated
regression test, not the browser UI pass: the settings checkbox is only
reachable from the menu. The testing browser could not assess subjective
listening quality or physical-device latency. Its existing WebGL limitation
caused the roster to use the original preview fallback, unrelated to audio.
Final encoded-sample peaks were checked after MP3 decoding and stayed below
0.665 amplitude, with no near-silent imported samples.
