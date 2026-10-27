#!/usr/bin/env python3
"""OSM API /map XML -> Overpass 'out body geom' 형식 JSON (Overpass 서버가 바쁠 때 대체용)."""
import json, sys, xml.etree.ElementTree as ET
# 사용법: osmxml_to_overpass.py [출력.json] [입력1.xml 입력2.xml ...]  (여러 XML 병합, 중복 id 제거)
dst = sys.argv[1] if len(sys.argv) > 1 else 'data/osm_raw_osmapi.json'
srcs = sys.argv[2:] or ['data/osm_api_map.xml', 'data/osm_api_tancheon_full.xml']
roots = [ET.parse(s).getroot() for s in srcs]
class R:  # 여러 루트를 하나처럼 순회 (id 중복 제거)
    def findall(self, tag):
        seen = set()
        for r in roots:
            for e in r.findall(tag):
                if e.get('id') in seen: continue
                seen.add(e.get('id')); yield e
root = R()
nodes, ways, out = {}, {}, []
tags = lambda e: {t.get('k'): t.get('v') for t in e.findall('tag')}
for n in root.findall('node'):
    nid = int(n.get('id')); nodes[nid] = (float(n.get('lat')), float(n.get('lon')))
    t = tags(n)
    if t: out.append({'type': 'node', 'id': nid, 'lat': nodes[nid][0], 'lon': nodes[nid][1], 'tags': t})
for w in root.findall('way'):
    refs = [int(r.get('ref')) for r in w.findall('nd')]
    geom = [{'lat': nodes[r][0], 'lon': nodes[r][1]} for r in refs if r in nodes]
    ways[int(w.get('id'))] = geom
    out.append({'type': 'way', 'id': int(w.get('id')), 'nodes': refs, 'geometry': geom, 'tags': tags(w)})
for r in root.findall('relation'):
    mem = []
    for m in r.findall('member'):
        d = {'type': m.get('type'), 'ref': int(m.get('ref')), 'role': m.get('role')}
        if d['type'] == 'way' and d['ref'] in ways: d['geometry'] = ways[d['ref']]
        mem.append(d)
    out.append({'type': 'relation', 'id': int(r.get('id')), 'members': mem, 'tags': tags(r)})
json.dump({'version': 0.6, 'generator': 'osmxml_to_overpass.py (from api.openstreetmap.org /map)',
           'osm3s': {'copyright': 'The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.'},
           'elements': out}, open(dst, 'w'), ensure_ascii=False)
print(dst, len(out))
