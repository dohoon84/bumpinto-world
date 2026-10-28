// 비/눈이 오는 날에만 나타나는 우산장수 NPC + 춤(💃 댄스) 미션으로 우산 얻기 + 우산 버리기(15초 후 소멸)
import * as THREE from 'three';
import { createAvatar, animateAvatar, createUmbrellaProp, UMBRELLA_THEMES } from './avatar.js';
import { Bubble } from '../overlay.js';
import { trackEvent } from '../analytics.js';

const INTERACT_RADIUS = 5.2;
const CHALLENGE_DURATION_SEC = 28;
const DROPPED_LIFETIME_SEC = 15;
const DROPPED_FADE_SEC = 3.5;

const VENDOR_GREETINGS = [
  '비 오는 날 정자역 알록달록 우산 나눔소! ☔ 앞에서 [우산 얻기]를 눌러보세요!',
  '우산 없으시죠? 💃 신나게 춤 한 번 추시면 랜덤 컬러 우산을 공짜로 드려요!',
  '빗줄기가 제법 굵네요~ 정류소 옆에서 예쁜 우산 하나 챙겨 가세요! ☔',
];

function createClosedUmbrellaStick(color = '#ffd43b') {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.92, 6),
    new THREE.MeshLambertMaterial({ color: '#d0d7de' }),
  );
  shaft.position.y = 0.46;
  const cloth = new THREE.Mesh(
    new THREE.ConeGeometry(0.095, 0.62, 8),
    new THREE.MeshLambertMaterial({ color }),
  );
  cloth.position.y = 0.36;
  cloth.rotation.x = Math.PI;
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.055, 0.016, 6, 10, Math.PI),
    new THREE.MeshLambertMaterial({ color: '#5c3d2e' }),
  );
  handle.position.set(-0.055, 0.88, 0);
  g.add(shaft, cloth, handle);
  return g;
}

function buildUmbrellaStand() {
  const g = new THREE.Group();
  // 우산꽂이 통 (민트/네이비 철제 원통)
  const bucket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.26, 0.56, 14),
    new THREE.MeshLambertMaterial({ color: '#1e3a5f' }),
  );
  bucket.position.y = 0.28;
  bucket.castShadow = true;

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.026, 8, 18),
    new THREE.MeshLambertMaterial({ color: '#ffd43b' }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.56;
  g.add(bucket, rim);

  // 통에 꽂혀있는 알록달록 접힌 우산 다발
  const colors = ['#ffd43b', '#ff6b6b', '#4dabf7', '#20c997', '#cc5de8'];
  for (let i = 0; i < colors.length; i++) {
    const a = (i / colors.length) * Math.PI * 2;
    const stick = createClosedUmbrellaStick(colors[i]);
    stick.position.set(Math.cos(a) * 0.13, 0.08, Math.sin(a) * 0.13);
    stick.rotation.z = Math.cos(a) * 0.22;
    stick.rotation.x = Math.sin(a) * 0.22;
    g.add(stick);
  }

  // 작은 안내 팻말 ("☔ 춤추면 우산 무료!")
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 112;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff9db';
  ctx.fillRect(0, 0, 256, 112);
  ctx.strokeStyle = '#f59f00';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 244, 100);
  ctx.fillStyle = '#122033';
  ctx.font = '900 28px "Pretendard", "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('☔ 우산 나눔소', 128, 48);
  ctx.fillStyle = '#d9480f';
  ctx.font = '800 22px "Pretendard", "Noto Sans KR", sans-serif';
  ctx.fillText('💃 춤추면 1개 무료!', 128, 84);
  const signTex = new THREE.CanvasTexture(cv);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const signMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.27),
    new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }),
  );
  signMesh.position.set(0, 0.36, 0.34);
  g.add(signMesh);

  return g;
}

