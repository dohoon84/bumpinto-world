#!/usr/bin/env python3
"""[seongsu] 성수동 리전 데이터 — OSM API 0.6 map (bbox 5x5 타일). 명동(build-myeongdong.py)과 같은 방식·같은 투영.

성수는 한강변 평지(해발 15–20 m)라 DEM 없이 평평한 땅(y = 0)으로 둔다.
원본은 SEONGSU_RAW(/tmp/seongsu-raw) 에 캐시하고, 게임용 압축 JSON 만 저장소에 둔다.
  python3 scripts/corridor/build-seongsu.py   → public/corridor/seongsu/seongsu.json
좌표: 정자 원점 등장방형 (namsan-osm.json meta 와 같은 kx/kz).
상호(가게 이름)는 상표 문제로 저장하지 않는다. shop 종류만 남긴다.
하우스 노웨어 서울(뚝섬로 433) 자리의 OSM 건물은 빼고 hq 로 따로 둔다(게임 모델이 그 자리에 선다).
"""
import json, math, os, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = Path(os.environ.get('SEONGSU_RAW', '/tmp/seongsu-raw'))
OUT = ROOT / 'public/corridor/seongsu'
UA = 'bumpinto-world/seongsu (https://github.com/dohoon84/bumpinto-world; ODbL)'
CENTER = {'lat': 37.3665, 'lon': 127.10835}
KX = math.cos(math.radians(CENTER['lat'])) * 111320
KZ = 110540
LON0, LAT0, LON1, LAT1 = 127.0500, 37.5350, 127.0650, 37.5485
HQ_LL = (37.538065, 127.058949)  # 뚝섬로 433
STATION_LL = (37.544581, 127.055961)


def r1(v):
    return round(v * 10) / 10


def xz(lat, lon):
    return [r1((lon - CENTER['lon']) * KX), r1(-(lat - CENTER['lat']) * KZ)]


# 걸을 수 있는 섬(성수역 ~ 하우스 노웨어 · 연무장길 일대) / 보이기만 하는 바깥 띠
_a, _b = xz(37.5470, 127.0515), xz(37.5362, 127.0635)
BOUNDS = {'x0': _a[0], 'z0': _a[1], 'x1': _b[0], 'z1': _b[1]}
_c, _d = xz(37.5482, 127.0503), xz(37.5352, 127.0647)
APRON = {'x0': _c[0], 'z0': _c[1], 'x1': _d[0], 'z1': _d[1]}


def get(url, dest=None):
    if dest and Path(dest).exists() and Path(dest).stat().st_size > 100:
        return Path(dest).read_bytes()
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                data = r.read()
            if dest:
                Path(dest).write_bytes(data)
            return data
        except Exception as e:  # noqa
            print('retry', url, e)
            time.sleep(2 + attempt * 3)
    raise RuntimeError('fetch failed ' + url)


def fetch_osm():
    RAW.mkdir(parents=True, exist_ok=True)
    nodes, ways, rels = {}, {}, {}
    NX, NZ = 5, 5
    for i in range(NX):
        for j in range(NZ):
            a = LON0 + (LON1 - LON0) * i / NX
            b = LAT0 + (LAT1 - LAT0) * j / NZ
            c = LON0 + (LON1 - LON0) * (i + 1) / NX
            d = LAT0 + (LAT1 - LAT0) * (j + 1) / NZ
            url = f'https://api.openstreetmap.org/api/0.6/map.json?bbox={a:.5f},{b:.5f},{c:.5f},{d:.5f}'
            data = json.loads(get(url, RAW / f'map_{i}_{j}.json'))
            for e in data['elements']:
                t = e['type']
                if t == 'node': nodes[e['id']] = e
                elif t == 'way': ways[e['id']] = e
                else: rels[e['id']] = e
    return nodes, ways, rels


ROAD_W = {'trunk': 22, 'primary': 20, 'secondary': 14, 'tertiary': 11, 'residential': 7, 'unclassified': 7, 'service': 5,
          'living_street': 6, 'pedestrian': 7, 'footway': 3, 'path': 2.2, 'steps': 3, 'cycleway': 2.5,
          'primary_link': 8, 'secondary_link': 7, 'tertiary_link': 6, 'trunk_link': 8}


def inside(p, b, pad=0):
    return b['x0'] - pad <= p[0] <= b['x1'] + pad and b['z0'] - pad <= p[1] <= b['z1'] + pad


def num(v):
    try:
        return float(str(v).split(';')[0].replace('m', '').strip())
    except Exception:  # noqa
        return None


def pip(x, z, ring):
    c = False
    for i in range(len(ring)):
        a, b = ring[i], ring[i - 1]
        if (a[1] > z) != (b[1] > z) and x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1] + 1e-12) + a[0]:
            c = not c
    return c


