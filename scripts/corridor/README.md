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
   Tancheon park lamps (kind 3, smaller and lower) go on the riverside footway/cycleway/path every ~30 m on one side, only inside the
   game terrain's Tancheon section (`terrain.json` + `corridor/tancheon.json`), never on the water or riverbed, and never on bridges.
   In overview (위에서 보기) at night only the soft ground pools are drawn, around the overview camera and independent of detail
   tiles (capped at 8192, reusing the pool mesh, so +1 draw call).

## Playgrounds (`?playgrounds=0` turns them off)

- `npm run corridor:playgrounds`: bakes `public/corridor/playgrounds.json` from OSM `leisure=playground` polygons
  (`data/osm_playgrounds_raw.json`; `-- --fetch` refreshes it from Overpass, `-- --osm=<overpass json>` re-filters a bigger dump).
  Each set is fitted to the polygon's minimum-area rectangle, kept inside the polygon and clear of buildings and road ribbons
  (live + corridor tiles), 2 sets for large polygons, shrunk down to 0.6× or skipped. The override list (`EXTRA_PLAYGROUNDS`) is in that script.
- Runtime `src/world/playgrounds.js`: 5 `InstancedMesh` (slide, swings, seesaw, jungle gym, sandbox; vertex colours, no textures),
  shown within 450 m of the camera focus and, in the corridor, only once that cell's detail tile is built; GPU buffers are freed when none is visible.
- Landscaping (`?pgland=0` turns only this off): the same script writes `public/corridor/playground-land.json` via `scripts/corridor/playground-land.mjs`.
  Inside each placed playground polygon (trees also in the 9 m margin of an enclosing OSM `leisure=park/garden`), seeded by the OSM id.
  It places benches next to the sets, then trees around the edge (crowns kept off the equipment), then low hedges along the boundary
  (left open at the point nearest a road), then bushes and grass clumps. Everything stays clear of buildings, water and road ribbons.
  OSM `natural=tree` nodes inside go first. At runtime (`src/world/playgroundLand.js`) there are 3 `InstancedMesh`:
  tree (50 tris, seasonal crowns like the street trees), green (20 tris, shared by hedge/bush/grass), and bench (48 tris, no shadow).
  A rubber-chip safety mat (60 tris) is merged into the sandbox mesh.

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
