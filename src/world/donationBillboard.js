// 정자역 출입구 & 광장 분수대 옆에 설치되는 '움직이는 LED 후원 전광판 + 하단 QR 전단지 키오스크'
import * as THREE from 'three';
import { DONATION_CONFIG } from '../donationConfig.js';
import { trackEvent } from '../analytics.js';

const INTERACT_RADIUS = 5.2;

function drawFinderPattern(ctx, x, y, cell) {
  ctx.fillStyle = '#111827';
  ctx.fillRect(x, y, cell * 7, cell * 7);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + cell, y + cell, cell * 5, cell * 5);
  ctx.fillStyle = '#111827';
  ctx.fillRect(x + cell * 2, y + cell * 2, cell * 3, cell * 3);
}

function drawStylizedQr(ctx, x, y, size) {
  const n = 21;
  const cell = size / n;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 6, y - 6, size + 12, size + 12);

  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = '#111827';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const inTL = r < 8 && c < 8;
      const inTR = r < 8 && c >= n - 8;
      const inBL = r >= n - 8 && c < 8;
      if (inTL || inTR || inBL) continue;
      if (rnd() < 0.48) {
        ctx.fillRect(x + c * cell, y + r * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  }
  drawFinderPattern(ctx, x, y, cell);
  drawFinderPattern(ctx, x + (n - 7) * cell, y, cell);
  drawFinderPattern(ctx, x, y + (n - 7) * cell, cell);
}

function createFlyerTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 720;
  const ctx = cv.getContext('2d');

  const renderPoster = (qrImg = null) => {
    // 1) 코르크/우드 보드 배경
    ctx.fillStyle = '#c89b6e';
    ctx.fillRect(0, 0, 512, 720);
    ctx.strokeStyle = '#6e4726';
    ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, 494, 702);

    // 2) 흰색/크림색 전단지 종이
    ctx.save();
    ctx.fillStyle = '#fffdf7';
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    ctx.fillRect(34, 38, 444, 644);
    ctx.restore();

    // 상단 마스킹 테이프 2개 (전단지 붙인 느낌)
    ctx.save();
    ctx.fillStyle = 'rgba(255, 224, 102, 0.85)';
    ctx.translate(110, 38);
    ctx.rotate(-0.12);
    ctx.fillRect(-48, -14, 96, 28);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(255, 224, 102, 0.85)';
    ctx.translate(402, 38);
    ctx.rotate(0.14);
    ctx.fillRect(-48, -14, 96, 28);
    ctx.restore();

    // 3) 전단지 상단 배너
    ctx.fillStyle = '#d4003b';
    ctx.fillRect(54, 62, 404, 74);
    ctx.fillStyle = '#ffe169';
    ctx.font = '900 35px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('☕ 서버비 후원 전단지', 256, 111);

    // 4) 안내 문구
    ctx.fillStyle = '#122033';
    ctx.font = 'bold 25px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.fillText('무료 오픈월드 인프라를 응원해 주세요!', 256, 174);
    ctx.fillStyle = '#485870';
    ctx.font = 'bold 19px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.fillText('QR 스캔 또는 가까이 와서 [F] 키 클릭', 256, 206);

    // 5) 중앙 QR코드 박스 (큼직하게 배치)
    ctx.strokeStyle = '#122033';
    ctx.lineWidth = 5;
    ctx.strokeRect(106, 228, 300, 300);
    if (qrImg) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(110, 232, 292, 292);
      ctx.drawImage(qrImg, 120, 242, 272, 272);
    } else {
      drawStylizedQr(ctx, 124, 246, 264);
    }

    // 6) 하단 토스(Toss) 안내 문구
    ctx.fillStyle = '#0064ff';
    ctx.font = '900 25px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.fillText(`💙 ${DONATION_CONFIG.payMethod}`, 256, 566);
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 18px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.fillText('스마트폰 카메라로 QR을 찍으면 토스 송금이 열립니다', 256, 602);

    // 7) 하단 절취선 문어발 조각 (전단지 감성)
    ctx.strokeStyle = '#94a3b8';
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(44, 626);
    ctx.lineTo(468, 626);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < 5; i++) {
      const sx = 54 + i * 82;
      if (i > 0) {
        ctx.strokeStyle = '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(sx, 626);
        ctx.lineTo(sx, 678);
        ctx.stroke();
      }
      ctx.fillStyle = '#d4003b';
      ctx.font = 'bold 14px "Pretendard", "Noto Sans KR", sans-serif';
      ctx.fillText('☕ 후원 QR', sx + 40, 650);
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('[F] 크게보기', sx + 40, 670);
    }
  };

  renderPoster(null);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  if (DONATION_CONFIG.qrImageUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      renderPoster(img);
      tex.needsUpdate = true;
    };
    img.src = DONATION_CONFIG.qrImageUrl;
  }

  return tex;
}