def seg_d(px, pz, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dz * dz or 1
    t = max(0, min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2))
    return math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t), (dx, dz)


def main():
    nodes, ways, rels = fetch_osm()
    print('osm', len(nodes), len(ways), len(rels))
    P = lambda nid: xz(nodes[nid]['lat'], nodes[nid]['lon']) if nid in nodes else None
    hq = xz(*HQ_LL)
    out_ways, out_bld, areas, shops, exits, rail = [], [], [], [], [], []
    station = None
    used_in_rel = set()
    for r in rels.values():
        t = r.get('tags', {})
        if t.get('type') == 'multipolygon' and 'building' in t:
            for m in r.get('members', []):
                if m['type'] == 'way' and m.get('role') == 'outer' and m['ref'] in ways:
                    w = ways[m['ref']]
                    w.setdefault('tags', {})
                    for k, v in t.items():
                        if k != 'type': w['tags'].setdefault(k, v)
                    used_in_rel.add(m['ref'])
    hq_bld = None
    for w in ways.values():
        t = w.get('tags', {})
        pts = [P(n) for n in w.get('nodes', [])]
        if not pts or any(p is None for p in pts):
            continue
        if not any(inside(p, APRON, 10) for p in pts):
            continue
        hw = t.get('highway')
        if t.get('railway') in ('subway', 'rail', 'light_rail') and t.get('tunnel') != 'yes':
            rail.append({'id': w['id'], 'k': t['railway'], 'br': 1 if t.get('bridge') == 'yes' or t.get('layer', '0') not in ('0', '-1') else 0, 'pts': pts, 'n': t.get('name', '')})
            continue
        if hw and t.get('area') != 'yes' and hw in ROAD_W:
            if t.get('indoor') == 'yes' or t.get('level', '0').startswith('-') or t.get('tunnel') == 'yes':
                continue
            wd = num(t.get('width')) or ROAD_W[hw]
            if hw in ('primary', 'trunk', 'secondary', 'tertiary') and t.get('oneway') == 'yes' and not t.get('width'):
                ln = num(t.get('lanes')) or (3 if hw in ('primary', 'trunk') else 2)
                wd = ln * 3.25 + 0.6
            elif hw in ('primary', 'trunk', 'secondary') and t.get('lanes'):
                ln = num(t.get('lanes')) or 0
                wd = max(wd, ln * 3.3 + 2)
            if hw in ('primary', 'trunk', 'secondary', 'tertiary', 'primary_link', 'secondary_link', 'tertiary_link', 'trunk_link'):
                cap = 13.6 if t.get('oneway') == 'yes' else 22 if hw in ('primary', 'trunk') else 18 if hw == 'secondary' else 14
                wd = min(wd, cap)
            o = {'id': w['id'], 'k': hw, 'w': round(wd, 1), 'pts': pts}
            if t.get('name'): o['n'] = t['name']
            if t.get('name:en'): o['ne'] = t['name:en']
            if t.get('oneway') == 'yes': o['ow'] = 1
            if t.get('bridge') == 'yes': o['br'] = 1
            if t.get('lanes'): o['ln'] = num(t['lanes'])
            out_ways.append(o)
            continue
        closed = w['nodes'][0] == w['nodes'][-1] and len(pts) >= 4
        if closed and ('building' in t or w['id'] in used_in_rel):
            ring = pts[:-1]
            if pip(hq[0], hq[1], ring) or (t.get('name') and ('노웨어' in t['name'] or 'Nowhere' in t.get('name', ''))):
                if hq_bld is None or len(ring) > len(hq_bld['o']):
                    hq_bld = {'id': w['id'], 'o': ring, 'n': t.get('name')}
                continue
            o = {'id': w['id'], 'o': ring}
            h = num(t.get('height')); lv = num(t.get('building:levels'))
            if h: o['h'] = round(h, 1)
            if lv: o['lv'] = lv
            mh = num(t.get('min_height')) or ((num(t.get('building:min_level')) or 0) * 3.4)
            if mh: o['mh'] = round(mh, 1)
            if t.get('building') and t['building'] != 'yes': o['k'] = t['building']
            if t.get('building:part'): o['part'] = 1
            out_bld.append(o)
            continue
        if closed and (t.get('highway') == 'pedestrian' or t.get('leisure') in ('park', 'garden', 'playground', 'pitch') or t.get('landuse') in ('grass', 'recreation_ground') or t.get('amenity') == 'parking' or t.get('natural') in ('wood', 'scrub', 'water')):
            k = t.get('highway') or t.get('leisure') or t.get('landuse') or t.get('amenity') or t.get('natural')
            areas.append({'id': w['id'], 'k': k, 'o': pts[:-1]})
    for nd in nodes.values():
        t = nd.get('tags')
        if not t: continue
        p = xz(nd['lat'], nd['lon'])
        if not inside(p, APRON, 10): continue
        if t.get('railway') == 'subway_entrance':
            exits.append({'osm': nd['id'], 'ref': t.get('ref'), 'x': p[0], 'z': p[1], 'lat': nd['lat'], 'lon': nd['lon']})
        if (t.get('railway') == 'station' or t.get('public_transport') == 'station') and t.get('name') in ('성수', '성수역'):
            if station is None or t.get('railway') == 'station':
                station = {'osm': nd['id'], 'name': '성수', 'nameEn': 'Seongsu', 'x': p[0], 'z': p[1], 'lat': nd['lat'], 'lon': nd['lon']}
        if t.get('shop') or t.get('amenity') in ('cafe', 'restaurant', 'fast_food', 'bar', 'pub', 'bakery'):
            shops.append([p[0], p[1], t.get('shop') or t.get('amenity')])
    if not station:
        s = xz(*STATION_LL)
        station = {'osm': None, 'name': '성수', 'nameEn': 'Seongsu', 'x': s[0], 'z': s[1], 'lat': STATION_LL[0], 'lon': STATION_LL[1]}
    exits = [e for e in exits if math.hypot(e['x'] - station['x'], e['z'] - station['z']) < 220]
    # 출입구 방향: 가장 가까운 차도와 나란히 (계단은 보도 위, 길 반대쪽을 등지게)
    car = [w for w in out_ways if w['k'] in ('primary', 'secondary', 'tertiary', 'trunk', 'residential', 'unclassified')]
    for e in exits:
        best = None
        for w in car:
            for i in range(1, len(w['pts'])):
                d, (dx, dz) = seg_d(e['x'], e['z'], w['pts'][i - 1], w['pts'][i])
                if best is None or d < best[0]: best = (d, dx, dz)
        ry = math.atan2(best[1], best[2]) if best else 0.0
        e['place'] = {'x': e['x'], 'z': e['z'], 'ry': round(ry, 3), 'shift': 0, 'bad': 0}
    # 하우스 노웨어: 가장 가까운 큰 길(뚝섬로) 방향 → 정문(+z 로컬)이 길을 보게
    ttuk = None
    for w in out_ways:
        if '뚝섬로' not in (w.get('n') or '') : continue
        for i in range(1, len(w['pts'])):
            d, (dx, dz) = seg_d(hq[0], hq[1], w['pts'][i - 1], w['pts'][i])
            if ttuk is None or d < ttuk[0]:
                a, b = w['pts'][i - 1], w['pts'][i]
                t_ = max(0, min(1, ((hq[0] - a[0]) * dx + (hq[1] - a[1]) * dz) / (dx * dx + dz * dz or 1)))
                ttuk = (d, dx, dz, a[0] + dx * t_, a[1] + dz * t_)
    hq_out = {'x': hq[0], 'z': hq[1], 'osm': hq_bld and hq_bld['id'], 'o': hq_bld and hq_bld['o']}
    if hq_bld:
        cx = sum(p[0] for p in hq_bld['o']) / len(hq_bld['o']); cz = sum(p[1] for p in hq_bld['o']) / len(hq_bld['o'])
        hq_out['x'], hq_out['z'] = r1(cx), r1(cz)
    if ttuk:
        # 로컬 +z(정문) = 건물 중심 → 뚝섬로 가장 가까운 점
        fx, fz = ttuk[3] - hq_out['x'], ttuk[4] - hq_out['z']
        hq_out['ry'] = round(math.atan2(fx, fz), 4)
        hq_out['roadD'] = round(ttuk[0], 1)
    print('ways', len(out_ways), 'bld', len(out_bld), 'areas', len(areas), 'shops', len(shops), 'exits', len(exits), 'rail', len(rail), 'station', station, 'hq', {k: v for k, v in hq_out.items() if k != 'o'})
    data = {
        'meta': {'center': CENTER, 'kx': KX, 'kz': KZ, 'attribution': '© OpenStreetMap contributors (ODbL)',
                 'source': f'OSM API 0.6 map bbox {LON0},{LAT0},{LON1},{LAT1} (5x5 tiles), names of shops not stored',
                 'built': time.strftime('%Y-%m-%d')},
        'bounds': BOUNDS, 'apron': APRON, 'station': station,
        'exits': sorted(exits, key=lambda e: (len(e['ref'] or ''), e['ref'] or '')),
        'hq': hq_out, 'rail': rail, 'ways': out_ways, 'buildings': out_bld, 'areas': areas, 'shops': shops,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'seongsu.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    print('wrote', OUT / 'seongsu.json', (OUT / 'seongsu.json').stat().st_size)


if __name__ == '__main__':
    main()
