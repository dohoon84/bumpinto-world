#!/usr/bin/env python3
# [pangyo-water] DEM 단면 샘플 — build-pangyo-water.mjs 의 DEM_STREAM.reliefM 과 탄천 흐름 방향 확인용 (참고값 출력만, 파일 안 씀)
#   DEM: Copernicus GLO-30 DSM 1°타일 Copernicus_DSM_COG_10_N37_00_E127_00_DEM.tif (ESA/Airbus 2021 공개본, 무료 배포,
#        https://copernicus-dem-30m.s3.amazonaws.com/) — 저장소에 넣지 않음. DSM 이라 나무·건물·다리 높이가 섞임.
#   좌표: 게임 x/z (m) ↔ 경위도 = src 와 같은 기준점 lat0 37.3665, lon0 127.10835 (등거리 근사)
#   사용: python3 scripts/corridor/dem/sample-pangyo-water.py --tif=/path/cop_N37E127.tif
#   필요: numpy, Pillow (rasterio/gdal 없이 GeoTIFF 1밴드 float 를 그대로 읽음)
import json, math, os, sys
import numpy as np
from PIL import Image

arg = lambda k, d: next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith(f'--{k}=')), d)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
TIF = arg('tif', os.path.join(ROOT, '../bw-pangyo-link-data/cop_N37E127.tif'))
lat0, lon0 = 37.3665, 127.10835
kx, kz = math.cos(math.radians(lat0)) * 111320, 110540
A = np.array(Image.open(TIF)).astype(float)  # 3600x3600, 1" 간격, 좌상단 N38 E127

def cop(x, z):  # 이중선형
    lon, lat = lon0 + x / kx, lat0 - z / kz
    c, r = (lon - 127) * 3600 - 0.5, (38 - lat) * 3600 - 0.5
    c0, r0 = int(math.floor(c)), int(math.floor(r)); fc, fr = c - c0, r - r0
    v = A[r0:r0 + 2, c0:c0 + 2]
    return float(v[0, 0] * (1 - fc) * (1 - fr) + v[0, 1] * fc * (1 - fr) + v[1, 0] * (1 - fc) * fr + v[1, 1] * fc * fr)

def resample(pts, step=2.0):
    rs = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, int(L / step))
        for k in range(1, n + 1): rs.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    return rs

def section(rs, i, ch_half=12, bank=(35, 71)):  # 수로 최저 / 둑 중앙값
    x, z = rs[i]; a, b = rs[max(0, i - 5)], rs[min(len(rs) - 1, i + 5)]
    L = math.hypot(b[0] - a[0], b[1] - a[1]); nx, nz = (b[1] - a[1]) / L, -(b[0] - a[0]) / L
    ch = min(cop(x + nx * d, z + nz * d) for d in range(-ch_half, ch_half + 1, 3))
    bk = float(np.median([cop(x + nx * d, z + nz * d) for d in list(range(-bank[1] + 1, -bank[0] + 1, 5)) + list(range(bank[0], bank[1], 5))]))
    return ch, bk

out = {'tif': os.path.basename(TIF), 'streams': {}, 'tancheon': []}
# 1) 판교 지류 (OSM 축, data/osm_pangyo_raw.json) — 50m(2m×25) 마다, x < -600 (판교 bbox 서쪽 밖) 제외
j = json.load(open(os.path.join(ROOT, 'data/osm_pangyo_raw.json')))
ways = {e['id']: e for e in j['elements'] if e['type'] == 'way'}
for wid, name in [(429222895, '운중천'), (437907484, '금토천')]:
    rs = resample([((g['lon'] - lon0) * kx, -(g['lat'] - lat0) * kz) for g in ways[wid]['geometry']])
    rel = []
    for i in range(0, len(rs), 25):
        if rs[i][0] < -600: continue
        ch, bk = section(rs, i); rel.append(round(bk - ch, 1))
    out['streams'][name] = {'osm': wid, 'reliefM': rel}
# 2) 탄천 본류 수로 최저 고도 (합친 축, 200m 마다) — 흐름 방향(축 번호가 커지는 쪽 = 북쪽 = 하류) 확인
T = json.load(open(os.path.join(ROOT, 'public/terrain.json'))); E = json.load(open(os.path.join(ROOT, 'public/corridor/tancheon.json')))
ax = T['axis'][:E['from']] + E['axis']  # = src/corridor/tancheon.js mergeTancheon
for i in range(0, len(ax), 100):
    rs = ax[max(0, i - 6):i + 7]
    if len(rs) < 11: continue
    ch, bk = section(rs, len(rs) // 2 if i >= 6 else i, ch_half=15, bank=(45, 81))
    out['tancheon'].append({'i': i, 'x': round(ax[i][0]), 'z': round(ax[i][1]), 'channelEl': round(ch, 1), 'bankEl': round(bk, 1)})
print(json.dumps(out, ensure_ascii=False))
