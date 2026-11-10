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

## Pangyo Station area (expansion stage 1, off with `?pangyo=0`)

- Data: `data/query_pangyo.overpassql` → `data/osm_pangyo_raw.json` (OSM, ODbL). `npm run corridor:pangyo` (`--fetch` re-queries Overpass)
  writes `public/corridor/pangyo/{index.json, tiles/K.json, lod/K.json}`.
- Box x -250..1000, z -3500..-2500 (tiles -1..1 × -7..-6). Cells the corridor already had (0_-6, 1_-6, 1_-7) are `mode:add`: only
  buildings/roads/parks not already in the corridor tile, appended **after** the original arrays at runtime (original indices and
  streams cuts unchanged). Other cells are full `mode:new` tiles.
- Heights: OSM height → building:levels×3.2+1.5 → per-kind default (bake.mjs rules). Defaulted buildings: `meta.defaultHeights`.
- Landmarks (custom models, `src/corridor/landmarks/pangyo.js`): department store (generic '백화점' label, no brand), the four
  Alphadom City towers, the station plaza deck, four subway entrances (OSM subway_entrance, 신분당선/경강선 bands). Built and
  disposed with their detail tile; LOD prisms far away.
- Pangyo station is used for labels, the station sign and travel (`?at=pangyo`) only; it is not added to `index.stations`
  (bus/car NPCs unchanged).
- `build-corridor.mjs` keeps `public/corridor/pangyo/`. After rebuilding the corridor rerun `npm run corridor:pangyo`
  (dedupe uses corridor tiles; `test-pangyo.mjs` checks committed data equals the script output).

## Gangnam Station area (island, off with `?gangnam=0`)

- Data: `data/query_gangnam.overpassql` → `data/osm_gangnam_raw.json` (OSM, ODbL; this bake used the OSM API `/map` fallback). `npm run corridor:gangnam` writes `public/corridor/gangnam/{index.json, tiles, lod}`.
- Box x −7500..−6000, z −15500..−14000 (tiles −15..−13 × −31..−29), all `mode:new`. Not joined to the corridor on foot: `meta.islands` is the main rectangle plus this box. `?at=gangnam` jumps there. Ride 신분당선 from 정자/미금 or 2호선 from 잠실 (`?gangnamsub=0` turns the station off only).
- Heights: OSM `height` → VWorld `dt_d010` `hg` → `ground_floor_co`×3.2 → `building:levels`×3.2 → kind default. The raw 9-tile cache is not committed (same as other VWorld caches). `data/gangnam_vworld_heights.json` is the derived OSM-id table (`scripts/corridor/gangnam-vworld-heights.mjs --vworld=`). Credit: 건물 높이: 국토교통부 브이월드 GIS건물통합정보 (공공누리 제1유형: 출처표시), https://www.data.go.kr/data/15083092/fileData.do. See `docs/gangnam-heights.md`. Signs are plain OSM names (ko, and `name:en` when the tag exists). No logos.
- On a phone, detail/LOD drop to `QUALITY.low` only while the camera is inside the Gangnam box.
