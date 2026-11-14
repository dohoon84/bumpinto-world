#!/usr/bin/env python3
"""[place-guide] 남대문시장 여행 가이드 데이터 → 게임용 place-guide/1 JSON.

입력: 리서치 데이터(namdaemun-guide.json, EN/KO + 출처) — 기본 /workspace/ndm-guide/namdaemun-guide.json (NDM_GUIDE_SRC 로 바꿈)
출력: public/guides/namdaemun.json  (src/guides/placeGuide.js 가 읽는 일반 형식. 다른 랜드마크도 같은 형식 JSON 만 만들면 된다)

- 모든 표시 문자열은 {en, ko}. 출처는 항목마다 src:[{t,u,c}] (제목·URL·확인일).
- 출처가 서로 다른 값(variants)은 warn + sheet(값마다 출처) 로 남긴다 — 하나를 조용히 고르지 않는다.
- 'secondary' / 'secondary-unverified' 는 muted / '?' 표시.
- spots: 게임 안 목적지. 게임의 남대문시장은 실제 시장의 동쪽 끝(신세계 옆) 몇 골목뿐이라, OSM 주소점(±30 m)을
  놀 수 있는 시장 골목 범위로 줄여 옮기고 가장 가까운 골목 위로 붙인다(placement: 'schematic'). 좌표 없는 곳은 'manual'.
  거리는 여기 적지 않는다 — 게임이 실제 길(보행 그래프) 길이로 잰다.
"""
import json, math, os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(os.environ.get('NDM_GUIDE_SRC', '/workspace/ndm-guide/namdaemun-guide.json'))
OUT = ROOT / 'public/guides/namdaemun.json'
MD = ROOT / 'public/corridor/myeongdong/myeongdong.json'
CENTER = {'lat': 37.3665, 'lon': 127.10835}
KX = math.cos(math.radians(CENTER['lat'])) * 111320
KZ = 110540

D = json.load(open(SRC))
md = json.load(open(MD))

def P(lat, lng):
    return [(lng - CENTER['lon']) * KX, -(lat - CENTER['lat']) * KZ]

def src(lst):
    out = []
    for s in lst or []:
        if not s or not s.get('url'):
            continue
        out.append({'t': s.get('title', ''), 'u': s['url'], 'c': s.get('checked', '')})
    return out

def T(o):
    if o is None:
        return None
    if isinstance(o, str):
        return {'en': o, 'ko': o}
    return {'en': o.get('en', ''), 'ko': o.get('ko', o.get('en', ''))}

def first_sentence(s):
    s = s.strip()
    for sep in ['. ', '.\u00a0']:
        i = s.find(sep)
        if i > 0:
            return s[:i + 1]
    return s

def fs(o):
    o = T(o)
    return {'en': first_sentence(o['en']), 'ko': first_sentence(o['ko'].replace('. ', '.\u00a0', 0)) if o['ko'] else ''}

def ko_first(s):
    i = s.find('. ')
    if i < 0:
        i = s.find('다. ')
        return s if i < 0 else s[:i + 2]
    return s[:i + 1]

def lead(o):
    o = T(o)
    return {'en': first_sentence(o['en']), 'ko': ko_first(o['ko'])}

def sheet_from_variants(v, title):
    rows = []
    for x in v.get('variants', []):
        val = x.get('value') if 'value' in x else {k: x[k] for k in x if k not in ('sources',)}
        if isinstance(val, dict) and ('en' in val or 'ko' in val):
            val = T(val)
        elif isinstance(val, dict):
            val = T(' · '.join(f"{k}: {T(vv)['en'] if isinstance(vv, dict) else vv}" for k, vv in val.items()))
        else:
            val = T(str(val))
        rows.append({'value': val, 'src': src(x.get('sources'))})
    return {'title': T(title), 'note': T(v.get('conflict_note')) if v.get('conflict_note') else None, 'rows': rows}

REG = {s['id']: s for s in D['meta'].get('source_registry', [])}
checked = D['meta']['checked']

# ---------------------------------------------------------------- spots (게임 안 자리)
ways = [w for w in md['ways'] if w['k'] in ('residential', 'footway', 'pedestrian', 'service', 'living_street')]
MK = {'x0': -11524, 'x1': -11352, 'z0': -21530, 'z1': -21305}
segs = []
for w in ways:
    for a, b in zip(w['pts'], w['pts'][1:]):
        mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        if MK['x0'] <= mx <= MK['x1'] and MK['z0'] <= mz <= MK['z1']:
            segs.append((a, b, w.get('n') or ''))