function createTickerRenderer() {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 384;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  let scrollX = 0;

  function draw(dt, t) {
    scrollX = (scrollX + dt * 165) % 2200;

    // LED 전광판 배경
    const grad = ctx.createLinearGradient(0, 0, 0, 384);
    grad.addColorStop(0, '#091326');
    grad.addColorStop(0.5, '#132647');
    grad.addColorStop(1, '#091326');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 384);

    // 네온 외곽 보더 (반짝임)
    const pulse = 0.65 + 0.35 * Math.sin(t * 4.5);
    ctx.strokeStyle = `rgba(255, 225, 105, ${pulse.toFixed(2)})`;
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, 1000, 360);

    // 상단 고정 헤더 배지
    ctx.fillStyle = '#d4003b';
    ctx.fillRect(36, 34, 350, 56);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 30px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('⚡ LIVE 인프라 후원 전광판', 54, 72);

    ctx.fillStyle = '#2bff7a';
    ctx.font = 'bold 26px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('● 24H 무료 서버 가동 중', 980, 70);

    // 중앙 흐르는 전광판 텍스트 (Marquee)
    ctx.save();
    ctx.beginPath();
    ctx.rect(28, 105, 968, 130);
    ctx.clip();

    ctx.fillStyle = '#ffe169';
    ctx.font = '900 54px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.textAlign = 'left';
    const msg = DONATION_CONFIG.tickerText;
    const msgW = ctx.measureText(msg).width || 1800;
    const offset = -(scrollX % msgW);
    ctx.fillText(msg, 40 + offset, 188);
    ctx.fillText(msg, 40 + offset + msgW, 188);
    ctx.restore();

    // 하단 안내 바
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(28, 252, 968, 98);

    ctx.fillStyle = '#74c0fc';
    ctx.font = 'bold 28px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(DONATION_CONFIG.subBannerText, 512, 294);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.fillText('👇 기둥 아래 QR 전단지를 스캔하거나 가까이 와서 [F] 키를 눌러주세요!', 512, 334);

    tex.needsUpdate = true;
  }

  draw(0, 0);
  return { tex, draw };
}

