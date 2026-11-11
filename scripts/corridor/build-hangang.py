#!/usr/bin/env python3
"""Build public/corridor/hangang/{hangang-osm,hangang-dem}.json from OSM API 0.6 + AWS terrarium.

  python3 scripts/corridor/build-hangang.py

Raw map extracts are read from /tmp/hangang-raw (downloaded separately).
Missing water-ring ways are fetched from api.openstreetmap.org.
DEM: AWS Terrain Tiles terrarium z=14.
"""
from __future__ import annotations
import json, math, os, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = Path(os.environ.get('HANGANG_RAW', '/tmp/hangang-raw'))
OUT = ROOT / 'public/corridor/hangang'
UA = 'bumpinto-world/hangang-course (https://github.com/dohoon84/bumpinto-world; ODbL research)'

CENTER = {'lat': 37.3665, 'lon': 127.10835}
KX = math.cos(math.radians(CENTER['lat'])) * 111320
KZ = 110540
DATUM = 48.0

# First-segment clip (slightly padded around 반포한강공원 + 잠수교/반포대교)
CLIP = dict(lon0=126.968, lat0=37.499, lon1=127.015, lat1=37.532)

def r1(v):
    return round(v * 10) / 10

def xz(lat, lon):
    return r1((lon - CENTER['lon']) * KX), r1(-(lat - CENTER['lat']) * KZ)

def get(url, dest=None):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    if dest:
        Path(dest).write_bytes(data)
    return data

def load_elements(path):
    return json.loads(Path(path).read_text())['elements']

def merge_raw():
    seen, els = set(), []
    for name in ('map-south.json', 'map-north.json'):
        p = RAW / name
        if not p.exists():
            raise SystemExit(f'missing {p}; fetch OSM map bboxes first')
        for e in load_elements(p):
            k = (e['type'], e['id'])
            if k in seen:
                continue
            seen.add(k)
            els.append(e)
    # extra full ways dropped next to the maps
    for p in RAW.glob('way-*.json'):
        try:
            chunk = json.loads(p.read_text()).get('elements', [])
        except Exception:
            continue
        for e in chunk:
            k = (e['type'], e['id'])
            if k in seen:
                continue
            seen.add(k)
            els.append(e)
    return els

def fetch_way_full(wid):
    dest = RAW / f'way-{wid}.json'
    if dest.exists():
        return json.loads(dest.read_text()).get('elements', [])
    print(f'  fetch way/{wid}')
    try:
        raw = get(f'https://api.openstreetmap.org/api/0.6/way/{wid}/full.json', dest)
        time.sleep(0.35)
        return json.loads(raw).get('elements', [])
    except Exception as ex:
        print(f'  FAIL way/{wid}: {ex}')
        return []

def in_clip_ll(lat, lon, pad=0.004):
    return (CLIP['lat0'] - pad <= lat <= CLIP['lat1'] + pad
            and CLIP['lon0'] - pad <= lon <= CLIP['lon1'] + pad)

def way_pts(way, nodes):
    out = []
    ll = []
    for nid in way.get('nodes') or []:
        n = nodes.get(nid)
        if not n:
            continue
        x, z = xz(n['lat'], n['lon'])
        out.append([x, z])
        ll.append([round(n['lat'], 7), round(n['lon'], 7)])
    return out, ll

def ring_bbox(pts):
    xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
    return min(xs), min(zs), max(xs), max(zs)

def polyline_len(pts):
    s = 0.0
    for i in range(1, len(pts)):
        s += math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    return s

def outline_width(pts):
    """Approximate width of a long thin closed ring (mean nearest-opposite-edge)."""
    if not pts or len(pts) < 4:
        return None
    ring = pts[:-1] if pts[0] == pts[-1] else pts
    n = len(ring)
    if n < 4:
        return None
    # sample midpoints of each edge, find distance to farthest other edge
    # better: PCA-like — length along major axis, width = area / length
    area = 0.0
    for i in range(n):
        x1, z1 = ring[i]
        x2, z2 = ring[(i + 1) % n]
        area += x1 * z2 - x2 * z1
    area = abs(area) / 2
    length = polyline_len(ring + [ring[0]]) / 2  # two long sides
    if length < 1:
        return None
    return area / length