def snap(x, z):
    best = None
    for a, b, n in segs:
        dx, dz = b[0] - a[0], b[1] - a[1]
        L2 = dx * dx + dz * dz or 1e-9
        t = max(0.05, min(0.95, ((x - a[0]) * dx + (z - a[1]) * dz) / L2))
        px, pz = a[0] + dx * t, a[1] + dz * t
        d = math.hypot(px - x, pz - z)
        if best is None or d < best[0]:
            best = (d, px, pz, n)
    return best

HS = {h['id']: h for h in D['hotspots']['items']}
real_ids = ['kalguksu', 'galchi', 'children', 'womens', 'bedding', 'camera', 'stationery']
R = {k: P(HS[k]['lat'], HS[k]['lng']) for k in real_ids}
rx0 = min(v[0] for v in R.values()); rx1 = max(v[0] for v in R.values())
rz0 = min(v[1] for v in R.values()); rz1 = max(v[1] for v in R.values())
G = {'x0': -11512, 'x1': -11372, 'z0': -21512, 'z1': -21320}
def compress(x, z):
    return [G['x0'] + (x - rx0) / (rx1 - rx0) * (G['x1'] - G['x0']), G['z0'] + (z - rz0) / (rz1 - rz0) * (G['z1'] - G['z0'])]

ZN = {z['id']: z for z in D['zones']['items']}
FD = {f['id']: f for f in D['food']['items']}
spots = []
used = []
def add_spot(sid, name, x, z, placement, hours=None, s=None, kind='zone'):
    d, px, pz, street = snap(x, z)
    # 같은 골목 자리에 겹치면 골목을 따라 조금 민다
    for _ in range(8):
        if all(math.hypot(px - ux, pz - uz) > 14 for ux, uz in used):
            break
        x += 9; z += 6
        d, px, pz, street = snap(x, z)
    used.append((px, pz))
    spots.append({'id': sid, 'name': T(name), 'x': round(px, 1), 'z': round(pz, 1), 'placement': placement, 'street': street,
                  'kind': kind, 'hours': HRS(hours), 'src': s or []})

def HRS(h):
    if not h: return None
    return {'en': h, 'ko': h.replace('(varies by shop)', '(가게마다 다름)')}

FOOD_NAME = lambda f: {'en': f['name']['en'].split(' (')[0], 'ko': f['name']['ko'].split(' (')[0]}
for k in real_ids:
    x, z = compress(*R[k])
    if k in FD:
        f = FD[k]
        add_spot(k, FOOD_NAME(f), x, z, 'schematic', (f.get('hours') or {}).get('value'), src(HS[k].get('sources')), 'food')
    else:
        zz = ZN[k]
        add_spot(k, zz['name'], x, z, 'schematic', None, src(HS[k].get('sources')), 'zone')
# 안경거리(남대문시장2가길, 좌표 없음) → 숭례문 쪽(서쪽) 끝 골목에 수동 배치
add_spot('glasses', ZN['glasses']['name'], -11512, -21437, 'manual', None, src(ZN['glasses'].get('sources')), 'zone')

# ---------------------------------------------------------------- 영업 상태
odr = D['hours']['derived_open_now_rule']
status = {
    'tz': 'Asia/Seoul',
    'rules': odr['rules'],
    'labels': {k: T(v) for k, v in odr['labels'].items()},
    'closed': {'en': 'Closed Sundays', 'ko': '일요일 휴무'},
    'note': T(odr['note']),
    'src': src(odr.get('sources')),
}

def rng(v):
    import re
    d = v.split(' · ')[0]
    ts = re.findall(r'\d?\d:\d\d', d)
    if len(ts) >= 2:
        return f"{ts[0].zfill(5)}–{ts[-1].zfill(5)}"
    return None

BB = {b['key']: b for b in D['hours']['by_building_type']}
hours_rows = []
for k, lab in [('accessories', {'en': 'Accessories', 'ko': '액세서리 상가'}), ('children', {'en': "Children's clothing (day)", 'ko': '아동복 상가 (주간)'}), ('kitchenware', {'en': 'Kitchenware (3F)', 'ko': '주방용품 (3층)'}), ('imports', {'en': 'Imported goods', 'ko': '수입상가'})]:
    b = BB[k]
    hours_rows.append({'label': lab, 'cells': [rng(b['weekday']) or '—', rng(b['saturday']) or '—'], 'src': src(b.get('sources'))})

