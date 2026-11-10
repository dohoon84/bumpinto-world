import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gangnamStreetEnabled } from '../../../src/gangnam/streetDetail.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let n = 0;
const ok = (m) => console.log(`ok ${++n} ${m}`);

{
  assert.equal(gangnamStreetEnabled(''), true);
  assert.equal(gangnamStreetEnabled('?gstreet=0'), false);
  assert.equal(gangnamStreetEnabled('?gangnam=0'), false);
  ok('flags gstreet / gangnam');
}

{
  const j = J('public/corridor/gangnam/street.json');
  assert.ok(j.stops.length >= 20 && j.stops.length <= 80, `stops ${j.stops.length}`);
  const med = j.stops.filter((s) => s.kind === 'median');
  assert.ok(med.length >= 2 && med.length <= 12, `median ${med.length}`);
  assert.ok(med.some((s) => /강남역/.test(s.name) && s.toward === '신논현역'));
  assert.ok(med.some((s) => /강남역/.test(s.name) && s.toward === '강남역'));
  const brand = /스타벅스|나이키|삼성전자|애플|현대|cgv|뉴욕제과|GS타워|포스코|하나은행|교보|아가방|수협/i;
  for (const s of j.stops) {
    assert.ok(!brand.test(s.name), s.name);
    assert.ok(!/\d+\s*분/.test(s.routes.join(' ')));
    for (const r of s.routes) assert.ok(/^\d{2,5}$|^[가-힣]{1,2}\d{1,2}$/.test(r), r);
  }
  assert.ok(j.props.length >= 80 && j.props.length <= 400, `props ${j.props.length}`);
  assert.ok(j.waiters.length >= 20 && j.waiters.length <= 160, `waiters ${j.waiters.length}`);
  ok(`stops ${j.stops.length} median ${med.length} props ${j.props.length}`);
}

{
  const prev = J('public/corridor/gangnam/street.json');
  execFileSync('node', [path.join(ROOT, 'scripts/corridor/build-gangnam-street.mjs')], { cwd: ROOT, stdio: 'pipe' });
  const next = J('public/corridor/gangnam/street.json');
  delete prev.meta.generated; delete next.meta.generated;
  assert.deepEqual(prev, next);
  ok('street.json rebuilds deterministically');
}

console.log(`test-gangnam-street: ${n} ok`);