def highway_width(tags):
    if tags.get('width'):
        try:
            return float(str(tags['width']).replace('m', '').strip())
        except ValueError:
            pass
    hw = tags.get('highway')
    lanes = tags.get('lanes')
    try:
        ln = float(lanes) if lanes else None
    except ValueError:
        ln = None
    if hw == 'cycleway':
        return 4.0 if tags.get('foot') in ('designated', 'yes') else 3.2
    if hw == 'footway':
        return 2.4
    if hw == 'path':
        return 2.2
    if hw == 'steps':
        return 2.6
    if hw == 'pedestrian':
        return 4.0
    if hw in ('trunk', 'motorway'):
        return (ln or 4) * 3.5 + 1.6
    if hw in ('primary', 'secondary'):
        return (ln or 3) * 3.4 + 1.2
    if hw in ('trunk_link', 'primary_link', 'secondary_link'):
        return (ln or 1) * 3.6 + 0.8
    if hw == 'service':
        return 4.4
    if hw == 'residential':
        return 6.0
    return 3.6

KEEP_HW = {
    'cycleway', 'footway', 'path', 'steps', 'pedestrian',
    'primary', 'primary_link', 'trunk', 'trunk_link', 'secondary',
    'service', 'unclassified', 'living_street', 'construction',
}

def keep_way(tags, name):
    if tags.get('man_made') == 'bridge':
        return True
    if tags.get('bridge') in ('yes', 'low_water_crossing', 'viaduct'):
        return True
    if tags.get('highway') in KEEP_HW:
        # skip indoor / platform clutter
        if tags.get('highway') == 'platform':
            return False
        return True
    if tags.get('leisure') in ('park', 'pitch', 'track'):
        return True
    if tags.get('landuse') == 'grass':
        return True
    if tags.get('natural') == 'water' or tags.get('waterway') or tags.get('water') == 'river':
        return True
    if name in ('반포한강공원', '서래섬', '잠수교', '반포대교', '한강남자전거길', '한강북자전거길',
                '한강', '반포천', '달빛무지개분수'):
        return True
    if '나들목' in name or '자전거길' in name:
        return True
    return False


