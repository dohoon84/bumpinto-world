// [ui-v2] 화면들이 같이 쓰는 값: 열린 역 수(지구본과 같은 규칙), 위성 관측 집계, 마지막 역(이어하기).
import { OPEN_REGIONS, UPCOMING_REGIONS, getRegion, countryOf } from '../regions/index.js';
import { corridorGlobeEnabled, CORRIDOR_STATION_IDS, OPEN_BRANCH_IDS, OPEN_MAINLINE_STATIONS, OPEN_BRANCH_STATIONS, corridorStationLabel } from '../corridor/globeCorridor.js';
import { isStarbaseLive, phoneStatsUrl } from '../worldGate.js';
import { isEn, tr } from '../i18n.js';

export const corridorOn = () => corridorGlobeEnabled(new URLSearchParams(location.search), getRegion('jeongja'));

/** worldGate.renderGateLocale 과 같은 셈: 열린 역 수(본선 + 지선 + 다른 지역 역), 나라별 열림/준비중 */
export function regionSummary() {
  const live = isStarbaseLive();
  const cor = corridorOn();
  const stationsOf = (r) => (cor && r.features?.corridor ? OPEN_MAINLINE_STATIONS.length : (r.stations?.length || 1));
  const by = {};
  const add = (c, k, n) => { (by[c] ||= { open: 0, soon: 0 })[k] += n; };
  for (const r of OPEN_REGIONS) add(countryOf(r), live || r.id !== 'starbase' ? 'open' : 'soon', stationsOf(r));
  if (cor) for (const r of UPCOMING_REGIONS.filter((x) => OPEN_BRANCH_IDS.has(x.id))) add(countryOf(r), 'open', 1);
  for (const r of UPCOMING_REGIONS.filter((x) => !(cor && (CORRIDOR_STATION_IDS.has(x.id) || OPEN_BRANCH_IDS.has(x.id))))) add(countryOf(r), 'soon', 1);
  const open = OPEN_REGIONS.filter((r) => live || r.id !== 'starbase').reduce((n, r) => n + stationsOf(r), 0) + (cor ? OPEN_BRANCH_STATIONS.length : 0);
  return { open, by, live, cor };
}

/** 위성 관측(LIVE) 집계: 지구본과 같은 /stats. 로컬이면 '로컬 모드 · 집계 제외' / '테스트 환경' */
export async function fetchLiveStats() {
  const live = isStarbaseLive();
  let online = 0, residents = 0, any = false;
  for (const r of OPEN_REGIONS) {
    if (r.id === 'starbase' && !live) continue;
    const url = phoneStatsUrl(r.id);
    if (!url) continue;
    try {
      const j = await (await fetch(url, { cache: 'no-store' })).json();
      if (!j?.ok) continue;
      any = true;
      online += Math.max(0, Number(j.online || 0));
      residents += Math.max(0, Number(j.residents || 0));
    } catch { /* 조용히 무시 (지구본과 같음) */ }
  }
  if (!any) return { any, a: tr('로컬 모드 · 집계 제외', 'Local Mode · Offline'), b: tr('테스트 환경', 'Test Env') };
  return {
    any,
    a: online > 0 ? tr(`${online}명 활동 중`, `${online} active`) : tr('0명 · 첫 산책자 대기 중', '0 · Waiting for explorers'),
    b: isEn() ? residents.toLocaleString() : `${residents.toLocaleString()}명`,
  };
}

/** '🛰️ 위성 실시간 관측 · 정자동 (37.37°N)' → '위성 실시간 관측 · 정자동 (37.37°N)' (이모지만 뺀다, 문구는 지구본 값 그대로) */
export function telemetryText(region) {
  const t = isEn() ? (region.enTelemetryLabel || region.telemetryLabel) : region.telemetryLabel;
  return String(t || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

// ---- 마지막 역 (이 기기 localStorage) ----
const LAST_KEY = 'bw.uiv2.lastStation';
export function saveLastStation(regionId, at) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ region: regionId || 'jeongja', at: at || null, t: Date.now() })); } catch {}
}
export function readLastStation() {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
    if (!v || typeof v.region !== 'string') return null;
    const region = getRegion(v.region);
    if (!region || region.id !== v.region) return null;
    return { region: region.id, at: typeof v.at === 'string' ? v.at : null, label: stationLabel(region.id, v.at) };
  } catch { return null; }
}

/** 화면에 쓰는 역 이름. 정자 지역 + at 이면 그 역('서현역'), 아니면 지역 대표 이름('정자역' / 'Starbase, TX') */
export function stationLabel(regionId, at) {
  const en = isEn();
  const st = at && regionId === 'jeongja' ? corridorStationLabel(at) : null;
  if (st) return en ? st.en : st.ko;
  if (regionId === 'jeongja') return en ? 'Jeongja Station' : '정자역';
  const r = getRegion(regionId);
  return en ? (r.enShortName || r.enName || r.name) : (r.shortName || r.name);
}

/** 역 칩의 노선 배지 */
const LINE_BADGE = { '신분당선': ['#d31145', 'Shinbundang'], '수인분당선': ['#c47f00', 'Suin-Bundang'], '8호선': ['#e6186c', 'Line 8'], '2호선': ['#33a23d', 'Line 2'] };
export function stationLines(regionId, at, stations = []) {
  if (regionId !== 'jeongja') return [];
  const s = at ? stations.find((x) => x.id === at) : null;
  const lines = s?.lines || (at ? [] : ['신분당선', '수인분당선']);
  return lines.filter((l) => LINE_BADGE[l]).map((l) => ({ t: isEn() ? LINE_BADGE[l][1] : l, c: LINE_BADGE[l][0] }));
}
