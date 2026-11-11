#!/usr/bin/env python3
"""Build public/corridor/hangang/{hap-osm,hap-dem}.json — 탄천 하류 → 합수부 → 한강남 → 반포.

  python3 scripts/corridor/build-hangang-hap.py

OSM API 0.6 map bboxes + relation members + AWS terrarium DEM z=14.
Assembles 한강 relation/152336 and 탄천 riverbank relation/9035438 the same
way as build-hangang.py (join member ways, then clip) so shoreline chords
do not fill land with water.
"""
from __future__ import annotations
import json, math, os, sys, time, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = Path(os.environ.get('HAP_RAW', '/tmp/hangang-hap-raw'))
OUT = ROOT / 'public/corridor/hangang'
UA = 'bumpinto-world/hangang-course (https://github.com/dohoon84/bumpinto-world; ODbL research)'

CENTER = {'lat': 37.3665, 'lon': 127.10835}
KX = math.cos(math.radians(CENTER['lat'])) * 111320
KZ = 110540
DATUM = 48.0

# West edge just past banpoEast (127.0075) without swallowing 잠수교 (126.998).
# East covers 탄천 bike at ~127.109. South covers existing 탄천 자전거도로 end
# (~37.489). North covers 합수부 (~37.528) plus a little of the north bank.
CLIP = dict(lon0=127.006, lat0=37.486, lon1=127.115, lat1=37.534)

# Existing drawn 탄천 자전거도로 northern tip (channel overlay) and 반포 join.
TANCHEON_END = (32.2, -13552.0)
BANPO_EAST = (-8923.9, -16698.7)
CORRIDOR_X0 = -2500.0
HANGANG_X1 = -8250.0
PATH_WEST_CLIP = -8910.0   # do not redraw 한강남자전거길 already in 1구간
VISUAL_XMIN = -8240.0      # do not draw a second DEM/water plate over 1구간
TANCHEON_WATER_Y = -6.6    # public/terrain.json params.WATER

BBOXES = [
    # 탄천 south (수서·대치) — existing bike end
    (127.070, 37.486, 127.115, 37.508),
    # 탄천 mid
    (127.045, 37.500, 127.095, 37.518),
    # 탄천 합수부 / 잠실한강공원
    (127.055, 37.514, 127.110, 37.534),
    # 청담·영동
    (127.035, 37.512, 127.070, 37.534),
    # 성수·동호
    (127.018, 37.510, 127.045, 37.534),
    # 한남·잠원 → 반포 east
    (127.006, 37.508, 127.028, 37.532),
]

BRIDGE_NAMES = (
    '잠실대교', '잠실철교', '청담대교', '영동대교', '성수대교',
    '동호대교', '한남대교', '올림픽대교', '탄천교',
)
PARK_KEEP = (
    '잠원한강공원', '잠실한강공원', '탄천', '한강공원', '생태공원',
    '서울숲', '압구정', '청담', '신사', '한남',
)

def r1(v):
    return round(v * 10) / 10

def xz(lat, lon):
    return r1((lon - CENTER['lon']) * KX), r1(-(lat - CENTER['lat']) * KZ)

def get(url, dest=None):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = r.read()
    if dest:
        Path(dest).write_bytes(data)
    return data

def near_pt(a, b, eps=1.5):
    return math.hypot(a[0] - b[0], a[1] - b[1]) < eps

def in_clip_ll(lat, lon, pad=0.004):
    return (CLIP['lat0'] - pad <= lat <= CLIP['lat1'] + pad
            and CLIP['lon0'] - pad <= lon <= CLIP['lon1'] + pad)

def assemble_rings(segments):
    used = [False] * len(segments)
    rings = []
    for i, seg in enumerate(segments):
        if used[i]:
            continue
        chain = list(seg['o'])
        ids = [seg['id']]
        role = seg.get('role') or 'outer'
        used[i] = True
        grew = True
        while grew:
            grew = False
            head, tail = chain[0], chain[-1]
            for j, other in enumerate(segments):
                if used[j]:
                    continue
                pts = other['o']
                if near_pt(tail, pts[0]):
                    chain.extend(pts[1:]); ids.append(other['id']); used[j] = True; grew = True; break
                if near_pt(tail, pts[-1]):
                    chain.extend(list(reversed(pts))[1:]); ids.append(other['id']); used[j] = True; grew = True; break
                if near_pt(head, pts[-1]):
                    chain = pts[:-1] + chain; ids.insert(0, other['id']); used[j] = True; grew = True; break
                if near_pt(head, pts[0]):
                    chain = list(reversed(pts))[:-1] + chain; ids.insert(0, other['id']); used[j] = True; grew = True; break
        rec = {'id': ids[0], 'role': role, 'o': [[round(pt[0], 1), round(pt[1], 1)] for pt in chain]}
        if len(ids) > 1:
            rec['ids'] = ids
        rings.append(rec)
    return rings