export function mountUmbrellaSystem({
  scene,
  overlay,
  world,
  terrain,
  weather,
  emoteFx,
  onUmbrellaChange,
}) {
  // 1) 정자역(마을) 07786 버스정류소(-1.3, 20.6) 왼편 안전한 인도 위 + 2) 정자역 광장 분수대/버스킹 무대 입구 보행로
  const VENDOR_SPOTS = [
    {
      id: 'station_entry',
      name: '☔ 우산장수 우비씨',
      x: -0.5,
      z: 24.8,
      ry: -0.35,
      umbrellaTheme: 'yellow',
      look: {
        color: '#fcc419',
        hat: '#f59f00',
        pants: '#1e3a5f',
        skin: '#f2d0b0',
        gender: 'm',
        face: 'round',
        hair: 'short',
        beard: 'goatee',
        top: 'hoodie',
      },
    },
    {
      id: 'station_plaza',
      name: '☔ 광장 우산요정 봄이',
      x: -63.2,
      z: 33.5,
      ry: 0.65,
      umbrellaTheme: 'pink',
      look: {
        color: '#ff6b6b',
        hat: '#ffd43b',
        pants: '#2c3e50',
        skin: '#f6d7c3',
        gender: 'f',
        face: 'round',
        hair: 'pony',
        top: 'hoodie',
      },
    },
  ];

  const vendors = VENDOR_SPOTS.map((spot, idx) => {
    const group = new THREE.Group();
    const y0 = terrain ? terrain.getGroundHeight(spot.x, spot.z, 0) : 0;
    group.position.set(spot.x, y0, spot.z);

    const avatar = createAvatar(spot.look);
    avatar.rotation.y = spot.ry;
    avatar.userData.umbrella = spot.umbrellaTheme || 'yellow';
    if (avatar.userData.handUmbrella) avatar.userData.handUmbrella.visible = true;
    group.add(avatar);

    const stand = buildUmbrellaStand();
    stand.position.set(Math.cos(spot.ry) * 0.95, 0, -Math.sin(spot.ry) * 0.95);
    stand.rotation.y = spot.ry;
    group.add(stand);

    group.visible = false;
    scene.add(group);

    const tag = overlay.add({
      cls: 'tag npc umbrella-vendor',
      text: spot.name,
      getPos: () => new THREE.Vector3(spot.x, y0 + 2.35, spot.z),
      maxDist: 55,
    });
    tag.hidden = true;

    const bubble = new Bubble(
      overlay,
      'npc',
      () => new THREE.Vector3(spot.x, y0 + 2.85, spot.z),
      { name: spot.name },
    );
    bubble.item.hidden = true;

    return {
      ...spot,
      y: y0,
      group,
      avatar,
      stand,
      tag,
      bubble,
      greetIdx: idx % VENDOR_GREETINGS.length,
      greetCooldown: 1.5,
      emoteUntil: 0,
    };
  });

  // 하단 우산 얻기 / 우산 버리기 버튼 UI
  const actionWrap = document.createElement('div');
  actionWrap.id = 'umbrella-actions';
  actionWrap.hidden = true;
  document.body.appendChild(actionWrap);

  let hasUmbrella = false;
  let currentTheme = null;
  let lastThemeId = '';
  let challengeVendor = null;
  let challengeTimer = 0;
  let nearVendor = null;
  let isWetWeather = false;
  let uiSig = '';
  const droppedUmbrellas = [];

  function pickRandomUmbrellaTheme() {
    const pool = UMBRELLA_THEMES.filter((t) => t.id !== lastThemeId);
    const list = pool.length ? pool : UMBRELLA_THEMES;
    const picked = list[Math.floor(Math.random() * list.length)];
    lastThemeId = picked.id;
    return picked;
  }

  function setHasUmbrella(next, theme = null) {
    hasUmbrella = !!next;
    currentTheme = hasUmbrella ? (theme || currentTheme || pickRandomUmbrellaTheme()) : null;
    onUmbrellaChange?.(currentTheme ? currentTheme.id : '');
    syncUi();
  }

  function requestUmbrella(vendor = nearVendor || vendors[0]) {
    if (!vendor || !isWetWeather) return;
    if (hasUmbrella) {
      vendor.bubble.say('이미 멋진 우산을 쓰고 계시네요! ☔ 다른 색 우산이 갖고 싶으시면 [우산 버리기(U)] 후 다시 춤춰보세요~', 4500);
      return;
    }
    challengeVendor = vendor;
    challengeTimer = CHALLENGE_DURATION_SEC;
    vendor.bubble.say('에헤이~ 그냥은 못 드리죠! 😆 내 앞에서 신나게 춤(💃 댄스, 3번 키) 한 번 추면 랜덤 컬러 우산 하나 바로 줄게요!!', 7000);
    vendor.emoteUntil = performance.now() + 2400;
    vendor.avatar.userData.emote = 'cheer';
    emoteFx?.burst(new THREE.Vector3(vendor.x, vendor.y, vendor.z), 'cheer', 1);
    trackEvent('umbrella_challenge_start', { vendor: vendor.id });
    syncUi();
  }

  function onPlayerEmote(emoteId, playerPos) {
    if (emoteId !== 'dance' || !isWetWeather || hasUmbrella) return false;
    // 가까이에 있는 우산장수 확인 (미션 중이거나 반경 7.5m 이내)
    let target = challengeVendor;
    if (!target || (playerPos && Math.hypot(playerPos.x - target.x, playerPos.z - target.z) > 8.5)) {
      target = vendors.find(
        (v) => playerPos && Math.hypot(playerPos.x - v.x, playerPos.z - v.z) <= 6.8,
      ) || null;
    }
    if (!target) return false;

    const picked = pickRandomUmbrellaTheme();
    challengeVendor = null;
    challengeTimer = 0;
    setHasUmbrella(true, picked);
    target.bubble.say(`와아아~ 춤선 예술이네요!! 💃🪩 약속대로 [${picked.label}] 우산 하나 드립니다! 비 맞지 마세요~ ☔✨`, 6500);
    target.greetCooldown = 8.0;
    target.emoteUntil = performance.now() + 3600;
    target.avatar.userData.emote = 'clap';
    emoteFx?.burst(new THREE.Vector3(target.x, target.y, target.z), 'love', 3);
    trackEvent('umbrella_acquired', { vendor: target.id, color: picked.id });
    syncUi();
    return true;
  }

  function dropUmbrella(playerPos, playerRy = 0) {
    if (!hasUmbrella || !playerPos) return false;
    const droppedTheme = currentTheme || UMBRELLA_THEMES[0];
    setHasUmbrella(false, null);

    const dropGroup = new THREE.Group();
    const umb = createUmbrellaProp({
      color: droppedTheme.color,
      stripeColor: droppedTheme.stripeColor,
      cloneMaterials: true,
    });
    // 바닥에 비스듬히 굴러떨어진 포즈
    umb.position.set(0, 0.24, 0);
    umb.rotation.set(1.12, 0.3, 0.45);
    dropGroup.add(umb);

    const dropX = playerPos.x + Math.sin(playerRy) * 0.85 + (Math.random() - 0.5) * 0.35;
    const dropZ = playerPos.z + Math.cos(playerRy) * 0.85 + (Math.random() - 0.5) * 0.35;
    const dropY = terrain ? terrain.getGroundHeight(dropX, dropZ, playerPos.y) : (playerPos.y || 0);
    dropGroup.position.set(dropX, dropY, dropZ);
    dropGroup.rotation.y = playerRy + (Math.random() - 0.5) * 0.9;
    scene.add(dropGroup);

    const materials = [];
    dropGroup.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material.transparent = true;
        materials.push(o.material);
      }
    });

    const tag = overlay.add({
      cls: 'tag dropped-umbrella',
      text: `☔ 버려진 ${droppedTheme.label} 우산 (15s)`,
      getPos: () => new THREE.Vector3(dropX, dropY + 0.95, dropZ),
      maxDist: 35,
    });

    droppedUmbrellas.push({
      group: dropGroup,
      umb,
      materials,
      tag,
      label: droppedTheme.label,
      x: dropX,
      y: dropY,
      z: dropZ,
      age: 0,
      life: DROPPED_LIFETIME_SEC,
      lastSecText: 15,
    });

    trackEvent('umbrella_dropped', { color: droppedTheme.id });
    syncUi();
    return true;
  }

  function syncUi() {
    const inChallenge = !hasUmbrella && isWetWeather && challengeVendor && nearVendor;
    const canAsk = !hasUmbrella && isWetWeather && nearVendor && !inChallenge;
    const canDrop = hasUmbrella;
    const sig = `${canAsk ? 1 : 0}:${inChallenge ? 1 : 0}:${canDrop ? 1 : 0}:${nearVendor?.id || ''}`;
    if (sig === uiSig) return;
    uiSig = sig;

    if (!canAsk && !inChallenge && !canDrop) {
      actionWrap.hidden = true;
      actionWrap.innerHTML = '';
      return;
    }

    actionWrap.hidden = false;
    const parts = [];
    if (canAsk) {
      parts.push(`
        <button type="button" class="umb-btn ask" data-umb-ask="1">
          <span>☔ 우산 얻기</span>
          <kbd>U</kbd>
        </button>`);
    } else if (inChallenge) {
      parts.push(`
        <button type="button" class="umb-btn dance-hint" data-umb-dance="1" title="단축키 3 또는 클릭해서 춤추기!">
          <span>💃 춤춰서 우산 받기!</span>
          <kbd>3</kbd>
        </button>`);
    }
    if (canDrop) {
      parts.push(`
        <button type="button" class="umb-btn drop" data-umb-drop="1" title="우산 바닥에 버리기 (단축키 U)">
          <span>🌂 우산 버리기</span>
          <kbd>U</kbd>
        </button>`);
    }
    actionWrap.innerHTML = parts.join('');
  }

  let triggerDanceCallback = null;
  let getPlayerTransform = null;

  actionWrap.addEventListener('click', (e) => {
    const askBtn = e.target.closest('[data-umb-ask]');
    if (askBtn) {
      requestUmbrella(nearVendor || vendors[0]);
      askBtn.blur();
      return;
    }
    const danceBtn = e.target.closest('[data-umb-dance]');
    if (danceBtn) {
      triggerDanceCallback?.();
      danceBtn.blur();
      return;
    }
    const dropBtn = e.target.closest('[data-umb-drop]');
    if (dropBtn) {
      const tr = getPlayerTransform?.();
      if (tr) dropUmbrella(tr.pos, tr.ry);
      dropBtn.blur();
    }
  });

  function handleHotkeyU() {
    const tr = getPlayerTransform?.();
    if (hasUmbrella) {
      if (tr) dropUmbrella(tr.pos, tr.ry);
      return true;
    }
    if (isWetWeather && nearVendor) {
      requestUmbrella(nearVendor);
      return true;
    }
    return false;
  }

  function update(dt, playerPos, playerRy = 0) {
    const kind = weather?.state?.kind || 'clear';
    const wetNow = kind === 'rain' || kind === 'snow';

    if (wetNow !== isWetWeather) {
      isWetWeather = wetNow;
      for (const v of vendors) {
        v.group.visible = wetNow;
        v.tag.hidden = !wetNow;
        if (!wetNow) {
          v.bubble.item.hidden = true;
        }
      }
      if (!wetNow) {
        challengeVendor = null;
        challengeTimer = 0;
      }
    }

    if (challengeTimer > 0) {
      challengeTimer -= dt;
      if (challengeTimer <= 0) {
        challengeVendor = null;
      }
    }

    // 1) 우산장수 NPC 업데이트 (비/눈 올 때만)
    let closest = null;
    let closestD = INTERACT_RADIUS;
    const now = performance.now();

    if (isWetWeather) {
      for (const v of vendors) {
        v.bubble.tick();
        v.greetCooldown -= dt;

        if (v.emoteUntil && now > v.emoteUntil) {
          v.emoteUntil = 0;
          v.avatar.userData.emote = '';
        }

        if (playerPos) {
          const d = Math.hypot(playerPos.x - v.x, playerPos.z - v.z);
          if (d < closestD) {
            closestD = d;
            closest = v;
          }
          if (d < 8.5) {
            // 플레이어 쪽으로 자연스럽게 고개/몸 회전
            const targetRy = Math.atan2(playerPos.x - v.x, playerPos.z - v.z);
            v.avatar.rotation.y +=
              Math.atan2(Math.sin(targetRy - v.avatar.rotation.y), Math.cos(targetRy - v.avatar.rotation.y)) *
              Math.min(1, dt * 5);
          }
          if (d < 5.5 && v.greetCooldown <= 0 && !v.bubble.showing && challengeVendor !== v) {
            const line = hasUmbrella
              ? '우산이 참 잘 어울려요! ☔ 다 쓰셨으면 [우산 버리기(U)]로 내려놓으셔도 돼요~'
              : VENDOR_GREETINGS[v.greetIdx++ % VENDOR_GREETINGS.length];
            v.bubble.say(line, 4800);
            v.greetCooldown = 9.5;
          }
        }
        animateAvatar(v.avatar, 0, dt);
      }
    }

    nearVendor = playerPos ? closest : null;
    syncUi();

    // 2) 바닥에 버려진 우산 업데이트 (15초 후 서서히 페이드아웃 & 제거)
    for (let i = droppedUmbrellas.length - 1; i >= 0; i--) {
      const item = droppedUmbrellas[i];
      item.age += dt;
      const remain = Math.max(0, item.life - item.age);
      const secLeft = Math.ceil(remain);
      if (secLeft !== item.lastSecText && item.tag?.el) {
        item.lastSecText = secLeft;
        item.tag.el.textContent = `☔ 버려진 ${item.label || ''} 우산 (${secLeft}s)`;
      }

      // 바람에 살짝 흔들리는 연출
      item.umb.rotation.z = 0.45 + Math.sin(item.age * 3.2) * 0.06;

      if (remain <= DROPPED_FADE_SEC) {
        const alpha = Math.max(0, remain / DROPPED_FADE_SEC);
        for (const m of item.materials) m.opacity = alpha;
        item.group.scale.setScalar(0.7 + 0.3 * alpha);
        if (item.tag?.el) item.tag.el.style.opacity = alpha.toFixed(2);
      }

      if (item.age >= item.life) {
        scene.remove(item.group);
        for (const m of item.materials) m.dispose?.();
        overlay.remove(item.tag);
        droppedUmbrellas.splice(i, 1);
      }
    }
  }

  function blocks(x, z) {
    if (!isWetWeather) return false;
    for (const v of vendors) {
      if (Math.hypot(x - v.x, z - v.z) < 0.65) return true;
    }
    return false;
  }

  return {
    update,
    blocks,
    requestUmbrella,
    onPlayerEmote,
    dropUmbrella,
    handleHotkeyU,
    bindCallbacks({ onTriggerDance, getPlayer }) {
      triggerDanceCallback = onTriggerDance;
      getPlayerTransform = getPlayer;
    },
    get hasUmbrella() {
      return hasUmbrella;
    },
    get umbrellaTheme() {
      return currentTheme ? currentTheme.id : '';
    },
    get nearVendor() {
      return nearVendor;
    },
    get vendors() {
      return vendors;
    },
    get droppedCount() {
      return droppedUmbrellas.length;
    },
  };
}
