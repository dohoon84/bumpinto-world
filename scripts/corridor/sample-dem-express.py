# [pangyo-express] 판교 확장 3단계 — 공개 DEM 높이 샘플(참고 기록용, 게임 지형은 바꾸지 않음)
#   입력: Copernicus GLO-30 DEM 타일 cop_N37E127.tif (ESA/Airbus, Copernicus DEM 공개본 2021 — https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model)
#         data/osm_pangyo_express.json (OSM 선형)
#   출력: data/dem_pangyo_express.json  {route:[[s,el]...], mainNB:[...], note}
#   주의: GLO-30 은 DSM(지표면: 교량 상판·차량·식생 포함)이며 절대 수직 오차 < 4m(90% LE). 30m 격자라 고가 상판/하부 도로를 구분 못 함.
#   사용: python3 scripts/corridor/sample-dem-express.py /path/to/cop_N37E127.tif
import json, math, sys
import numpy as np
from PIL import Image
TIF = sys.argv[1] if len(sys.argv) > 1 else '/workspace/bw-pangyo-link-data/cop_N37E127.tif'
lat0, lon0 = 37.3665, 127.10835; kx = math.cos(math.radians(lat0)) * 111320; kz = 110540
A = np.array(Image.open(TIF)).astype(float)
def cop(lon, lat):
    c = (lon - 127) * 3600 - 0.5; r = (38 - lat) * 3600 - 0.5
    c0, r0 = int(math.floor(c)), int(math.floor(r)); fc, fr = c - c0, r - r0
    v = A[r0:r0 + 2, c0:c0 + 2]
    return float(v[0, 0] * (1 - fc) * (1 - fr) + v[0, 1] * fc * (1 - fr) + v[1, 0] * (1 - fc) * fr + v[1, 1] * fc * fr)
D = json.load(open('data/osm_pangyo_express.json'))
N = {n['id']: n for n in D['nodes']}; W = {w['id']: w for w in D['ways']}
def line(ids):
    pts = []
    for wid in ids:
        for n in W[wid]['nodes']:
            p = (N[n]['lon'], N[n]['lat'])
            if not pts or pts[-1] != p: pts.append(p)
    return pts
def sample(pts, step=25):
    out, s = [], 0.0
    xy = [((lo - lon0) * kx, -(la - lat0) * kz) for lo, la in pts]
    nxt = 0.0
    for i in range(1, len(xy)):
        (ax, az), (bx, bz) = xy[i - 1], xy[i]; L = math.hypot(bx - ax, bz - az)
        while nxt <= s + L:
            t = (nxt - s) / L if L else 0; x, z = ax + (bx - ax) * t, az + (bz - az) * t
            out.append([round(nxt), round(cop(lon0 + x / kx, lat0 - z / kz), 1)]); nxt += step
        s += L
    return out
G = D['groups']
out = {'source': 'Copernicus GLO-30 DEM (DSM) cop_N37E127, ESA/Airbus 2021 public release — bilinear sample every 25 m along OSM lines',
       'accuracy': 'absolute vertical < 4 m (90% LE); 30 m grid; DSM includes bridge decks/vegetation',
       'route': sample(line(G['route'])), 'mainNB': sample(line(G['mainNB']))}
json.dump(out, open('data/dem_pangyo_express.json', 'w'), separators=(',', ':'))
r = out['route']; print('route', r[0], r[len(r) // 2], r[-1], 'min', min(v for _, v in r), 'max', max(v for _, v in r))