gen = D['hours']['general']
exits = D['getting_there']['subway']['exits']

# ---------------------------------------------------------------- 탭
def zone_item(z, n):
    meta = []
    if z.get('location'):
        meta.append({'text': T(z['location'])})
    elif z.get('address_ko'):
        meta.append({'text': {'en': z['address_ko'], 'ko': z['address_ko']}})
    g = z.get('gate')
    gate = None
    if g:
        gate = {'value': g['value'], 'unverified': 'unverified' in (g.get('confidence') or ''), 'note': T(g.get('note')), 'src': src(g.get('sources'))}
    sid = z['id'] if any(s['id'] == z['id'] for s in spots) else None
    tip = T(z.get('tip')) if z.get('tip') else None
    return {'n': n, 'title': T(z['name']), 'desc': T(z['goods']), 'meta': meta, 'gate': gate, 'go': sid, 'tip': tip, 'src': src(z.get('sources'))}

zone_order = ['children', 'womens', 'bedding', 'camera', 'stationery', 'glasses', 'accessories', 'kitchenware', 'ginseng', 'flowers', 'imports', 'souvenir', 'military']
spot_num = {s['id']: i + 1 for i, s in enumerate(spots)}
zones_list = []
for zid in zone_order:
    z = ZN[zid]
    it = zone_item(z, spot_num.get(zid))
    zones_list.append(it)

def food_item(f, n):
    meta = []
    walk = f.get('walk')
    if walk:
        meta.append({'text': T(walk)})
    h = f.get('hours')
    if h and h.get('value'):
        meta.append({'text': HRS(h['value']), 'num': True, 'src': src(h.get('sources'))})
    loc = f.get('location')
    sheet = None
    if loc and loc.get('variants'):
        sheet = sheet_from_variants(loc, {'en': f['name']['en'] + ' – address', 'ko': f['name']['ko'] + ' – 주소'})
        meta.append({'text': {'en': 'Address differs by source', 'ko': '주소 출처 상이'}, 'warn': True, 'sheet': sheet})
    elif h and h.get('confidence') == 'secondary':
        meta.append({'text': {'en': 'secondary source', 'ko': '2차 출처'}, 'muted': True})
    sid = f['id'] if any(s['id'] == f['id'] for s in spots) else None
    return {'n': n, 'title': FOOD_NAME(f), 'alt': {'en': f['name']['ko'].split(' (')[0], 'ko': f.get('romanization') or ''}, 'desc': lead(f['desc']), 'meta': meta, 'go': sid, 'src': src(f.get('sources'))}

food_order = ['galchi', 'kalguksu', 'hotteok', 'kkori', 'dakgomtang', 'naengmyeon', 'mandu', 'meokja']
food_list = [food_item(FD[k], i + 1) for i, k in enumerate(food_order) if k in FD]
# 호떡: 카메라거리 '야채호떡' 자리로 길 안내
for it in food_list:
    if it['title']['en'].startswith('Hotteok'):
        it['go'] = 'camera'

ph = D['phrases']['items']
pb = D['payment_and_bargaining']
etr = D['exchange_and_tax_refund']
fac = D['facilities']
acc = D['accessibility_and_safety']

say = [p for p in pb.get('phrases', []) if 'spicy' in p['en'].lower()] or pb.get('phrases', [])[:1]