def build_osm(els):
    nodes = {e['id']: e for e in els if e['type'] == 'node'}
    ways = [e for e in els if e['type'] == 'way']
    rels = [e for e in els if e['type'] == 'relation']

    # fetch missing 한강 water rings if we can see the relation
    water_rel = next((e for e in rels if e['id'] == 152336), None)
    extra = []
    if water_rel:
        have = {e['id'] for e in ways}
        for m in water_rel.get('members') or []:
            if m['type'] == 'way' and m['ref'] not in have:
                extra.extend(fetch_way_full(m['ref']))
    # always make sure 잠수교 members are present
    for wid in (596516315, 1091571021, 815547952, 586051611, 1085504592, 418249072, 25979109):
        if not any(e['type'] == 'way' and e['id'] == wid for e in ways + extra):
            extra.extend(fetch_way_full(wid))
    if extra:
        seen = {(e['type'], e['id']) for e in els}
        for e in extra:
            k = (e['type'], e['id'])
            if k in seen:
                continue
            seen.add(k)
            els.append(e)
        nodes = {e['id']: e for e in els if e['type'] == 'node'}
        ways = [e for e in els if e['type'] == 'way']
        rels = [e for e in els if e['type'] == 'relation']

    out_ways = []
    parks = []
    grass = []
    water_rings = []
    pitches = []

    for w in ways:
        tags = w.get('tags') or {}
        name = tags.get('name') or tags.get('name:ko') or ''
        if not keep_way(tags, name):
            continue
        pts, ll = way_pts(w, nodes)
        if len(pts) < 2:
            continue
        # drop ways whose entire geometry is far outside the clip
        if not any(in_clip_ll(lat, lon, pad=0.006) for lat, lon in ll):
            continue
        rec = {
            'id': w['id'],
            'k': tags.get('highway') or tags.get('leisure') or tags.get('man_made') or tags.get('natural') or tags.get('landuse') or tags.get('waterway') or 'way',
            'pts': pts,
        }
        if name:
            rec['name'] = name
        if tags.get('name:en'):
            rec['nameEn'] = tags['name:en']
        if tags.get('surface'):
            rec['surface'] = tags['surface']
        if tags.get('bridge'):
            rec['bridge'] = tags['bridge']
        if tags.get('layer'):
            rec['layer'] = tags['layer']
        if tags.get('tunnel'):
            rec['tunnel'] = tags['tunnel']
        if tags.get('lanes'):
            rec['lanes'] = tags['lanes']
        if tags.get('oneway'):
            rec['oneway'] = tags['oneway']
        if tags.get('bicycle'):
            rec['bicycle'] = tags['bicycle']
        if tags.get('foot'):
            rec['foot'] = tags['foot']
        if tags.get('width'):
            rec['widthTag'] = tags['width']
        rec['w'] = round(highway_width(tags), 2)

        closed = len(pts) >= 4 and math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) < 1.2

        if tags.get('leisure') == 'park' or name == '반포한강공원' or name == '서래섬':
            parks.append({'id': w['id'], 'name': name or None, 'nameEn': tags.get('name:en'),
                          'k': tags.get('leisure') or tags.get('landuse') or 'park',
                          'o': pts, 'll': ll})
            continue
        if tags.get('landuse') == 'grass':
            grass.append({'id': w['id'], 'name': name or None, 'o': pts})
            continue
        if tags.get('natural') == 'water' or tags.get('water') == 'river' or tags.get('waterway') == 'riverbank':
            if closed:
                water_rings.append({'id': w['id'], 'role': 'outer', 'name': name or None, 'o': pts})
            continue
        if tags.get('leisure') == 'pitch':
            pitches.append({'id': w['id'], 'name': name or None, 'sport': tags.get('sport'), 'o': pts})
            continue
        if tags.get('man_made') == 'bridge':
            rec['manMade'] = 'bridge'
            rec['closed'] = closed
            if closed:
                rec['widthEst'] = round(outline_width(pts) or 0, 2)
                rec['lengthEst'] = round(polyline_len(pts) / 2, 1)
        out_ways.append(rec)

    # 한강 multipolygon rings
    water_rel = next((e for e in rels if e['id'] == 152336), None)
    han_outers, han_inners = [], []
    if water_rel:
        wmap = {e['id']: e for e in ways}
        for m in water_rel.get('members') or []:
            if m['type'] != 'way':
                continue
            ww = wmap.get(m['ref'])
            if not ww:
                continue
            pts, ll = way_pts(ww, nodes)
            if len(pts) < 2:
                continue
            if not any(in_clip_ll(lat, lon, pad=0.008) for lat, lon in ll):
                continue
            rec = {'id': ww['id'], 'role': m.get('role') or 'outer', 'o': pts}
            if (m.get('role') or 'outer') == 'inner':
                han_inners.append(rec)
            else:
                han_outers.append(rec)

    def find_way(wid):
        return next((w for w in ways if w['id'] == wid), None)

    def packed(wid, extra_tags=True):
        w = find_way(wid)
        if not w:
            return None
        tags = w.get('tags') or {}
        pts, ll = way_pts(w, nodes)
        if len(pts) < 2:
            return None
        rec = {'id': wid, 'osm': f'way/{wid}', 'pts': pts, 'll': ll, 'tags': tags if extra_tags else None}
        rec['lengthM'] = round(polyline_len(pts), 1)
        if rec['tags'] is None:
            rec.pop('tags')
        closed = math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) < 1.2 and len(pts) >= 4
        if closed:
            rec['closed'] = True
            rec['widthEst'] = round(outline_width(pts) or 0, 2)
            rec['lengthEst'] = round(polyline_len(pts) / 2, 1)
        return rec

    jamsu_cl = packed(596516315)
    jamsu_out = packed(1091571021)
    jamsu_s = packed(815547952)
    jamsu_n = packed(586051611)
    banpo_out = packed(1085504592)
    park = packed(418249072)
    seorae = packed(25979109)

    # connect ends from named cycleways inside clip
    def end_points(name):
        pts = []
        for w in out_ways:
            if w.get('name') == name and w.get('pts'):
                pts.append(w['pts'][0])
                pts.append(w['pts'][-1])
        return pts

    def extremum(pts, key, rev=False):
        if not pts:
            return None
        return sorted(pts, key=key, reverse=rev)[0]

    south_bike = end_points('한강남자전거길')
    north_bike = end_points('한강북자전거길')
    jamsu_pts = (jamsu_cl or {}).get('pts') or []

    connect = {}
    if south_bike:
        east = extremum(south_bike, lambda p: p[0], rev=True)
        west = extremum(south_bike, lambda p: p[0], rev=False)
        connect['banpoEast'] = {'name': '한강남자전거길 동단 → 잠실·탄천합수부', 'x': east[0], 'z': east[1]}
        connect['banpoWest'] = {'name': '한강남자전거길 서단 → 동작대교·여의도', 'x': west[0], 'z': west[1]}
    if north_bike:
        east = extremum(north_bike, lambda p: p[0], rev=True)
        west = extremum(north_bike, lambda p: p[0], rev=False)
        connect['yongsanEast'] = {'name': '한강북자전거길 동단 → 한남·남산', 'x': east[0], 'z': east[1]}
        connect['yongsanWest'] = {'name': '한강북자전거길 서단 → 이촌·원효', 'x': west[0], 'z': west[1]}
    if len(jamsu_pts) >= 2:
        # more-northern tip = more negative z
        a, b = jamsu_pts[0], jamsu_pts[-1]
        south, north = (a, b) if a[1] > b[1] else (b, a)
        connect['jamsuSouth'] = {'name': '잠수교 남단 (반포한강공원)', 'x': south[0], 'z': south[1]}
        connect['jamsuNorth'] = {'name': '잠수교 북단 (용산·보광)', 'x': north[0], 'z': north[1]}

    # spawn: on the south bank bike path near 잠수교 south tip
    spawn = connect.get('jamsuSouth')
    if spawn:
        spawn = {'x': spawn['x'], 'z': spawn['z'], 'name': '잠수교 남단 자전거길'}

    routes = {
        'hangangJongju': {
            'osm': 'relation/8280682',
            'name': '한강 종주 자전거길 (서울 구간)',
            'nameEn': 'Hangang (riv.) Bicycle Path (Seoul Selection)',
            'network': 'ncn',
            'route': 'bicycle',
            'from': '아라한강갑문',
            'to': '팔당대교',
            'members': 168,
        },
        'hangangBike': {
            'osm': 'relation/8371341',
            'name': '한강 자전거길',
            'nameEn': 'Hangang (riv.) Bicycle Path',
            'network': 'rcn',
            'route': 'bicycle',
            'members': 226,
        },
        'tancheonBike': {
            'osm': 'relation/27411',
            'name': '탄천 자전거길',
            'nameEn': 'Tancheon Cycleway',
            'network': 'rcn',
            'route': 'bicycle',
            'members': 85,
        },
        'jamsuBridge': {
            'osm': 'relation/11173732',
            'name': '잠수교',
            'nameEn': 'Jamsugyo (Way Bridge)',
            'type': 'bridge',
            'distance': '795 m',
            'startDate': '1976-07-15',
            'members': [
                {'id': 815547952, 'role': 'across'},
                {'id': 596516315, 'role': 'across'},
                {'id': 586051611, 'role': 'across'},
                {'id': 1091571021, 'role': 'across'},
            ],
        },
    }

    source = (
        'OSM API 0.6 map bbox 126.978,37.502,127.008,37.514 (반포한강공원) + '
        'OSM API 0.6 map bbox 126.992,37.510,127.002,37.525 (잠수교·반포대교) + '
        'way/596516315 잠수교 + way/1091571021 잠수교 outline + way/1085504592 반포대교 outline + '
        'way/418249072 반포한강공원 + way/25979109 서래섬 + relation/152336 한강 water + '
        'relation/11173732 잠수교 + relation/8280682 한강 종주 자전거길 (서울 구간) + '
        'relation/8371341 한강 자전거길 + relation/27411 탄천 자전거길'
    )

    data = {
        'meta': {
            'center': CENTER,
            'kx': KX,
            'kz': KZ,
            'datum': DATUM,
            'attribution': '© OpenStreetMap contributors (ODbL)',
            'source': source,
            'clip': CLIP,
            'segment': 'banpo-jamsu',
        },
        'jamsu': {
            'osm': 'relation/11173732',
            'name': '잠수교',
            'nameEn': 'Jamsugyo',
            'wikidata': 'Q704504',
            'distanceTag': '795 m',
            'startDate': '1976-07-15',
            'layer': '1',
            'bridge': 'low_water_crossing',
            'centerline': jamsu_cl,
            'outline': jamsu_out,
            'southStub': jamsu_s,
            'northApproach': jamsu_n,
        },
        'banpo': {
            'osm': 'way/1085504592',
            'name': '반포대교',
            'nameEn': 'Banpo Bridge',
            'wikidata': 'Q255506',
            'layer': '2',
            'heightTag': '3',
            'material': 'reinforced_concrete',
            'structure': 'beam',
            'outline': banpo_out,
        },
        'park': {
            'osm': 'way/418249072',
            'name': '반포한강공원',
            'nameEn': 'Banpo Hangang Park',
            'wikidata': 'Q12597453',
            'operator': '서울특별시 한강사업본부',
            'ring': park,
        },
        'seorae': {
            'osm': 'way/25979109',
            'name': '서래섬',
            'ring': seorae,
        },
        'water': {
            'osm': 'relation/152336',
            'name': '한강',
            'nameEn': 'Han River',
            'wikidata': 'Q55500',
            'outers': han_outers,
            'inners': han_inners,
        },
        'parks': parks,
        'grass': grass,
        'pitches': pitches,
        'ways': out_ways,
        'connectEnds': connect,
        'spawn': spawn,
        'routes': routes,
    }
    return data


