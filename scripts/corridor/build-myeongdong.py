#!/usr/bin/env python3
"""[myeongdong] 명동 리전 데이터 — OSM API 0.6 map (bbox 타일) + AWS terrarium DEM.

Overpass 가 막힌 환경이라 남산과 같은 방식(OSM API 0.6 map bbox)으로 받는다.
원본은 MYEONGDONG_RAW(/tmp/myeongdong-raw) 에 캐시하고, 게임용 압축 JSON 만 저장소에 둔다.
  python3 scripts/corridor/build-myeongdong.py   → public/corridor/myeongdong/myeongdong.json
좌표: 정자 원점 등장방형 (namsan-osm.json meta 와 같은 kx/kz). y = ASL - datum(48).
상호(가게 이름)는 상표 문제로 저장하지 않는다. shop 종류만 남긴다.
"""
import json, math, os, io, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = Path(os.environ.get('MYEONGDONG_RAW', '/tmp/myeongdong-raw'))
OUT = ROOT / 'public/corridor/myeongdong'
UA = 'bumpinto-world/myeongdong (https://github.com/dohoon84/bumpinto-world; ODbL)'
CENTER = {'lat': 37.3665, 'lon': 127.10835}
KX = math.cos(math.radians(CENTER['lat'])) * 111320
KZ = 110540
DATUM = 48.0
# 게임 섬 경계 (남쪽 변 z=-21300 은 남산 DEM 북쪽 변과 맞닿는다)
BOUNDS = {'x0': -11420.0, 'z0': -22080.0, 'x1': -10530.0, 'z1': -21300.0}
# 명동역 → 남산오르미 → 케이블카 하부정류장 연결 띠 (남산 섬 안, 길만 그린다)
LINK = {'x0': -11160.0, 'z0': -21300.0, 'x1': -10900.0, 'z1': -20990.0}
# 걸을 수 없는 바깥 띠(보이기만): 땅·건물·길을 여기까지 그리고 바깥 가장자리에서 남산 도심 높이로 내려 붙인다
APRON = {'x0': -11530.0, 'z0': -22300.0, 'x1': -10455.0, 'z1': -21300.0}
LON0, LAT0, LON1, LAT1 = 126.9776, 37.5560, 126.9898, 37.5672


def r1(v):
    return round(v * 10) / 10


def xz(lat, lon):
    return [r1((lon - CENTER['lon']) * KX), r1(-(lat - CENTER['lat']) * KZ)]


def get(url, dest=None):
    if dest and Path(dest).exists():
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


