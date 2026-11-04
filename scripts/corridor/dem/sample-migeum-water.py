#!/usr/bin/env python3
# [migeum-water] DEM 단면 샘플 — build-migeum-water.mjs 의 DEM 값 근거 (참고값 출력만, 파일 안 씀)
#   DEM: Copernicus GLO-30 DSM cop_N37E127.tif (sample-pangyo-water.py 와 같은 파일, 저장소에 넣지 않음). DSM 이라 나무·건물·다리 섞임
#   1) 돌마교(OSM 186410768) 상판 선 양끝 너머(제방 위 도로) 고도 vs 다리 아래 수로 최저
#   2) 미금 박스 안 라이브 terrain.json 탄천 축 50m 마다 둑 중앙값 − 수로 최저 (궁내교 같은 방식, ±15m 수로 / ±45~80m 둑)
#   사용: python3 scripts/corridor/dem/sample-migeum-water.py [--tif=…]
import json, math, os, sys
import numpy as np
from PIL import Image

arg = lambda k, d: next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith(f'--{k}=')), d)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
TIF = arg('tif', os.path.join(ROOT, '../bw-pangyo-link-data/cop_N37E127.tif'))
lat0, lon0 = 37.3665, 127.10835
kx, kz = math.cos(math.radians(lat0)) * 111320, 110540
A = np.array(Image.open(TIF)).astype(float)

def cop(x, z):
    lon, lat = lon0 + x / kx, lat0 - z / kz
    c, r = (lon - 127) * 3600 - 0.5, (38 - lat) * 3600 - 0.5
    c0, r0 = int(math.floor(c)), int(math.floor(r)); fc, fr = c - c0, r - r0
    v = A[r0:r0 + 2, c0:c0 + 2]
    return float(v[0, 0] * (1 - fc) * (1 - fr) + v[0, 1] * fc * (1 - fr) + v[1, 0] * (1 - fc) * fr + v[1, 1] * fc * fr)

T = json.load(open(os.path.join(ROOT, 'public/terrain.json')))
ax = T['axis']
BOX = (-500, 1000, 939.6, 2500)  # x0 x1 z0(liveBox z1) z1
out = {'tif': os.path.basename(TIF), 'axis': [], 'dolma': None, 'ref궁내교': None}
def sect(i, ch_half=15, bank=(45, 81)):
    a, b = ax[max(0, i - 5)], ax[min(len(ax) - 1, i + 5)]
    L = math.hypot(b[0] - a[0], b[1] - a[1]); nx, nz = (b[1] - a[1]) / L, -(b[0] - a[0]) / L
    x, z = ax[i]
    ch = min(cop(x + nx * d, z + nz * d) for d in range(-ch_half, ch_half + 1, 3))
    bk = float(np.median([cop(x + nx * d, z + nz * d) for d in list(range(-bank[1] + 1, -bank[0] + 1, 5)) + list(range(bank[0], bank[1], 5))]))
    return round(ch, 1), round(bk, 1)
for i in range(0, len(ax), 25):
    x, z = ax[i]
    if not (BOX[0] <= x <= BOX[1] and BOX[2] <= z <= BOX[3]): continue
    ch, bk = sect(i); out['axis'].append({'i': i, 'x': round(x), 'z': round(z), 'channelEl': ch, 'bankEl': bk, 'reliefM': round(bk - ch, 1)})
# 궁내교 근처(라이브 축, 같은 방식) — 게임 7.6m 와 맞는다고 본 기준
gi = min(range(len(ax)), key=lambda i: math.hypot(ax[i][0] - 50, ax[i][1] + 735))
ch, bk = sect(gi); out['ref궁내교'] = {'i': gi, 'channelEl': ch, 'bankEl': bk, 'reliefM': round(bk - ch, 1)}
# 돌마교: OSM 상판 양끝에서 바깥 20~40m(진입로) 고도, 다리 밑 축 ±15m 수로 최저
j = json.load(open(os.path.join(ROOT, 'data/osm_migeum_raw.json')))
w = next(e for e in j['elements'] if e['type'] == 'way' and e['id'] == 186410768)
P = [((g['lon'] - lon0) * kx, -(g['lat'] - lat0) * kz) for g in w['geometry']]
a, b = P[0], P[-1]; L = math.hypot(b[0] - a[0], b[1] - a[1]); ux, uz = (b[0] - a[0]) / L, (b[1] - a[1]) / L
appr = [cop(a[0] - ux * d, a[1] - uz * d) for d in range(20, 41, 5)] + [cop(b[0] + ux * d, b[1] + uz * d) for d in range(20, 41, 5)]
along = [round(cop(a[0] + ux * u, a[1] + uz * u), 1) for u in range(0, int(L) + 1, 10)]
ci = min(range(len(ax)), key=lambda i: min(math.hypot(ax[i][0] - (a[0] + ux * u), ax[i][1] - (a[1] + uz * u)) for u in range(0, int(L) + 1, 2)))
ch, bk = sect(ci)
out['dolma'] = {'len': round(L, 1), 'approachEl': round(float(np.median(appr)), 1), 'alongDSM': along, 'axisI': ci, 'channelEl': ch, 'bankEl': bk, 'deckToChannel': round(float(np.median(appr)) - ch, 1), 'reliefM': round(bk - ch, 1)}
print(json.dumps(out, ensure_ascii=False))