def tile_xy(lon, lat, z):
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    lat_r = math.radians(lat)
    y = (1.0 - math.log(math.tan(lat_r) + 1.0 / math.cos(lat_r)) / math.pi) / 2.0 * n
    return x, y

def terrarium_height(px):
    r, g, b = px[0], px[1], px[2]
    return (r * 256 + g + b / 256) - 32768

def fetch_dem():
    z = 14
    # grid in game xz, 25 m like namsan
    x0, z1 = xz(CLIP['lat0'], CLIP['lon0'])  # south-west: larger z (south), smaller x (west)
    x1, z0 = xz(CLIP['lat1'], CLIP['lon1'])  # north-east
    # z0 should be more negative (north)
    gx0 = math.floor(min(x0, x1) / 25) * 25
    gx1 = math.ceil(max(x0, x1) / 25) * 25
    gz0 = math.floor(min(z0, z1) / 25) * 25
    gz1 = math.ceil(max(z0, z1) / 25) * 25
    dx = dz = 25.0
    nx = int(round((gx1 - gx0) / dx)) + 1
    nz = int(round((gz1 - gz0) / dz)) + 1
    print(f'DEM grid {nx}x{nz} x={gx0}..{gx1} z={gz0}..{gz1}')

    from PIL import Image
    # determine tile range
    lons = [CLIP['lon0'], CLIP['lon1']]
    lats = [CLIP['lat0'], CLIP['lat1']]
    txs, tys = [], []
    for lo in lons:
        for la in lats:
            tx, ty = tile_xy(lo, la, z)
            txs.append(tx); tys.append(ty)
    tx0, tx1 = int(math.floor(min(txs))), int(math.floor(max(txs)))
    ty0, ty1 = int(math.floor(min(tys))), int(math.floor(max(tys)))
    tiles = {}
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{tx}/{ty}.png'
            dest = RAW / f'terrarium-{z}-{tx}-{ty}.png'
            if not dest.exists():
                print(f'  fetch {url}')
                try:
                    get(url, dest)
                except Exception as ex:
                    print(f'  FAIL {url}: {ex}')
                    continue
            tiles[(tx, ty)] = Image.open(dest).convert('RGB')

    def ele_at(lon, lat):
        tx, ty = tile_xy(lon, lat, z)
        ix, iy = int(math.floor(tx)), int(math.floor(ty))
        im = tiles.get((ix, iy))
        if im is None:
            return None
        w, h = im.size
        fx, fy = tx - ix, ty - iy
        px = min(w - 1, max(0, fx * w))
        py = min(h - 1, max(0, fy * h))
        i0, j0 = int(math.floor(px)), int(math.floor(py))
        i1, j1 = min(w - 1, i0 + 1), min(h - 1, j0 + 1)
        su, sv = px - i0, py - j0
        def hpix(i, j):
            return terrarium_height(im.getpixel((i, j)))
        return (hpix(i0, j0) * (1 - su) * (1 - sv)
                + hpix(i1, j0) * su * (1 - sv)
                + hpix(i0, j1) * (1 - su) * sv
                + hpix(i1, j1) * su * sv)

    heights = []
    for j in range(nz):
        for i in range(nx):
            x = gx0 + i * dx
            zz = gz0 + j * dz
            lon = CENTER['lon'] + x / KX
            lat = CENTER['lat'] - zz / KZ
            e = ele_at(lon, lat)
            heights.append(None if e is None else round(e, 1))
    missing = sum(1 for h in heights if h is None)
    if missing:
        # fill from nearest
        print(f'  fill {missing} missing DEM samples')
        known = [(i, h) for i, h in enumerate(heights) if h is not None]
        if not known:
            raise SystemExit('DEM fetch failed: no samples')
        for i, h in enumerate(heights):
            if h is not None:
                continue
            # cheap: previous or first known
            heights[i] = heights[i - 1] if i and heights[i - 1] is not None else known[0][1]
    finite = [h for h in heights if h is not None]
    # terrarium voids / bad pixels near tile edges (a handful of <-50 m here)
    med = sorted(finite)[len(finite)//2]
    for i, v in enumerate(heights):
        if v is None or v < -5 or v > 120:
            heights[i] = None
    for i, v in enumerate(heights):
        if v is not None:
            continue
        # nearest valid in row, else median
        j0 = i - i % nx
        row = [heights[j] for j in range(j0, j0 + nx) if heights[j] is not None]
        heights[i] = row[len(row)//2] if row else med
    finite = [h for h in heights if h is not None]
    dem = {
        'source': 'AWS Terrain Tiles terrarium z=14 (SRTM and other public DEMs, https://registry.opendata.aws/terrain-tiles/)',
        'attribution': 'Mapzen / AWS Terrain Tiles (public). Heights are metres above sea level (terrarium encoding).',
        'note': 'Game y = eleASL - datum. datum=48 matches namsan / Jeongja convention.',
        'x0': gx0, 'z0': gz0, 'dx': dx, 'dz': dz, 'nx': nx, 'nz': nz,
        'datum': DATUM,
        'eleMin': min(finite), 'eleMax': max(finite),
        'h': heights,
    }
    return dem


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print('merge OSM…')
    els = merge_raw()
    print(f'  {len(els)} elements')
    print('build osm json…')
    osm = build_osm(els)
    print(f"  ways {len(osm['ways'])} parks {len(osm['parks'])} grass {len(osm['grass'])} "
          f"water outer {len(osm['water']['outers'])} inner {len(osm['water']['inners'])}")
    j = osm['jamsu']
    print('  잠수교 outline widthEst', (j.get('outline') or {}).get('widthEst'),
          'lengthEst', (j.get('outline') or {}).get('lengthEst'),
          'centerline m', (j.get('centerline') or {}).get('lengthM'))
    b = osm['banpo']
    print('  반포대교 outline widthEst', (b.get('outline') or {}).get('widthEst'),
          'lengthEst', (b.get('outline') or {}).get('lengthEst'))
    print('  connect', osm.get('connectEnds'))
    osm_path = OUT / 'hangang-osm.json'
    osm_path.write_text(json.dumps(osm, ensure_ascii=False, separators=(',', ':')))
    print(f'  wrote {osm_path} ({osm_path.stat().st_size} bytes)')

    print('fetch DEM…')
    dem = fetch_dem()
    print(f"  ele {dem['eleMin']} .. {dem['eleMax']}  grid {dem['nx']}x{dem['nz']}")
    dem_path = OUT / 'hangang-dem.json'
    dem_path.write_text(json.dumps(dem, ensure_ascii=False, separators=(',', ':')))
    print(f'  wrote {dem_path} ({dem_path.stat().st_size} bytes)')

if __name__ == '__main__':
    main()
