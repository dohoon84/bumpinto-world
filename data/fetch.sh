#!/bin/bash
# Overpass 재시도 스크립트 (지수 백오프)
cd "$(dirname "$0")"
# 사용법: fetch.sh [쿼리파일] [출력파일]  (기본: query.overpassql -> osm_raw.json)
Q=${1:-query.overpassql}; OUT=${2:-osm_raw.json}
w=10
for i in 1 2 3 4 5 6 7 8; do
 for u in https://overpass-api.de/api/interpreter https://overpass.kumi.systems/api/interpreter https://overpass.private.coffee/api/interpreter; do
  echo "try $i $u"
  curl -s -m 150 -A "jeongja3d-proto (contact: local dev)" --data-urlencode data@$Q $u -o tmp.json
  if python3 -c "import json,sys;d=json.load(open('tmp.json'));assert len(d['elements'])>20;print('OK',len(d['elements']))"; then mv tmp.json $OUT; exit 0; fi
 done
 sleep $w; w=$((w*2))
done
exit 1