function buildBillboardUnit({ x, z, ry = 0 }, flyerTex, tickerTex) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;

  const darkMetal = new THREE.MeshLambertMaterial({ color: '#1e2736' });
  const frameMat = new THREE.MeshLambertMaterial({ color: '#2b384e' });
  const goldMat = new THREE.MeshBasicMaterial({ color: '#ffe169' });
  const redAccent = new THREE.MeshBasicMaterial({ color: '#ff3b30' });
  const screenMat = new THREE.MeshBasicMaterial({ map: tickerTex });
  const flyerMat = new THREE.MeshBasicMaterial({ map: flyerTex });

  // 1) 바닥 원형 받침대 & 기둥
  const basePad = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.18, 0.18, 20), darkMetal);
  basePad.position.y = 0.09;
  basePad.receiveShadow = true;
  const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.04, 20), goldMat);
  baseRing.position.y = 0.19;

  // 전광판 헤드만 돌아가고 하단 기둥은 전단지 아래까지만 세워 스크린 글자를 가리지 않게 함
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 2.75, 14), darkMetal);
  pole.position.y = 1.38;
  pole.castShadow = true;
  g.add(basePad, baseRing, pole);

  // 2) 하단 QR코드 전단지 게시판 (눈높이 1.35m, 앞·뒤 양면)
  const boardCase = new THREE.Mesh(new THREE.BoxGeometry(1.26, 1.68, 0.18), frameMat);
  boardCase.position.y = 1.38;
  boardCase.castShadow = true;
  g.add(boardCase);

  const posterGeo = new THREE.PlaneGeometry(1.12, 1.54);
  const posterFront = new THREE.Mesh(posterGeo, flyerMat);
  posterFront.position.set(0, 1.38, 0.095);
  const posterBack = new THREE.Mesh(posterGeo, flyerMat);
  posterBack.position.set(0, 1.38, -0.095);
  posterBack.rotation.y = Math.PI;
  g.add(posterFront, posterBack);

  // 전단지 위 작은 차양(비 가림막)
  constopyRoof: {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.08, 0.36), darkMetal);
    roof.position.set(0, 2.25, 0);
    const neonStrip = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.03, 0.38), goldMat);
    neonStrip.position.set(0, 2.21, 0);
    g.add(roof, neonStrip);
  }

  // 3) 상단 움직이는 대형 LED 전광판 (높이 3.35m, 좌우로 부드럽게 스윙하며 시선 집중)
  const ledHead = new THREE.Group();
  ledHead.position.y = 3.35;

  const screenBox = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.38, 0.28), darkMetal);
  screenBox.castShadow = true;
  const trimTop = new THREE.Mesh(new THREE.BoxGeometry(3.58, 0.06, 0.32), goldMat);
  trimTop.position.y = 0.71;
  const trimBot = new THREE.Mesh(new THREE.BoxGeometry(3.58, 0.06, 0.32), goldMat);
  trimBot.position.y = -0.71;

  const screenGeo = new THREE.PlaneGeometry(3.34, 1.24);
  const screenF = new THREE.Mesh(screenGeo, screenMat);
  screenF.position.z = 0.145;
  const screenB = new THREE.Mesh(screenGeo, screenMat);
  screenB.position.z = -0.145;
  screenB.rotation.y = Math.PI;

  ledHead.add(screenBox, trimTop, trimBot, screenF, screenB);

  // 4) 전광판 꼭대기 360° 회전하는 황금 코인/하트 비콘
  const topper = new THREE.Group();
  topper.position.y = 1.05;
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 20), goldMat);
  coin.rotation.x = Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 8, 24), redAccent);
  topper.add(coin, ring);
  ledHead.add(topper);

  g.add(ledHead);

  return {
    group: g,
    ledHead,
    topper,
    x,
    z,
    baseRy: ry,
    pickMeshes: [boardCase, posterFront, posterBack, screenBox, screenF, screenB],
  };
}

