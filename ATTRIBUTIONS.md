# Third-party assets

Everything listed here is free for commercial use. CC0 pieces do not require credit; the CC-BY line does, and it is also in `public/dungeon/audio/CREDITS.md`. Sheets and audio were copied into this repo. Models are instanced or merged in the raid so they stay inside the draw-call budget.

## VFX textures — `public/assets/vfx/thirdparty/`

Full notes live next to the files in `public/assets/vfx/thirdparty/ATTRIBUTIONS.md`.

- Unity Labs Paris Houdini flipbooks (explosion, fireball, flame, smoke, cloud) — CC0. Used for the mage fire blast, warrior slam dust, boss impacts, burning cars, and smoke columns. https://unity.com/blog/engine-platform/free-vfx-image-sequences-flipbooks
- Kenney Particle Pack — CC0. Slashes, sparks, flare core. https://kenney.nl/assets/particle-pack
- "glow circle" by oglsdl — CC0. Heal halo and shockwave ring. https://opengameart.org/content/glow-circle
- "Lightning animation" by Calinou — CC0. Mage lightning, drawn additively. https://opengameart.org/content/lightning-animation
- "Lots of game effects" by Soluna Software — CC0. https://opengameart.org/content/lots-of-game-effects
- "Colored summoning circles" by johndh (OpenGameArt.org), CC-BY 3.0. The small rune under the mage fire blast. https://opengameart.org/content/colored-summoning-circles

Grayscale and black-background sprites were converted to white-with-alpha and tinted to the class colors. Sheets are 2048 px or smaller, saved as WebP.

## Bridge traffic — `public/dungeon/env/traffic/`

Designer buildings stay the environment kit. These are extra wrecks, cones, and debris on the Tancheon bridge, merged into a handful of draw calls.

- Kenney Car Kit — CC0. Police, firetruck, ambulance, taxi, sedan, SUV, truck, and 14 debris pieces. https://kenney.nl/assets/car-kit
- Quaternius Zombie Apocalypse Kit — CC0. Wrecked and armored cars, cracked road pieces, traffic lights, cones, containers, cinder blocks, pallets. https://quaternius.com/packs/zombieapocalypsekit.html

## Audio — `public/dungeon/audio/`

Playback levels are normalized in `src/raid/audio.js`. Sound effects get a slight random pitch. The per-cue map is in that file; the design names are in the raid audio cue table.

- "Epic Boss Battle" (seamlessly looping) by SubspaceAudio / Juhani Junkala — CC0. Main raid loop, phase 1. https://opengameart.org/content/boss-battle-music
- "Determined Pursuit" by Emma_MA — CC0. Phase 2. https://opengameart.org/content/determined-pursuit-epic-orchestra-loop
- "QaziJamJam" by Emma_MA — CC0. Intro cutscene. https://opengameart.org/content/qazijamjam-orchestral-battle-theme
- "The Final Battle" by skrjablin — CC0. Phase 3 / enrage. https://opengameart.org/content/the-final-battle
- "Battle Theme A" by cynicmusic — CC0. Rift alert. https://opengameart.org/content/battle-theme-a
- Kenney Impact Sounds — CC0. Hits and armor. https://kenney.nl/assets/impact-sounds
- Kenney RPG Audio — CC0. Sword and armor. https://kenney.nl/assets/rpg-audio
- "25 CC0 bang / firework SFX" by rubberduck — CC0. Explosions and building collapse. https://opengameart.org/content/25-cc0-bang-firework-sfx
- "80 CC0 RPG SFX" by rubberduck — CC0. Spells, fire, heals. https://opengameart.org/content/80-cc0-rpg-sfx

Other raid cues that were already in the game (siren, victory, footsteps, UI, boss roars) stay credited in `public/dungeon/audio/CREDITS.md`.