def terrarium_dem(x0, z0, dx, nx, nz):
    from PIL import Image
    zl = 15
    n = 2 ** zl
    cache = {}

    def tile(tx, ty):
        k = (tx, ty)
        if k not in cache:
            raw = get(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{zl}/{tx}/{ty}.png', RAW / f'dem_{zl}_{tx}_{ty}.png')
            cache[k] = Image.open(io.BytesIO(raw)).convert('RGB').load()
        return cache[k]

    def ele_px(px, py):
        tx, ty = int(px // 256), int(py // 256)
        p = tile(tx, ty)[int(px % 256), int(py % 256)]
        return p[0] * 256 + p[1] + p[2] / 256 - 32768

    def ele(lat, lon):
        lat_r = math.radians(lat)
        fx = (lon + 180) / 360 * n * 256 - 0.5
        fy = (1 - math.log(math.tan(lat_r) + 1 / math.cos(lat_r)) / math.pi) / 2 * n * 256 - 0.5
        ix, iy = math.floor(fx), math.floor(fy)
        u, v = fx - ix, fy - iy
        e00, e10 = ele_px(ix, iy), ele_px(ix + 1, iy)
        e01, e11 = ele_px(ix, iy + 1), ele_px(ix + 1, iy + 1)
        return (e00 * (1 - u) + e10 * u) * (1 - v) + (e01 * (1 - u) + e11 * u) * v

    h = []
    for j in range(nz):
        for i in range(nx):
            x, z = x0 + i * dx, z0 + j * dx
            lon = CENTER['lon'] + x / KX
            lat = CENTER['lat'] - z / KZ
            h.append(round(ele(lat, lon), 1))
    return h


ROAD_W = {'trunk': 22, 'primary': 20, 'secondary': 14, 'tertiary': 11, 'residential': 7, 'unclassified': 7, 'service': 5,
          'living_street': 6, 'pedestrian': 7, 'footway': 3, 'path': 2.2, 'steps': 3, 'cycleway': 2.5, 'corridor': 3,
          'primary_link': 8, 'secondary_link': 7, 'tertiary_link': 6, 'trunk_link': 8}


def inside(p, b, pad=0):
    return b['x0'] - pad <= p[0] <= b['x1'] + pad and b['z0'] - pad <= p[1] <= b['z1'] + pad


def num(v):
    try:
        return float(str(v).split(';')[0].replace('m', '').strip())
    except Exception:  # noqa
        return None


def main():
    nodes, ways, rels = fetch_osm()
    print('osm', len(nodes), len(ways), len(rels))
    P = lambda nid: xz(nodes[nid]['lat'], nodes[nid]['lon']) if nid in nodes else None
    both = lambda p: inside(p, APRON, 10) or inside(p, LINK, 30)

    out_ways, out_bld, areas, shops, exits, lamps = [], [], [], [], [], []
    station = cathedral = oreumi = None
    used_in_rel = set()
    for r in rels.values():
        t = r.get('tags', {})
        if t.get('type') == 'multipolygon' and ('building' in t or t.get('amenity') == 'place_of_worship'):
            for m in r.get('members', []):
                if m['type'] == 'way' and m.get('role') == 'outer' and m['ref'] in ways:
                    w = ways[m['ref']]
                    w.setdefault('tags', {})
                    for k, v in t.items():
                        if k != 'type': w['tags'].setdefault(k, v)
                    used_in_rel.add(m['ref'])
    for w in ways.values():
        t = w.get('tags', {})
        pts = [P(n) for n in w.get('nodes', [])]
        if not pts or any(p is None for p in pts):
            continue
        if not any(both(p) for p in pts):
            continue
        hw = t.get('highway')
        if hw and t.get('area') != 'yes' and hw in ROAD_W:
            if t.get('tunnel') in ('yes', 'building_passage') and hw not in ('footway', 'pedestrian'):
                pass
            if t.get('indoor') == 'yes' or t.get('level', '0').startswith('-'):
                continue
            wd = num(t.get('width')) or ROAD_W[hw]
            if hw in ('primary', 'trunk', 'secondary', 'tertiary') and t.get('oneway') == 'yes' and not t.get('width'):
                # 분리 차로(일방 한쪽) — 양방향 기본 폭을 쓰면 두 차로가 겹쳐 보도·출구를 덮는다
                ln = num(t.get('lanes')) or (3 if hw in ('primary', 'trunk') else 2)
                wd = ln * 3.25 + 0.6
            elif hw in ('primary', 'trunk', 'secondary') and t.get('lanes'):
                ln = num(t.get('lanes')) or 0
                wd = max(wd, ln * 3.3 + 2)
            o = {'id': w['id'], 'k': hw, 'w': round(wd, 1), 'pts': pts}
            if t.get('name'): o['n'] = t['name']
            if t.get('name:en'): o['ne'] = t['name:en']
            if t.get('oneway') == 'yes': o['ow'] = 1
            if t.get('tunnel') == 'yes': o['tun'] = 1
            if t.get('bridge') == 'yes': o['br'] = 1
            if t.get('lanes'): o['ln'] = num(t['lanes'])
            out_ways.append(o)
            continue
        if hw == 'elevator' or t.get('aerialway') or t.get('railway') == 'funicular' or t.get('name') == '남산오르미':
            if t.get('name') == '남산오르미' or hw == 'elevator':
                oreumi = {'id': w['id'], 'n': t.get('name', ''), 'pts': pts}
            continue
        closed = w['nodes'][0] == w['nodes'][-1] and len(pts) >= 4
        if closed and ('building' in t or w['id'] in used_in_rel):
            if t.get('building') in ('roof',) and not t.get('name'):
                pass
            h = num(t.get('height'))
            lv = num(t.get('building:levels'))
            o = {'id': w['id'], 'o': pts[:-1]}
            if h: o['h'] = round(h, 1)
            if lv: o['lv'] = lv
            if t.get('building') and t['building'] != 'yes': o['k'] = t['building']
            if t.get('amenity'): o['am'] = t['amenity']
            if t.get('name') and (t.get('amenity') in ('place_of_worship',) or t.get('building') in ('cathedral', 'church') or t.get('historic') or t.get('tourism')):
                o['n'] = t['name']
                if t.get('name:en'): o['ne'] = t['name:en']
            if t.get('building:part'):
                o['part'] = 1
            out_bld.append(o)
            if (t.get('building') == 'cathedral' or 'Cathedral' in t.get('name:en', '') or '명동성당' in t.get('name', '') or '명동대성당' in t.get('name', '')):
                if cathedral is None or len(pts) > len(cathedral['o']):
                    cathedral = {'id': w['id'], 'o': pts[:-1], 'n': t.get('name'), 'ne': t.get('name:en'), 'h': num(t.get('height'))}
            continue
        if closed and (t.get('highway') == 'pedestrian' or t.get('area:highway') or t.get('leisure') in ('park', 'garden', 'playground') or t.get('landuse') in ('grass', 'religious') or t.get('amenity') in ('place_of_worship', 'parking') or t.get('natural') in ('wood', 'scrub')):
            k = t.get('highway') or t.get('area:highway') and 'ped' or t.get('leisure') or t.get('landuse') or t.get('amenity') or t.get('natural')
            o = {'id': w['id'], 'k': k, 'o': pts[:-1]}
            if t.get('name') and (t.get('amenity') == 'place_of_worship' or t.get('landuse') == 'religious' or t.get('leisure')):
                o['n'] = t['name']
            areas.append(o)
    for nd in nodes.values():
        t = nd.get('tags')
        if not t: continue
        p = xz(nd['lat'], nd['lon'])
        if not both(p): continue
        if t.get('railway') == 'subway_entrance':
            exits.append({'osm': nd['id'], 'ref': t.get('ref'), 'x': p[0], 'z': p[1], 'n': t.get('name')})
        if (t.get('railway') == 'station' or t.get('public_transport') == 'station') and t.get('name') in ('명동', '명동역'):
            station = {'osm': nd['id'], 'name': '명동', 'nameEn': 'Myeongdong', 'x': p[0], 'z': p[1], 'lat': nd['lat'], 'lon': nd['lon'], 'line': t.get('line') or '4호선'}
        if t.get('shop') or t.get('amenity') in ('cafe', 'restaurant', 'fast_food', 'bank', 'pharmacy'):
            shops.append([p[0], p[1], t.get('shop') or t.get('amenity')])
        if t.get('highway') == 'street_lamp':
            lamps.append(p)
    # 명동역 출입구는 이름으로 거른다 (을지로입구·회현 출입구 섞임 방지 — 300 m 안)
    if station:
        exits = [e for e in exits if math.hypot(e['x'] - station['x'], e['z'] - station['z']) < 260]
    print('ways', len(out_ways), 'bld', len(out_bld), 'areas', len(areas), 'shops', len(shops), 'exits', len(exits), 'station', station, 'cathedral', cathedral and cathedral['id'], 'oreumi', oreumi)

    # DEM 12.5 m (남산 25 m 격자와 같은 원점 정렬). 남쪽 변은 남산 DEM 첫 줄과 같게 맞춘다.
    DX = 12.5
    x0 = -11275 - math.ceil((-11275 - APRON['x0']) / DX) * DX
    z0 = -21300 - math.ceil((-21300 - APRON['z0']) / DX) * DX
    zEnd = LINK['z1']
    nx = int(math.ceil((APRON['x1'] - x0) / DX)) + 1
    nz = int(math.ceil((zEnd - z0) / DX)) + 1
    h = terrarium_dem(x0, z0, DX, nx, nz)
    dem = {'x0': x0, 'z0': z0, 'dx': DX, 'dz': DX, 'nx': nx, 'nz': nz, 'datum': DATUM, 'h': h,
           'source': 'AWS Terrain Tiles terrarium z=15 (public DEMs, https://registry.opendata.aws/terrain-tiles/)'}
    data = {
        'meta': {'center': CENTER, 'kx': KX, 'kz': KZ, 'attribution': '© OpenStreetMap contributors (ODbL)',
                 'source': f'OSM API 0.6 map bbox {LON0},{LAT0},{LON1},{LAT1} (5x5 tiles), names of shops not stored',
                 'built': time.strftime('%Y-%m-%d')},
        'bounds': BOUNDS, 'apron': APRON, 'link': LINK, 'station': station, 'exits': sorted(exits, key=lambda e: (len(e['ref'] or ''), e['ref'] or '')),
        'cathedral': cathedral, 'oreumi': oreumi, 'ways': out_ways, 'buildings': out_bld, 'areas': areas,
        'shops': shops, 'lamps': lamps, 'dem': dem,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'myeongdong.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    print('wrote', OUT / 'myeongdong.json', (OUT / 'myeongdong.json').stat().st_size)


if __name__ == '__main__':
    main()