overview_blocks = [
    {'type': 'lead', 'text': lead(D['overview']['summary'])},
    {'type': 'facts', 'only': 'desktop', 'items': [
        {'label': {'en': 'Shops', 'ko': '점포'}, 'value': '≈10,172', 'cap': {'en': 'official count', 'ko': '공식 집계'}, 'src': src(D['overview']['facts'][0]['sources'])},
        {'label': {'en': 'Since', 'ko': '시작'}, 'value': '1414', 'cap': {'en': 'Joseon, King Taejong', 'ko': '조선 태종 14년'}, 'src': src(D['overview']['history_sources'])},
        {'label': {'en': 'Nearest station', 'ko': '가까운 역'}, 'value': {'en': 'Hoehyeon', 'ko': '회현'}, 'line': '4',
         'cap': {'en': 'Exit 5·6·7, 5 min walk', 'ko': '5·6·7번 출구, 도보 5분'}, 'warn': True, 'sheet': sheet_from_variants(exits, {'en': 'Hoehyeon Station exits', 'ko': '회현역 출구'})},
    ]},
    {'type': 'facts', 'only': 'mobile', 'items': [
        {'label': {'en': 'Today', 'ko': '오늘'}, 'value': {'$today': True}, 'cap': {'en': 'accessory buildings', 'ko': '액세서리 상가 기준'}, 'src': src(BB['accessories']['sources'])},
        {'label': {'en': 'Closed', 'ko': '휴무'}, 'value': {'en': 'Sundays', 'ko': '일요일'}, 'cap': {'en': 'some street shops open', 'ko': '외향 점포 자율'}, 'src': src(D['hours']['closed_days']['sources'])},
        {'label': {'en': 'Subway', 'ko': '지하철'}, 'value': {'en': 'Hoehyeon', 'ko': '회현역'}, 'line': '4', 'cap': {'en': 'Exit 5·6·7, 5 min', 'ko': '5·6·7번 출구'}, 'sheet': sheet_from_variants(exits, {'en': 'Hoehyeon Station exits', 'ko': '회현역 출구'})},
        {'label': {'en': 'Payment', 'ko': '결제'}, 'value': {'en': 'Cash + card', 'ko': '현금 + 카드'}, 'cap': {'en': 'stalls: often cash', 'ko': '노점은 현금만'}, 'src': src(pb['cards']['sources'])},
        {'label': {'en': 'Tax free', 'ko': '즉시 환급'}, 'value': '≥ ₩15,000', 'cap': {'en': 'passport · < ₩1M', 'ko': '여권 · 100만 원 미만'}, 'src': src(etr['tax_refund']['sources'])},
    ]},
    {'type': 'table', 'title': {'en': 'Hours', 'ko': '영업시간'}, 'warn': {'en': 'Varies by building · sources differ', 'ko': '상가별 상이 · 출처 간 차이 있음'},
     'sheet': sheet_from_variants(gen, {'en': 'Market hours – every source', 'ko': '시장 영업시간 – 출처별'}),
     'head': [{'en': 'Building', 'ko': '상가'}], 'cols': [{'label': {'en': 'Mon–Fri', 'ko': '월–금'}, 'days': ['mon', 'tue', 'wed', 'thu', 'fri']}, {'label': {'en': 'Sat', 'ko': '토'}, 'days': ['sat']}],
     'rows': hours_rows[:3],
     'note': {'en': "Ranges = earliest open – latest close (night sessions not shown). Source: Merchants' association building table", 'ko': '시간 범위는 상가별 최초 개점–최종 마감(심야 영업 제외). 출처: 남대문시장 상인회 상가별 영업시간'},
     'src': src(BB['accessories']['sources'])},
    {'type': 'map', 'title': {'en': 'Zone map', 'ko': '구역 지도'}, 'note': {'en': 'Schematic · in-game placement', 'ko': '개략도 · 게임 속 배치'}},
]

zones_blocks = [
    {'type': 'map', 'only': 'desktop', 'title': {'en': 'Zone map', 'ko': '구역 지도'}, 'note': {'en': 'Schematic · in-game placement', 'ko': '개략도 · 게임 속 배치'}},
    {'type': 'list', 'title': {'en': 'Shop by zone', 'ko': '구역별 쇼핑'}, 'count': {'en': f'{len(zones_list)} zones', 'ko': f'{len(zones_list)}개 구역'},
     'note': T(D['zones']['gate_numbering_note']['text']), 'noteSrc': src(D['zones']['gate_numbering_note'].get('sources')), 'items': zones_list, 'mapThumb': True},
]
food_blocks = [
    {'type': 'list', 'title': {'en': 'Signature food', 'ko': '대표 먹거리'}, 'aside': T(D['food']['notes'][0]['text']), 'items': food_list},
    {'type': 'phrases', 'title': {'en': 'Say it', 'ko': '이렇게 말해 보세요'}, 'items': [{'ko': p['ko'], 'rom': p['rom'], 'en': p['en']} for p in say[:1]]},
]
eg = D['getting_there']['subway']['exit_guide']
gt_items = [{'n': None, 'line': '4', 'title': {'en': f"Exit {e['exit']}", 'ko': f"{e['exit']}번 출구"}, 'desc': T(e['text']),
             'meta': [{'text': {'en': 'secondary source' if 'unverified' not in e.get('confidence', '') else 'unverified', 'ko': '2차 출처' if 'unverified' not in e.get('confidence', '') else '미확인'}, 'muted': True}], 'src': src(e.get('sources'))} for e in eg]
