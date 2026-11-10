// [gangnam-npc] 강남 보행·차량·횡단보도 데이터 → public/corridor/gangnam/npc.json
//   사용: node scripts/corridor/build-gangnam-npc.mjs [--out=public/corridor/gangnam/npc.json]
import fs from 'node:fs';
import path from 'node:path';
import { buildGangnamNpcData } from '../../src/gangnam/npc/rules.js';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.resolve(ROOT, arg('out', 'public/corridor/gangnam/npc.json'));
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const index = J('public/corridor/gangnam/index.json');
const tiles = Object.keys(index.tiles).sort().map((k) => J(`public/corridor/gangnam/tiles/${k}.json`));
const data = buildGangnamNpcData(tiles, index);
data.meta.generated = new Date().toISOString();
data.meta.attribution = '© OpenStreetMap contributors (ODbL)';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data));
console.log('gangnam npc.json', JSON.stringify(data.meta.stats), (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB', 'yeoksam', data.meta.yeoksamInside);
