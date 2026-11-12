// 한강 지형 bake gzip 풀기 + 디코드는 워커에서 해서 메인 스레드 롱태스크를 피한다.
import { decodeHangangTerrainBakeBytes } from './hangangMeshBake.js';

self.onmessage = async (e) => {
  try {
    const buffer = e.data?.buffer;
    if (!buffer) {
      self.postMessage({ ok: false, error: 'no buffer' });
      return;
    }
    const bake = await decodeHangangTerrainBakeBytes(buffer);
    const xfer = [];
    for (const m of bake.meshes || []) {
      if (m.position?.buffer) xfer.push(m.position.buffer);
      if (m.color?.buffer) xfer.push(m.color.buffer);
      if (m.uv?.buffer) xfer.push(m.uv.buffer);
      if (m.index?.buffer) xfer.push(m.index.buffer);
    }
    self.postMessage({ ok: true, bake }, xfer);
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message ? err.message : err) });
  }
};
