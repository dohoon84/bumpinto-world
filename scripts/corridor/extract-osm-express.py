# [pangyo-express] OSM API 0.6 /map 응답(bbox 37.388,127.084,37.414,127.114)에서 3단계에 쓰는 웨이/노드만 발췌 → data/osm_pangyo_express.json (ODbL)
#   route : 서현로 연결로 855890663 + 판교IC고가차도 855890660 → … → 경부 상행 합류 노드 734789416 (최단 차도 경로, oneway 반영)
#   mainNB/mainSB : 경부고속도로 상행/하행 웨이(합류점 앞뒤) · eb : 반대 방향 — 경부 하행 분기 → 요금소 → 판교IC고가차도 277593633 → 서현로
#   crossing : 위 선들과 교차하는 차도/물길/철도 웨이(높이 단면 계산용) · tollRoof 316570793(building=roof) · toll 노드 3개
#   사용: python3 scripts/corridor/extract-osm-express.py /path/to/osmapi.json
import json, math, sys
SRC = sys.argv[1] if len(sys.argv) > 1 else '/workspace/bw-pangyo-express-data/osmapi.json'
D = json.load(open(SRC)); d = D['elements']
lat0, lon0 = 37.3665, 127.10835; kx = math.cos(math.radians(lat0)) * 111320; kz = 110540
N = {e['id']: e for e in d if e['type'] == 'node'}; W = {e['id']: e for e in d if e['type'] == 'way'}
P = lambda i: ((N[i]['lon'] - lon0) * kx, -(N[i]['lat'] - lat0) * kz)
route = [855890663, 855890660, 855890661, 438357279, 468571224, 277593643, 277593638, 154281595, 154281641, 154281644]
nb = [59054242, 59242882, 59242875, 154281460, 402926379]
sb = [402926377, 154281453, 154281455, 59242880, 59242881, 437888996]
eb = [277593653, 437888997, 564843825, 277593649, 154281668, 564579864, 277593654, 277593633, 435434620]  # 경부 하행 분기(59242881 끝) → 요금소 → 판교IC고가차도 → 서현로
built = route + nb + sb + eb
def segs(w):
    ns = [n for n in W[w]['nodes'] if n in N]; return [(P(a), P(b)) for a, b in zip(ns, ns[1:])]
def inter(a, b, c, e):
    (x1, y1), (x2, y2) = a, b; (x3, y3), (x4, y4) = c, e
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < 1e-9: return False
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den; u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den
    return 0 < t < 1 and 0 < u < 1
BS = [s for w in built for s in segs(w)]
cross = set()
for w in W.values():
    t = w.get('tags', {})
    if w['id'] in built or not (t.get('highway') or t.get('waterway') or t.get('railway')): continue
    if t.get('highway') in ('footway', 'path', 'steps', 'corridor', 'pedestrian', 'track', 'bridleway', 'proposed', 'construction'): continue
    if any(inter(a, b, c, e) for a, b in segs(w['id']) for c, e in BS): cross.add(w['id'])
keepW = built + [316570793] + sorted(cross)
TAGS = ('highway', 'name', 'ref', 'lanes', 'oneway', 'layer', 'bridge', 'bridge:name', 'tunnel', 'toll', 'maxspeed', 'waterway', 'railway', 'building', 'barrier', 'width', 'name:en')
ways = [{'id': i, 'nodes': W[i]['nodes'], 'tags': {k: v for k, v in W[i].get('tags', {}).items() if k in TAGS}} for i in keepW]
TN = (7981145727, 7981145730, 7981145735)
need = set(n for w in ways for n in w['nodes']) | set(TN)
nodes = [{'id': i, 'lat': N[i]['lat'], 'lon': N[i]['lon'], **({'tags': N[i]['tags']} if i in TN else {})} for i in sorted(need) if i in N]
out = {'source': 'OpenStreetMap API 0.6 /map bbox ' + json.dumps(D['bounds']), 'fetched': '2026-11-03 (KST)', 'license': 'ODbL 1.0 — © OpenStreetMap contributors',
       'groups': {'route': route, 'mainNB': nb, 'mainSB': sb, 'eb': eb, 'tollRoof': [316570793], 'tollNodes': list(TN), 'crossing': sorted(cross)}, 'ways': ways, 'nodes': nodes}
json.dump(out, open('data/osm_pangyo_express.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(ways), 'ways', len(nodes), 'nodes', len(cross), 'crossing')