gt = D['getting_there']
getting_blocks = [
    {'type': 'facts', 'items': [
        {'label': {'en': 'Subway', 'ko': '지하철'}, 'value': {'en': 'Hoehyeon (425)', 'ko': '회현역 (425)'}, 'line': '4', 'cap': {'en': 'Exit 5·6·7', 'ko': '5·6·7번 출구'}, 'warn': True, 'sheet': sheet_from_variants(exits, {'en': 'Hoehyeon Station exits', 'ko': '회현역 출구'})},
        {'label': {'en': 'Rail', 'ko': '기차'}, 'value': {'en': 'Seoul Stn', 'ko': '서울역'}, 'cap': {'en': '~5 min walk', 'ko': '도보 5분'}, 'src': src(gt['rail']['sources'])},
    ]},
    {'type': 'list', 'title': {'en': 'Which exit', 'ko': '출구 고르기'}, 'items': gt_items},
    {'type': 'text', 'title': {'en': 'Gate ≠ exit', 'ko': '게이트 ≠ 출구'}, 'text': T(gt['gate_vs_exit']['text']), 'src': src(gt['gate_vs_exit']['sources'])},
    {'type': 'text', 'title': {'en': 'Map apps', 'ko': '지도 앱'}, 'text': T(gt['map_apps']['text']), 'src': src(gt['map_apps']['sources']), 'muted': True},
]
tips_items = []
n = 1
for tpl in pb['tips']:
    tips_items.append({'n': n, 'title': T(tpl['text']), 'meta': [{'text': {'en': 'secondary source', 'ko': '2차 출처'}, 'muted': True}] if tpl.get('confidence') == 'secondary' else [], 'src': src(tpl.get('sources'))}); n += 1
tips_blocks = [
    {'type': 'text', 'title': {'en': 'Paying', 'ko': '결제'}, 'text': T(pb['cards']['text']), 'src': src(pb['cards']['sources'])},
    {'type': 'text', 'title': {'en': 'Tax refund', 'ko': '즉시 세금 환급'}, 'text': T(etr['tax_refund']['immediate']), 'src': src(etr['tax_refund']['sources']), 'volatile': True},
    {'type': 'list', 'title': {'en': 'Good to know', 'ko': '알아두면 좋아요'}, 'items': tips_items},
    {'type': 'phrases', 'title': {'en': 'Phrases', 'ko': '쓸 만한 말'}, 'items': [{'ko': p['ko'], 'rom': p['rom'], 'en': p['en']} for p in pb.get('phrases', [])[:4]]},
]
fac_items = [
    {'n': 1, 'title': {'en': 'Toilets', 'ko': '화장실'}, 'desc': {'en': ' · '.join(x['en'] for x in fac['toilets']['locations']), 'ko': ' · '.join(x['ko'] for x in fac['toilets']['locations'])}, 'meta': [{'text': T(fac['toilets']['also'])}], 'src': src(fac['toilets']['sources'])},
]
tic = fac['tourist_info'][0]
fac_items.append({'n': 2, 'title': T(tic['name']), 'desc': {'en': 'Free · ' + ', '.join(tic.get('languages', [])), 'ko': '무료 · ' + ', '.join(tic.get('languages', []))},
                  'meta': [{'text': {'en': 'Hours & address differ by source', 'ko': '시간·주소 출처 상이'}, 'warn': True, 'sheet': sheet_from_variants(tic, T(tic['name']))}], 'src': []})