def clip_ring_to_box(poly, xmin, xmax, zmin, zmax):
    pts = [list(p) for p in poly]
    if len(pts) >= 2 and near_pt(pts[0], pts[-1], 1e-6):
        pts = pts[:-1]
    def clip_edge(poly, inside, intersect):
        if not poly:
            return []
        out = []
        prev = poly[-1]
        for cur in poly:
            if inside(cur):
                if not inside(prev):
                    out.append(intersect(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(intersect(prev, cur))
            prev = cur
        return out
    def lerp(a, b, t):
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    pts = clip_edge(pts, lambda p: p[0] >= xmin, lambda a, b: lerp(a, b, (xmin - a[0]) / ((b[0] - a[0]) or 1e-12)))
    pts = clip_edge(pts, lambda p: p[0] <= xmax, lambda a, b: lerp(a, b, (xmax - a[0]) / ((b[0] - a[0]) or 1e-12)))
    pts = clip_edge(pts, lambda p: p[1] >= zmin, lambda a, b: lerp(a, b, (zmin - a[1]) / ((b[1] - a[1]) or 1e-12)))
    pts = clip_edge(pts, lambda p: p[1] <= zmax, lambda a, b: lerp(a, b, (zmax - a[1]) / ((b[1] - a[1]) or 1e-12)))
    if pts and not near_pt(pts[0], pts[-1], 0.05):
        pts.append(pts[0][:])
    return [[round(p[0], 1), round(p[1], 1)] for p in pts]

def point_in_ring(x, z, ring):
    if not ring or len(ring) < 3:
        return False
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, zi = ring[i]; xj, zj = ring[j]
        if ((zi > z) != (zj > z)) and (x < (xj - xi) * (z - zi) / ((zj - zi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside

def way_pts(way, nodes):
    out, ll = [], []
    for nid in way.get('nodes') or []:
        n = nodes.get(nid)
        if not n:
            continue
        x, z = xz(n['lat'], n['lon'])
        out.append([x, z])
        ll.append([round(n['lat'], 7), round(n['lon'], 7)])
    return out, ll

def polyline_len(pts):
    s = 0.0
    for i in range(1, len(pts)):
        s += math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    return s

def outline_width(pts):
    if not pts or len(pts) < 4:
        return None
    ring = pts[:-1] if pts[0] == pts[-1] else pts
    n = len(ring)
    if n < 4:
        return None
    area = 0.0
    for i in range(n):
        x1, z1 = ring[i]
        x2, z2 = ring[(i + 1) % n]
        area += x1 * z2 - x2 * z1
    area = abs(area) / 2
    length = polyline_len(ring + [ring[0]]) / 2
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
    try:
        ln = float(tags['lanes']) if tags.get('lanes') else None
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
    return 3.6

def fetch_way_full(wid):
    dest = RAW / f'way-{wid}.json'
    if dest.exists():
        return json.loads(dest.read_text()).get('elements', [])
    print(f'  fetch way/{wid}')
    try:
        raw = get(f'https://api.openstreetmap.org/api/0.6/way/{wid}/full.json', dest)
        time.sleep(0.3)
        return json.loads(raw).get('elements', [])
    except Exception as ex:
        print(f'  FAIL way/{wid}: {ex}')
        return []

def fetch_rel(rid, full=False):
    suffix = '/full.json' if full else '.json'
    dest = RAW / f'rel-{rid}{"-full" if full else ""}.json'
    if dest.exists():
        return json.loads(dest.read_text()).get('elements', [])
    # reuse 1구간 cache for 152336
    alt = Path('/tmp/rel152336-full.json') if rid == 152336 and full else None
    if alt and alt.exists():
        print(f'  reuse {alt} for relation/{rid}')
        data = json.loads(alt.read_text())
        dest.write_text(json.dumps(data, ensure_ascii=False))
        return data.get('elements', [])
    print(f'  fetch relation/{rid}{suffix}')
    try:
        raw = get(f'https://api.openstreetmap.org/api/0.6/relation/{rid}{suffix}', dest)
        time.sleep(0.35)
        return json.loads(raw).get('elements', [])
    except Exception as ex:
        print(f'  FAIL relation/{rid}: {ex}')
        return []

def fetch_map(w, s, e, n, tag, depth=0):
    dest = RAW / f'map-{tag}.json'
    if dest.exists() and dest.stat().st_size > 20:
        return json.loads(dest.read_text()).get('elements', [])
    url = f'https://api.openstreetmap.org/api/0.6/map.json?bbox={w},{s},{e},{n}'
    print(f'  fetch map {tag} bbox={w},{s},{e},{n} (depth {depth})')
    try:
        raw = get(url, dest)
        time.sleep(0.45)
        return json.loads(raw).get('elements', [])
    except urllib.error.HTTPError as ex:
        if dest.exists():
            dest.unlink()
        if ex.code in (400, 509, 429) and depth < 3:
            print(f'  split {tag} after HTTP {ex.code}')
            time.sleep(1.2)
            mid_lon = (w + e) / 2
            mid_lat = (s + n) / 2
            els = []
            seen = set()
            parts = [
                (w, s, mid_lon, mid_lat, f'{tag}a'),
                (mid_lon, s, e, mid_lat, f'{tag}b'),
                (w, mid_lat, mid_lon, n, f'{tag}c'),
                (mid_lon, mid_lat, e, n, f'{tag}d'),
            ]
            for box in parts:
                for el in fetch_map(*box, depth=depth + 1):
                    k = (el['type'], el['id'])
                    if k in seen:
                        continue
                    seen.add(k)
                    els.append(el)
            return els
        print(f'  FAIL map {tag}: {ex}')
        return []
    except Exception as ex:
        print(f'  FAIL map {tag}: {ex}')
        if dest.exists():
            dest.unlink()
        return []

def merge_elements(chunks):
    seen, els = set(), []
    for chunk in chunks:
        for e in chunk:
            k = (e['type'], e['id'])
            if k in seen:
                continue
            seen.add(k)
            els.append(e)
    return els

def keep_way(tags, name):
    hw = tags.get('highway')
    if tags.get('man_made') == 'bridge':
        return True
    if any(bn in name for bn in BRIDGE_NAMES):
        return True
    if hw == 'cycleway':
        return True
    if '자전거' in name or '나들목' in name or '탄천' in name:
        return True
    if name in ('올림픽대로', '강변북로', '송파둘레길'):
        return True
    if name == '탄천동로':
        return False
    if name == '탄천' and tags.get('highway') is None:
        return False
    if tags.get('bridge') in ('yes', 'viaduct', 'low_water_crossing') and hw in (
            'primary', 'secondary', 'trunk', 'motorway', 'tertiary'):
        return True
    if hw in ('footway', 'path', 'steps', 'pedestrian'):
        if tags.get('bicycle') in ('designated', 'yes'):
            return True
        if '나들목' in name or '자전거' in name:
            return True
        return True  # filtered later to those near a bike path or park
    if tags.get('leisure') == 'park':
        return True
    if tags.get('natural') == 'water' or tags.get('waterway') or tags.get('water') == 'river':
        return True
    if tags.get('landuse') == 'grass' and any(k in name for k in PARK_KEEP):
        return True
    if tags.get('building') and name:
        return False
    return False

def dist_to_pts(x, z, samples):
    best = 1e18
    for p in samples:
        d = math.hypot(x - p[0], z - p[1])
        if d < best:
            best = d
    return best

def stitch_spine(ways, start, end, max_jump=35.0):
    """Greedy walk along ways from start to end. Returns resampled polyline."""
    unused = []
    for w in ways:
        pts = w.get('pts') or []
        if len(pts) < 2:
            continue
        unused.append({'id': w.get('id'), 'pts': pts, 'name': w.get('name') or ''})
    if not unused:
        return []

    def nearest_end(pt, pool):
        best = None
        best_d = 1e18
        best_rev = False
        for i, w in enumerate(pool):
            d0 = math.hypot(pt[0] - w['pts'][0][0], pt[1] - w['pts'][0][1])
            d1 = math.hypot(pt[0] - w['pts'][-1][0], pt[1] - w['pts'][-1][1])
            if d0 < best_d:
                best, best_d, best_rev = i, d0, False
            if d1 < best_d:
                best, best_d, best_rev = i, d1, True
        return best, best_d, best_rev

    # start at the way-end closest to `start`
    idx, d, rev = nearest_end(start, unused)
    if idx is None or d > 80:
        # try nearest vertex, not just ends
        best_i, best_d, best_k = None, 1e18, 0
        for i, w in enumerate(unused):
            for k, p in enumerate(w['pts']):
                dd = math.hypot(start[0] - p[0], start[1] - p[1])
                if dd < best_d:
                    best_i, best_d, best_k = i, dd, k
        if best_i is None:
            return []
        w = unused.pop(best_i)
        chain = w['pts'][best_k:]
        if len(chain) < 2:
            chain = list(reversed(w['pts'][:best_k + 1]))
    else:
        w = unused.pop(idx)
        chain = list(reversed(w['pts'])) if rev else list(w['pts'])

    guard = 0
    while unused and guard < 400:
        guard += 1
        tip = chain[-1]
        # if we are already close to the end, stop when extending would go away
        d_end = math.hypot(tip[0] - end[0], tip[1] - end[1])
        idx, d, rev = nearest_end(tip, unused)
        if idx is None:
            break
        if d > max_jump:
            break
        nxt = unused.pop(idx)
        add = list(reversed(nxt['pts'])) if rev else list(nxt['pts'])
        # skip duplicate first point
        if near_pt(add[0], tip, 2.0):
            add = add[1:]
        if not add:
            continue
        new_tip = add[-1]
        new_d_end = math.hypot(new_tip[0] - end[0], new_tip[1] - end[1])
        # prefer getting closer to the destination once we're in the west half
        chain.extend(add)
        if new_d_end < 8:
            break
    # append exact end if close
    if chain and math.hypot(chain[-1][0] - end[0], chain[-1][1] - end[1]) < 40:
        if not near_pt(chain[-1], end, 0.6):
            chain.append([end[0], end[1]])
    # prepend exact start if close
    if chain and math.hypot(chain[0][0] - start[0], chain[0][1] - start[1]) < 40:
        if not near_pt(chain[0], start, 0.6):
            chain.insert(0, [start[0], start[1]])
    return [[round(p[0], 1), round(p[1], 1)] for p in chain]


def clip_and_assemble_rel(rid, name, els, ways, nodes, xmin, xmax, zmin, zmax):
    rel = next((e for e in els if e['type'] == 'relation' and e['id'] == rid), None)
    if not rel:
        extra = fetch_rel(rid, full=False)
        for e in extra:
            if e['type'] == 'relation' and e['id'] == rid:
                rel = e
                break
        els.extend(extra)
    if not rel:
        print(f'  WARN missing relation/{rid} ({name})')
        return [], []
    have = {e['id'] for e in ways}
    extra = []
    for m in rel.get('members') or []:
        if m['type'] == 'way' and m['ref'] not in have:
            extra.extend(fetch_way_full(m['ref']))
    if extra:
        seen = {(e['type'], e['id']) for e in els}
        for e in extra:
            k = (e['type'], e['id'])
            if k in seen:
                continue
            seen.add(k)
            els.append(e)
        nodes.update({e['id']: e for e in extra if e['type'] == 'node'})
        ways.extend([e for e in extra if e['type'] == 'way'])
    wmap = {e['id']: e for e in ways}
    raw_outer, raw_inner = [], []
    for m in rel.get('members') or []:
        if m['type'] != 'way':
            continue
        ww = wmap.get(m['ref'])
        if not ww:
            continue
        pts, _ll = way_pts(ww, nodes)
        if len(pts) < 2:
            continue
        rec = {'id': ww['id'], 'role': m.get('role') or 'outer', 'o': pts}
        if (m.get('role') or 'outer') == 'inner':
            raw_inner.append(rec)
        else:
            raw_outer.append(rec)
    assembled_outer = assemble_rings(raw_outer)
    assembled_inner = assemble_rings(raw_inner)
    outers, inners = [], []
    for rec in assembled_outer:
        clipped = clip_ring_to_box(rec['o'], xmin, xmax, zmin, zmax)
        if len(clipped) < 4:
            continue
        rec = dict(rec)
        rec['o'] = clipped
        outers.append(rec)
    for rec in assembled_inner:
        pts = rec['o']
        cx = sum(p[0] for p in pts) / len(pts)
        cz = sum(p[1] for p in pts) / len(pts)
        if not any(point_in_ring(cx, cz, o['o']) for o in outers):
            continue
        inners.append(rec)
    print(f'  {name} relation/{rid}: assembled outer {len(assembled_outer)} -> clipped {len(outers)}, inner {len(inners)}')
    return outers, inners


def build_osm(els):
    nodes = {e['id']: e for e in els if e['type'] == 'node'}
    ways = [e for e in els if e['type'] == 'way']

    # ensure water relations are present
    for rid in (152336, 9035438, 27411):
        if not any(e['type'] == 'relation' and e['id'] == rid for e in els):
            extra = fetch_rel(rid, full=(rid == 152336))
            seen = {(e['type'], e['id']) for e in els}
            for e in extra:
                k = (e['type'], e['id'])
                if k in seen:
                    continue
                seen.add(k)
                els.append(e)
    nodes = {e['id']: e for e in els if e['type'] == 'node'}
    ways = [e for e in els if e['type'] == 'way']

    cx0, cz_s = xz(CLIP['lat0'], CLIP['lon0'])
    cx1, cz_n = xz(CLIP['lat1'], CLIP['lon1'])
    pad = 200.0
    xmin, xmax = min(cx0, cx1) - pad, max(cx0, cx1) + pad
    zmin, zmax = min(cz_s, cz_n) - pad, max(cz_s, cz_n) + pad
    # visual water clip: do not overlap 1구간 river plate
    water_xmin = max(xmin, VISUAL_XMIN)

    han_outers, han_inners = clip_and_assemble_rel(
        152336, '한강', els, ways, nodes, water_xmin, xmax, zmin, zmax)
    nodes = {e['id']: e for e in els if e['type'] == 'node'}
    ways = [e for e in els if e['type'] == 'way']
    tan_outers, tan_inners = clip_and_assemble_rel(
        9035438, '탄천', els, ways, nodes, xmin, xmax, zmin, zmax)
    nodes = {e['id']: e for e in els if e['type'] == 'node'}
    ways = [e for e in els if e['type'] == 'way']

    # merge 탄천 water into the same water collection (separate outers)
    water_outers = han_outers + tan_outers
    water_inners = han_inners + tan_inners

    out_ways, parks, grass, buildings, bridges = [], [], [], [], []
    trees, benches = [], []

    for w in ways:
        tags = w.get('tags') or {}
        name = tags.get('name') or tags.get('name:ko') or ''
        if tags.get('natural') == 'tree':
            continue
        if not keep_way(tags, name):
            continue
        pts, ll = way_pts(w, nodes)
        if len(pts) < 2:
            continue
        if not any(in_clip_ll(lat, lon, pad=0.006) for lat, lon in ll):
            continue
        rec = {
            'id': w['id'],
            'k': tags.get('highway') or tags.get('leisure') or tags.get('man_made')
                 or tags.get('natural') or tags.get('landuse') or tags.get('waterway') or 'way',
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
        if tags.get('bicycle'):
            rec['bicycle'] = tags['bicycle']
        if tags.get('foot'):
            rec['foot'] = tags['foot']
        if tags.get('width'):
            rec['widthTag'] = tags['width']
        if tags.get('height'):
            rec['heightTag'] = tags['height']
        rec['w'] = round(highway_width(tags), 2)
        closed = len(pts) >= 4 and math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) < 1.2

        if tags.get('leisure') == 'park':
            parks.append({'id': w['id'], 'name': name or None, 'nameEn': tags.get('name:en'),
                          'k': 'park', 'o': pts})
            continue
        if tags.get('landuse') == 'grass':
            grass.append({'id': w['id'], 'name': name or None, 'o': pts})
            continue
        if tags.get('natural') == 'water' or tags.get('water') == 'river' or tags.get('waterway') == 'riverbank':
            continue
        if tags.get('man_made') == 'bridge' or any(bn == name or name.endswith(bn) or bn in name for bn in BRIDGE_NAMES):
            rec['manMade'] = tags.get('man_made')
            rec['closed'] = closed
            if closed:
                rec['widthEst'] = round(outline_width(pts) or 0, 2)
                rec['lengthEst'] = round(polyline_len(pts) / 2, 1)
            if name in BRIDGE_NAMES or any(name.endswith(bn) or name == bn for bn in BRIDGE_NAMES):
                bridges.append({
                    'id': w['id'], 'name': name, 'nameEn': tags.get('name:en'),
                    'pts': pts, 'closed': closed,
                    'layer': tags.get('layer'), 'bridge': tags.get('bridge'),
                    'heightTag': tags.get('height'),
                    'w': rec['w'],
                    'widthEst': rec.get('widthEst'),
                    'lengthEst': rec.get('lengthEst'),
                    'k': rec['k'],
                })
        out_ways.append(rec)

    # buildings near bike paths only
    bike_samples = []
    for w in out_ways:
        n = w.get('name') or ''
        if w.get('k') != 'cycleway' and '자전거' not in n and '나들목' not in n:
            continue
        pts = w['pts']
        acc = 0.0
        bike_samples.append(pts[0])
        for i in range(1, len(pts)):
            acc += math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
            if acc >= 36:
                bike_samples.append(pts[i])
                acc = 0.0
        bike_samples.append(pts[-1])

    for nd in els:
        if nd.get('type') != 'node':
            continue
        tags = nd.get('tags') or {}
        if tags.get('natural') == 'tree':
            x, z = xz(nd['lat'], nd['lon'])
            if dist_to_pts(x, z, bike_samples) < 90:
                trees.append({'id': nd['id'], 'x': x, 'z': z})
        if tags.get('amenity') in ('bench', 'waste_basket'):
            x, z = xz(nd['lat'], nd['lon'])
            if dist_to_pts(x, z, bike_samples) < 80:
                benches.append({'id': nd['id'], 'x': x, 'z': z, 'k': tags.get('amenity')})

    for w in ways:
        tags = w.get('tags') or {}
        if not tags.get('building'):
            continue
        pts, ll = way_pts(w, nodes)
        if len(pts) < 4:
            continue
        if not any(in_clip_ll(lat, lon, pad=0.002) for lat, lon in ll):
            continue
        cx = sum(p[0] for p in pts) / len(pts)
        cz = sum(p[1] for p in pts) / len(pts)
        if dist_to_pts(cx, cz, bike_samples) > 60:
            continue
        h = None
        if tags.get('height'):
            try:
                h = float(str(tags['height']).split(';')[0].replace('m', '').strip())
            except ValueError:
                h = None
        if h is None and tags.get('building:levels'):
            try:
                h = float(str(tags['building:levels']).split(';')[0]) * 3.2
            except ValueError:
                h = None
        buildings.append({
            'id': w['id'], 'o': pts, 'h': round(h or 12, 1),
            'k': tags.get('building') if tags.get('building') != 'yes' else 'yes',
            'name': tags.get('name'),
        })
        if len(buildings) >= 380:
            break

    # drop long leftover footways far from bike path / parks
    park_samples = []
    for p in parks:
        o = p.get('o') or []
        if not o:
            continue
        park_samples.append(o[0])
        for i in range(0, len(o), max(1, len(o) // 8)):
            park_samples.append(o[i])
    kept_ways = []
    for w in out_ways:
        n = w.get('name') or ''
        k = w.get('k')
        if k in ('cycleway',) or '자전거' in n or '나들목' in n or n in ('올림픽대로', '강변북로'):
            kept_ways.append(w)
            continue
        if k == 'bridge' or n in BRIDGE_NAMES or any(bn in n for bn in BRIDGE_NAMES):
            kept_ways.append(w)
            continue
        if k in ('footway', 'path', 'steps', 'pedestrian', 'service'):
            p0, p1 = w['pts'][0], w['pts'][-1]
            if (dist_to_pts(p0[0], p0[1], bike_samples) < 70
                    or dist_to_pts(p1[0], p1[1], bike_samples) < 70
                    or (park_samples and (dist_to_pts(p0[0], p0[1], park_samples) < 80
                                          or dist_to_pts(p1[0], p1[1], park_samples) < 80))):
                kept_ways.append(w)
            continue
        if w.get('bridge') or w.get('layer'):
            if (w.get('name') or '') in ('올림픽대로', '강변북로') or any(
                    bn in (w.get('name') or '') for bn in BRIDGE_NAMES):
                kept_ways.append(w)
            continue
        # do not keep leftover named streets (분당수서로 등)
    out_ways = kept_ways

    # spine: 탄천 bike then 한강남 bike
    tan_ways = [w for w in out_ways if (
        w.get('k') == 'cycleway' or '자전거' in (w.get('name') or '') or '탄천' in (w.get('name') or '')
    ) and (
        '한강남' not in (w.get('name') or '') and (w.get('name') or '') != '한강남자전거길'
        and (w.get('name') or '') != '한강 자전거길' and (w.get('name') or '') != '한강북자전거길'
    )]
    nam_ways = [w for w in out_ways if (w.get('name') or '') in ('한강남자전거길', '한강 자전거길')]
    # 탄천 relation members that are cycleways
    tan_rel = next((e for e in els if e['type'] == 'relation' and e['id'] == 27411), None)
    tan_member_ids = set()
    if tan_rel:
        tan_member_ids = {m['ref'] for m in (tan_rel.get('members') or []) if m['type'] == 'way'}
    extra_tan = [w for w in out_ways if w.get('id') in tan_member_ids and w not in tan_ways]
    tan_ways = tan_ways + extra_tan

    # stitch 탄천 from existing end toward 합수부 (north = more-negative z), then 한강남 west to banpoEast
    hap_target = (-200.0, -17650.0)  # approximate 합수부; refined after stitch
    tan_spine = stitch_spine(tan_ways, TANCHEON_END, hap_target, max_jump=45)
    nam_start = tan_spine[-1] if tan_spine else hap_target
    nam_spine = stitch_spine(nam_ways, nam_start, BANPO_EAST, max_jump=40)
    spine = tan_spine[:]
    if nam_spine:
        if spine and near_pt(spine[-1], nam_spine[0], 8):
            spine.extend(nam_spine[1:])
        elif spine:
            # record the junction gap; still connect for the test to measure
            spine.extend(nam_spine)
        else:
            spine = nam_spine

    def end_points(name):
        pts = []
        for w in out_ways:
            if w.get('name') == name and w.get('pts'):
                pts.append(w['pts'][0])
                pts.append(w['pts'][-1])
        return pts

    south_bike = end_points('한강남자전거길')
    def extremum(pts, key, rev=False):
        if not pts:
            return None
        return sorted(pts, key=key, reverse=rev)[0]

    connect = {
        'tancheonSouth': {'name': '기존 탄천 자전거도로 북단 (채널 오버레이)', 'x': TANCHEON_END[0], 'z': TANCHEON_END[1]},
        'banpoEast': {'name': '한강남자전거길 → 반포 1구간', 'x': BANPO_EAST[0], 'z': BANPO_EAST[1]},
    }
    if tan_spine:
        connect['tancheonHap'] = {
            'name': '탄천 자전거길 북단 (합수부)',
            'x': tan_spine[-1][0], 'z': tan_spine[-1][1],
        }
    if south_bike:
        west = extremum(south_bike, lambda p: p[0], rev=False)
        east = extremum(south_bike, lambda p: p[0], rev=True)
        connect['hangangNamWest'] = {'name': '한강남자전거길 서단 (이 clip)', 'x': west[0], 'z': west[1]}
        connect['hangangNamEast'] = {'name': '한강남자전거길 동단 (이 clip)', 'x': east[0], 'z': east[1]}

    # spawns: 합수부 = last 탄천 / first 한강남 near junction; 잠원 = bike point nearest 잠원한강공원
    hap_spawn = connect.get('tancheonHap') or {'x': -400.0, 'z': -17600.0, 'name': '탄천합수부'}
    jamwon_park = next((p for p in parks if (p.get('name') or '') == '잠원한강공원'), None)
    jamwon_spawn = None
    if jamwon_park and jamwon_park.get('o'):
        o = jamwon_park['o']
        pcx = sum(p[0] for p in o) / len(o)
        pcz = sum(p[1] for p in o) / len(o)
        best, best_d = None, 1e18
        for w in nam_ways:
            for p in w['pts']:
                d = math.hypot(p[0] - pcx, p[1] - pcz)
                if d < best_d:
                    best, best_d = p, d
        if best:
            jamwon_spawn = {'x': best[0], 'z': best[1], 'name': '잠원한강공원'}
    if not jamwon_spawn:
        # fallback: 한강남자전거길 point nearest x=-7500 (잠원 is between 한남~반포)
        best, best_d = None, 1e18
        target_x = -7800.0
        for w in nam_ways:
            for p in w['pts']:
                d = abs(p[0] - target_x)
                if d < best_d:
                    best, best_d = p, d
        if best:
            jamwon_spawn = {'x': best[0], 'z': best[1], 'name': '잠원한강공원'}

    park_names = sorted({p.get('name') for p in parks if p.get('name')})
    way_names = {}
    for w in out_ways:
        n = w.get('name')
        if not n:
            continue
        way_names[n] = way_names.get(n, 0) + 1

    source = (
        'OSM API 0.6 map bboxes covering 127.006–127.115, 37.486–37.534 '
        '(탄천 수서·대치 → 합수부 → 잠실·청담·영동·성수·동호·한남·잠원) + '
        'relation/152336 한강 water (assembled rings, clipped) + '
        'relation/9035438 탄천 riverbank (assembled) + '
        'relation/27411 탄천 자전거길 + relation/8280682 · 8371341 한강 자전거길 names in map data'
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
            'segment': 'hap',
            'demSub': 1,
            'visualXMin': VISUAL_XMIN,
            'pathWestClip': PATH_WEST_CLIP,
            'skipSkyline': True,
            'datumBlend': {
                'xEast': CORRIDOR_X0,
                'xWest': HANGANG_X1,
                'zSouth': TANCHEON_END[1],
                'zHap': -15200.0,
                'offset0': 36.5,
                'offsetSouth': None,  # filled after DEM sample at join
                'eleJoin': None,
                'joinXZ': [TANCHEON_END[0], TANCHEON_END[1]],
                'tancheonWaterY': TANCHEON_WATER_Y,
                'note': (
                    'Corridor 탄천 uses stylized WATER=-6.6; 1구간 한강 uses y=ele-48 '
                    '(water ≈ −43). offset(x,z) lerps those two existing datums. '
                    'Not invented terrain.'
                ),
            },
        },
        'water': {
            'osm': 'relation/152336+relation/9035438',
            'name': '한강·탄천',
            'nameEn': 'Han River and Tancheon',
            'han': {'osm': 'relation/152336', 'outers': len(han_outers), 'inners': len(han_inners)},
            'tancheon': {'osm': 'relation/9035438', 'outers': len(tan_outers), 'inners': len(tan_inners)},
            'outers': water_outers,
            'inners': water_inners,
        },
        'parks': parks,
        'grass': grass,
        'ways': out_ways,
        'buildings': buildings,
        'bridges': bridges,
        'trees': trees,
        'amenities': benches,
        'spine': spine,
        'connectEnds': connect,
        'spawns': {
            'tancheon-hap': {'x': hap_spawn['x'], 'z': hap_spawn['z'], 'name': hap_spawn.get('name') or '탄천합수부'},
            'jamwon': jamwon_spawn or {'x': -7800.0, 'z': -16500.0, 'name': '잠원한강공원'},
        },
        'routes': {
            'tancheonBike': {
                'osm': 'relation/27411',
                'name': '탄천 자전거길',
                'nameEn': 'Tancheon Cycleway',
                'network': 'rcn',
                'route': 'bicycle',
            },
            'hangangJongju': {
                'osm': 'relation/8280682',
                'name': '한강 종주 자전거길 (서울 구간)',
            },
            'hangangBike': {
                'osm': 'relation/8371341',
                'name': '한강 자전거길',
            },
        },
        'stats': {
            'ways': len(out_ways),
            'parks': len(parks),
            'parkNames': park_names,
            'buildings': len(buildings),
            'bridges': [{'id': b['id'], 'name': b['name'], 'closed': b.get('closed'),
                         'lengthEst': b.get('lengthEst'), 'widthEst': b.get('widthEst')} for b in bridges],
            'wayNames': way_names,
            'spineM': round(polyline_len(spine), 1) if spine else 0,
            'tanSpineM': round(polyline_len(tan_spine), 1) if tan_spine else 0,
            'namSpineM': round(polyline_len(nam_spine), 1) if nam_spine else 0,
        },
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
    x0, z1 = xz(CLIP['lat0'], CLIP['lon0'])
    x1, z0 = xz(CLIP['lat1'], CLIP['lon1'])
    gx0 = math.floor(min(x0, x1) / 25) * 25
    gx1 = math.ceil(max(x0, x1) / 25) * 25
    gz0 = math.floor(min(z0, z1) / 25) * 25
    gz1 = math.ceil(max(z0, z1) / 25) * 25
    # cover banpoEast (x=-8923.9) so heightAt works at the 1구간 join,
    # even though the visual mesh is clipped at VISUAL_XMIN
    gx0 = min(gx0, math.floor(-9100 / 25) * 25)
    dx = dz = 25.0
    nx = int(round((gx1 - gx0) / dx)) + 1
    nz = int(round((gz1 - gz0) / dz)) + 1
    print(f'DEM grid {nx}x{nz} x={gx0}..{gx1} z={gz0}..{gz1}')

    from PIL import Image
    lons = [CLIP['lon0'], CLIP['lon1'], CENTER['lon'] + gx0 / KX]
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
            reused = Path('/tmp/hangang-raw') / dest.name
            if not dest.exists():
                if reused.exists():
                    dest.write_bytes(reused.read_bytes())
                    print(f'  reuse {reused.name}')
                else:
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
        print(f'  fill {missing} missing DEM samples')
        known = [(i, h) for i, h in enumerate(heights) if h is not None]
        if not known:
            raise SystemExit('DEM fetch failed: no samples')
        for i, h in enumerate(heights):
            if h is not None:
                continue
            heights[i] = heights[i - 1] if i and heights[i - 1] is not None else known[0][1]
    finite = [h for h in heights if h is not None]
    med = sorted(finite)[len(finite) // 2]
    for i, v in enumerate(heights):
        if v is None or v < -5 or v > 180:
            heights[i] = None
    for i, v in enumerate(heights):
        if v is not None:
            continue
        j0 = i - i % nx
        row = [heights[j] for j in range(j0, j0 + nx) if heights[j] is not None]
        heights[i] = row[len(row) // 2] if row else med
    finite = [h for h in heights if h is not None]
    # sample join elevation
    join_lon = CENTER['lon'] + TANCHEON_END[0] / KX
    join_lat = CENTER['lat'] - TANCHEON_END[1] / KZ
    ele_join = ele_at(join_lon, join_lat)
    dem = {
        'source': 'AWS Terrain Tiles terrarium z=14 (SRTM and other public DEMs, https://registry.opendata.aws/terrain-tiles/)',
        'attribution': 'Mapzen / AWS Terrain Tiles (public). Heights are metres above sea level (terrarium encoding).',
        'note': 'Game y = eleASL - datum + blendOffset(x,z). datum=48 matches namsan / Jeongja / 1구간.',
        'x0': gx0, 'z0': gz0, 'dx': dx, 'dz': dz, 'nx': nx, 'nz': nz,
        'datum': DATUM,
        'eleMin': min(finite), 'eleMax': max(finite),
        'eleJoin': None if ele_join is None else round(ele_join, 1),
        'h': heights,
    }
    print(f"  ele {dem['eleMin']} .. {dem['eleMax']}  join ele {dem['eleJoin']}")
    return dem


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    print('fetch OSM maps…')
    chunks = []
    for i, box in enumerate(BBOXES):
        chunks.append(fetch_map(*box, tag=str(i)))
        print(f'  bbox {i}: {len(chunks[-1])} elements')
    print('merge…')
    els = merge_elements(chunks)
    print(f'  {len(els)} elements')
    print('build osm json…')
    osm = build_osm(els)
    st = osm['stats']
    print(f"  ways {st['ways']} parks {st['parks']} buildings {st['buildings']} "
          f"water outer {len(osm['water']['outers'])} inner {len(osm['water']['inners'])}")
    print(f"  parks: {st['parkNames']}")
    print(f"  bridges: {st['bridges']}")
    print(f"  spine {st['spineM']} m (탄천 {st['tanSpineM']} + 한강남 {st['namSpineM']})")
    print(f"  connect {osm.get('connectEnds')}")
    print(f"  spawns {osm.get('spawns')}")

    print('fetch DEM…')
    dem = fetch_dem()
    blend = osm['meta']['datumBlend']
    if dem.get('eleJoin') is not None:
        blend['eleJoin'] = dem['eleJoin']
        # y_join = eleJoin - 48 + offsetSouth ≈ TANCHEON_WATER_Y + 0.6 (floor ≈ -6)
        blend['offsetSouth'] = round(TANCHEON_WATER_Y + 0.4 - (dem['eleJoin'] - DATUM), 2)
        print(f"  datumBlend offsetSouth={blend['offsetSouth']} (eleJoin={dem['eleJoin']})")

    osm_path = OUT / 'hap-osm.json'
    osm_path.write_text(json.dumps(osm, ensure_ascii=False, separators=(',', ':')))
    print(f'  wrote {osm_path} ({osm_path.stat().st_size} bytes)')
    dem_path = OUT / 'hap-dem.json'
    dem_path.write_text(json.dumps(dem, ensure_ascii=False, separators=(',', ':')))
    print(f'  wrote {dem_path} ({dem_path.stat().st_size} bytes)')

if __name__ == '__main__':
    main()
