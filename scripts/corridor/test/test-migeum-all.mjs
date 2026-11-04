// [migeum-roads] 미금 기능 테스트 묶음(corridor:test 끝): 있는 것만 차례로. 순서: 공유 차도 그래프 → 택시·자전거(#24) → NPC(#26)
//   package.json corridor:test 줄을 두 브랜치에서 같게 두려고 하나로 묶었다(어느 쪽이 먼저 머지돼도 그 줄은 충돌하지 않음)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const LIST = ['test-migeum-roads.mjs', 'test-migeum-taxibike.mjs', 'test-migeum-npc.mjs'];
const ran = [];
for (const f of LIST) {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) continue;
  execFileSync(process.execPath, [p], { stdio: 'inherit' });
  ran.push(f);
}
if (!ran.includes('test-migeum-roads.mjs')) { console.error('test-migeum-roads.mjs 없음'); process.exit(1); }
console.log('test-migeum-all:', ran.join(' · '));
