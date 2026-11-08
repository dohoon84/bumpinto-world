// [perf-memory] 메모리·draw call 최적화 플래그. 기본은 켜짐, ?perfmem=0 이면 전부 꺼져 예전과 완전히 같다.
//   ?lazyregion=0  지역(판교·미금…) 지연 로드/해제 끔
//   ?meshmerge=0   정적 소품 병합 + 자전거·아바타 인스턴싱 끔
//   ?matshare=0    병합할 때 같은 값의 재질 묶기 끔 (재질 '정체성' 기준으로만 묶음)
//   ?propcull=0    화면에서 1px 도 안 되는 먼 소품 숨기기 끔
export const PERF_FLAGS = ['lazyregion', 'meshmerge', 'matshare', 'propcull'];
export function perfFlags(search = typeof location !== 'undefined' ? location.search : '') {
  const q = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const master = q.get('perfmem') !== '0';
  const out = { master };
  for (const k of PERF_FLAGS) out[k] = master && q.get(k) !== '0';
  return out;
}