export function mountDonationBillboards({ scene, overlay, world, camera, domElement }) {
  const signX = world?.signPos?.x ?? -6.6;
  const signZ = world?.signPos?.z ?? 6.4;

  // 1) 정자역 출입구 캐노피 바깥쪽(플레이어 첫 스폰 정면 시야의 탁 트인 보도) + 2) 광장 버스킹 무대·빈백 라운지 옆 오픈 공간
  const SPOTS = [
    {
      id: 'station_entry',
      label: '☕ 인프라 후원 전광판 · QR 전단지 (클릭 / F)',
      x: signX + 3.1,
      z: signZ + 9.2,
      ry: 2.67,
    },
    {
      id: 'plaza_lounge',
      label: '☕ 인프라 후원 전광판 · QR 전단지 (클릭 / F)',
      x: -56.4,
      z: 36.2,
      ry: -0.75,
    },
  ];

  const flyerTex = createFlyerTexture();
  const ticker = createTickerRenderer();
  const units = [];
  const allPickMeshes = [];

  for (const s of SPOTS) {
    const u = buildBillboardUnit(s, flyerTex, ticker.tex);
    scene.add(u.group);
    units.push(u);
    allPickMeshes.push(...u.pickMeshes);
    if (overlay) {
      const item = overlay.add({
        cls: 'label donate-sign',
        text: s.label,
        getPos: () => new THREE.Vector3(s.x, 4.75, s.z),
        maxDist: 45,
        minDist: 0,
      });
      item.el.style.pointerEvents = 'auto';
      item.el.style.cursor = 'pointer';
      item.el.addEventListener('click', () => openModal('label_click'));
    }
  }

  // 하단 근처 접근 시 뜨는 '☕ 후원 전단지 크게 보기 (F)' 액션 버튼 및 모달 생성
  const nearBtn = document.createElement('button');
  nearBtn.id = 'donate-near-btn';
  nearBtn.type = 'button';
  nearBtn.hidden = true;
  nearBtn.innerHTML = '☕ 후원 QR 전단지 크게 보기 <kbd>F</kbd>';
  document.body.appendChild(nearBtn);

  const modal = document.createElement('div');
  modal.id = 'donate-modal';
  modal.hidden = true;
  document.body.appendChild(modal);

  let modalOpen = false;

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function renderModal() {
    if (!modalOpen) return;
    const pointsHtml = (DONATION_CONFIG.modalPoints || [])
      .map((pt) => `<li>${esc(pt)}</li>`)
      .join('');
    modal.innerHTML = `
      <div class="donate-backdrop" data-donate-close="1"></div>
      <section class="donate-dialog" role="dialog" aria-modal="true" aria-label="서버 인프라 후원 안내">
        <header class="donate-head">
          <div>
            <span class="donate-kicker">OPEN WORLD INFRASTRUCTURE SUPPORT</span>
            <h2>${esc(DONATION_CONFIG.modalTitle)}</h2>
          </div>
          <button type="button" class="donate-close" data-donate-close="1" aria-label="닫기">✕</button>
        </header>
        <div class="donate-body">
          <p class="donate-lead">${esc(DONATION_CONFIG.modalLead)}</p>
          <div class="donate-qr-card">
            <div class="donate-tape"></div>
            <span class="qr-badge toss">💙 ${esc(DONATION_CONFIG.payMethod)}</span>
            <div class="qr-frame large">
              <img src="${esc(DONATION_CONFIG.qrImageUrl)}" alt="토스 후원 QR코드" />
            </div>
            <small>스마트폰 기본 카메라 또는 토스(Toss) 앱으로 위 QR코드를 스캔해 주세요</small>
          </div>
          <div class="donate-usage">
            <h3>💡 후원금은 이렇게 사용됩니다</h3>
            <ul>${pointsHtml}</ul>
          </div>
          <p class="donate-note">${esc(DONATION_CONFIG.modalNote)}</p>
        </div>
      </section>`;
  }

  function openModal(source = 'button') {
    modalOpen = true;
    modal.hidden = false;
    renderModal();
    trackEvent('donation_modal_open', { source });
  }

  function closeModal() {
    if (!modalOpen) return;
    modalOpen = false;
    modal.hidden = true;
  }

  nearBtn.addEventListener('click', () => openModal('near_button'));

  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-donate-close]')) {
      closeModal();
    }
  });

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOpen) {
      closeModal();
    }
  });

  // 3D 전광판/전단지 마우스 클릭 시에도 모달 오픈 (드래그가 아닌 짧은 클릭일 때)
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downPos = null;
  domElement?.addEventListener('pointerdown', (e) => {
    downPos = { x: e.clientX, y: e.clientY };
  });
  domElement?.addEventListener('pointerup', (e) => {
    if (!downPos) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    downPos = null;
    if (moved > 6 || modalOpen) return;
    if (document.body.classList.contains('in-gate') || document.body.classList.contains('in-lobby')) return;
    const rect = domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(allPickMeshes, false);
    if (hits.length > 0 && hits[0].distance < 45) {
      openModal('3d_click');
    }
  });

  let animT = 0;
  let isNear = false;

  function update(dt, playerPos) {
    animT += dt;
    ticker.draw(dt, animT);

    let nearAny = false;
    for (const u of units) {
      // 상단 전광판이 좌우로 부드럽게 스윙하며 살아 움직이는 효과
      u.ledHead.rotation.y = Math.sin(animT * 1.15) * 0.42;
      u.ledHead.position.y = 3.35 + Math.sin(animT * 2.3) * 0.05;
      // 꼭대기 코인 비콘 360° 회전
      u.topper.rotation.y = animT * 2.4;

      if (playerPos && Math.hypot(playerPos.x - u.x, playerPos.z - u.z) <= INTERACT_RADIUS) {
        nearAny = true;
      }
    }

    if (nearAny !== isNear) {
      isNear = nearAny;
      nearBtn.hidden = !isNear;
    }
  }

  function blocks(x, z) {
    for (const u of units) {
      if (Math.hypot(x - u.x, z - u.z) < 0.55) return true;
    }
    return false;
  }

  return {
    update,
    blocks,
    openModal,
    closeModal,
    get open() {
      return modalOpen;
    },
    get isNear() {
      return isNear;
    },
  };
}