fac_items.append({'n': 3, 'title': {'en': 'Rest area · nursing room', 'ko': '쉼터 · 수유실'}, 'desc': T(fac['rest_and_baby']['text']), 'meta': [], 'src': src(fac['rest_and_baby']['sources'])})
fac_items.append({'n': 4, 'title': {'en': 'Exchange · ATM', 'ko': '환전 · ATM'}, 'desc': {'en': ' · '.join(x['en'] for x in etr['exchange']['locations']), 'ko': ' · '.join(x['ko'] for x in etr['exchange']['locations'])}, 'meta': [{'text': T(etr['exchange']['note']), 'muted': True}], 'src': src(etr['exchange']['sources'])})
fac_blocks = [
    {'type': 'list', 'title': {'en': 'Facilities', 'ko': '편의시설'}, 'items': fac_items},
    {'type': 'text', 'title': {'en': 'Travel hotline', 'ko': '관광통역안내'}, 'text': {'en': D['overview']['travel_hotline']['value'] + ' – ' + D['overview']['travel_hotline']['label']['en'], 'ko': D['overview']['travel_hotline']['label']['ko']}, 'src': src(D['overview']['travel_hotline']['sources'])},
    {'type': 'text', 'title': {'en': 'Getting around', 'ko': '이동'}, 'text': T(acc['items'][0]['text']), 'src': src(acc['items'][0]['sources']), 'muted': True},
]

UI = D['ui_strings']['tabs']
tabs = [
    {'key': 'overview', 'label': T(UI['overview']), 'rail': {'en': 'Home', 'ko': '개요'}, 'icon': 'info', 'blocks': overview_blocks},
    {'key': 'zones', 'label': T(UI['zones']), 'rail': {'en': 'Zones', 'ko': '구역'}, 'icon': 'map', 'blocks': zones_blocks},
    {'key': 'food', 'label': T(UI['food']), 'rail': {'en': 'Food', 'ko': '먹거리'}, 'icon': 'utensils', 'blocks': food_blocks},
    {'key': 'getting_there', 'label': T(UI['getting_there']), 'rail': {'en': 'Go', 'ko': '가는 길'}, 'icon': 'train-front', 'blocks': getting_blocks},
    {'key': 'tips', 'label': T(UI['tips']), 'rail': {'en': 'Tips', 'ko': '팁'}, 'icon': 'lightbulb', 'blocks': tips_blocks},
    {'key': 'facilities', 'label': T(UI['facilities']), 'rail': {'en': 'WC · Info', 'ko': '편의'}, 'icon': 'toilet', 'blocks': fac_blocks},
]

out = {
    'schema': 'place-guide/1',
    'id': 'namdaemun',
    'checked': checked,
    'status_note': 'Research draft – volatile items must be re-checked before shipping (see meta.status of the source data).',
    'name': T(D['overview']['name']),
    'sub': {'en': 'Jung-gu, Seoul', 'ko': '서울 중구 남대문시장4길 21'},
    'summary': T(D['overview']['tagline']),
    'brand': {'en': 'Bumpinto World · Travel guide', 'ko': '범핀투월드 · 여행 가이드'},
    'prompt': {'title': T(D['ui_strings']['prompt_bubble']), 'sub': T(D['ui_strings']['prompt_sub'])},
    'status': status,
    'footer': {'sources': {'en': 'Assoc. table · VisitKorea · Visit Seoul', 'ko': '상인회 표 · VisitKorea · Visit Seoul'}, 'soon': T(D['ui_strings']['lang_soon'])},
    'takeMeThere': T(D['ui_strings']['take_me_there']),
    'defaultSpot': 'kalguksu',
    'tabs': tabs,
    'spots': spots,
    'anchors': {
        'region': {'x': -11420, 'z': -21430, 'r': 260},
        'gate': {'x': -11364.0, 'z': -21463.9, 'r': 9},
        'board': {'x': -11357.6, 'z': -21458.6, 'face': [-11364.0, -21463.9]},
        'npc': {'x': -11360.6, 'z': -21468.2, 'face': [-11352, -21472]},
        'near': 4.5,
    },
    'route': {'pace': 75, 'note': {'en': 'Distance = walking path in the game. Spots are placed schematically – the game market is a compressed corner of the real one.', 'ko': '거리 = 게임 속 걷는 길 기준. 목적지는 개략 배치(게임 속 시장은 실제 시장을 줄여 놓은 것).'}},
    'sources': [{'t': s.get('title', ''), 'u': s['url'], 'c': s.get('checked', checked)} for s in D['meta'].get('source_registry', []) if s.get('url')],
}
OUT.parent.mkdir(parents=True, exist_ok=True)
json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('wrote', OUT, OUT.stat().st_size, 'bytes ·', len(spots), 'spots')
for s in spots:
    print(' ', s['id'], s['x'], s['z'], s['street'], s['placement'])
