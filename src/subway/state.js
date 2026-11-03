// [subway] 지하철역 들어가기/나오기 상태 (순수 로직, three·DOM 없음 → scripts/test-subway.mjs)
//
//   outside ─enter(ref)→ entering(바깥 화면 페이드 아웃) ─load→ arriving(대합실 페이드 인) → inside
//   inside ─openChooser→ choosing ─choose(ref)→ leaving(대합실 페이드 아웃) ─unload→ returning(바깥 페이드 인) → outside
//   choosing ─cancel→ inside
//   대합실을 그리는 단계: arriving · inside · choosing · leaving   (그동안 바깥 월드는 갱신·렌더 안 함)
export const FADE_SEC = 0.38;

export function createSubwayState({ fade = FADE_SEC, exits = [] } = {}) {
  let phase = 'outside', t = 0, entryRef = null, targetRef = null, pick = 0;
  const refs = () => exits.map((e) => e.id);
  const s = {
    get phase() { return phase; },
    get entry() { return entryRef; },
    get target() { return targetRef; },
    get pick() { return pick; },
    get active() { return phase !== 'outside'; },
    // 바깥 이동 입력을 막아야 하는 동안 (페이드 포함)
    get busy() { return phase !== 'outside'; },
    get interior() { return phase === 'arriving' || phase === 'inside' || phase === 'choosing' || phase === 'leaving'; },
    get canWalk() { return phase === 'inside'; },
    // 0 = 맑음, 1 = 검은 화면
    fadeAlpha() {
      if (phase === 'entering' || phase === 'leaving') return Math.min(1, t / fade);
      if (phase === 'arriving' || phase === 'returning') return Math.max(0, 1 - t / fade);
      return 0;
    },
    enter(id) {
      if (phase !== 'outside') return false;
      if (exits.length && !refs().includes(id)) return false;
      entryRef = id; targetRef = null; phase = 'entering'; t = 0;
      return true;
    },
    openChooser() {
      if (phase !== 'inside') return false;
      phase = 'choosing';
      const i = refs().indexOf(entryRef); pick = i >= 0 ? i : 0; // 기본 강조 = 들어온 출구
      return true;
    },
    move(d) { if (phase === 'choosing' && exits.length) pick = (pick + d + exits.length) % exits.length; return pick; },
    cancel() { if (phase !== 'choosing') return false; phase = 'inside'; return true; },
    choose(id = refs()[pick]) {
      if (phase !== 'choosing' && phase !== 'inside') return false;
      if (exits.length && !refs().includes(id)) return false;
      targetRef = id ?? entryRef; phase = 'leaving'; t = 0;
      return true;
    },
    // [subway] 열차로 다른 역에 내림: 떠난 역은 조용히 바깥(대합실 없음)으로, 도착 역은 바로 안(들어온 출구 없음)으로
    leaveByTrain() { if (phase !== 'inside') return false; phase = 'outside'; entryRef = null; targetRef = null; t = 0; return true; },
    arriveByTrain() { if (phase !== 'outside') return false; phase = 'inside'; entryRef = null; targetRef = null; t = 0; return true; },
    // dt 초 진행. 반환: 이번에 일어난 이벤트 배열 ('load' | 'ready' | 'unload' | 'done')
    tick(dt) {
      const ev = [];
      if (phase === 'outside' || phase === 'inside' || phase === 'choosing') return ev;
      t += dt;
      if (t < fade) return ev;
      t = 0;
      if (phase === 'entering') { phase = 'arriving'; ev.push('load'); }
      else if (phase === 'arriving') { phase = 'inside'; ev.push('ready'); }
      else if (phase === 'leaving') { phase = 'returning'; ev.push('unload'); }
      else if (phase === 'returning') { phase = 'outside'; ev.push('done'); }
      return ev;
    },
  };
  return s;
}
