# Corridor: 정자 → 롯데월드타워 (성남대로 · 송파대로)

The live 정자 map (`public/data/*`, bbox x −606..597, z −608..940) is left as is. The corridor streams **pre-baked** tiles around it
(`public/corridor/`), so the build and the game never need an API key.

## Pipeline

1. **Source bake (offline, optional)**: the prototype bake (`bumpinto-world/scripts/bake.mjs`) merges OSM + Overture footprints,
   and corrects building heights with VWorld GIS건물통합정보. The key it needs is read from `VWORLD_KEY` in the environment
   (`.env.local`, gitignored). Never commit it. Its output is a `public/world/` folder (index, tiles).
2. **Corridor build**: `npm run corridor:build -- --src=<prototype>/public/world --out=public/corridor`
   - Drops everything inside the live bbox (live data wins). Clips crossing roads at the bbox and drops corridor road segments
     that duplicate a live road of equal or larger width. The surviving pieces carry an overlap marker `o`, which keeps road joins seamless.
   - Splits into 500 m tiles: `tiles/<i>_<j>.json` (detail) and `lod/<i>_<j>.json` (simplified), plus `base.json` (탄천 channel roads,
     crossings) and `index.json` (meta, stations, landmarks, tile list).
3. **Runtime** (`src/corridor/`): builds one tile per frame, nearest first. Detail tiles are within ~650 m, LOD within ~1.8 km
   (4.2 km in overview), with unload hysteresis. It reuses the live `world.js` materials, ribbons, facades, trees and station signs.
   Quality: `?corridorq=low|med|high`. Turn it off with `?corridor=0`.
4. **Streetlights**: `npm run corridor:streetlights` bakes `public/corridor/streetlights.json` from the corridor tiles, `base.json`,
   `public/jeongja.json` (정자 live roads) and OSM nodes cached in `data/osm_streetlights_raw.json` (`highway=street_lamp`, bus stops,
   shelters, trees; refresh with `--osm=<osm_merged.json>`). Real OSM lamps go first. Then T lamps follow the car roads by class
   (motorway/trunk/primary/secondary ~35-40 m, both sides or zigzag; tertiary 40 m; residential 50 m one side), staying clear of
   junctions, crosswalks, bus stops, trees, buildings and bridges. The output is deterministic (`test-streetlights.mjs` re-bakes and
   compares). Runtime is `src/world/streetlights.js`: three InstancedMeshes (body, lens, ground pool) and no real lights. Night comes
   from `src/world/nightLights.js`, which follows `evening.js`. Turn it off with `?streetlights=0`, which skips the fetch and the meshes.

## Checks

- `npm run corridor:check -- --out=/tmp/check-roads.json`: road continuity over the exact ribbons the game renders.
  - Route 정자 → 롯데 along 성남대로/송파대로: sampled every 5 m, across the width.
  - Tile seam cracks: each crack is compared against the merged road, so the bend notches `ribbonGeo` also leaves in live are not counted.
  - Junction core holes and T near-misses.
  - Live/corridor seam cracks.
  - Exits with code 2 on any defect.
- `npm run corridor:probe -- --url=http://localhost:4173/ --out=/tmp/shots --tag=branch`: screenshots plus fps, draw calls and triangles
  per view (`?perf=1` or the <kbd>`</kbd> key shows the same in game).

## In game

- `📍 Travel` button or <kbd>T</kbd>: teleport to 정자, any corridor station, or Lotte World Tower. `?at=<station id>|lotte` starts there.
