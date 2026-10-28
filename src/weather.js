// 정자(성남) 실제 시각(KST)과 Open-Meteo 현재 날씨로 해·하늘·안개·비를 맞춘다.
import * as THREE from 'three';
import { eveningFromPart, isEvening, setEvening } from './evening.js';
import { isEn as isUiEn } from './i18n.js';

const DEFAULT_LAT = 37.3665;
const DEFAULT_LON = 127.10835;
const DEFAULT_TZ = 'Asia/Seoul';
const LAT = DEFAULT_LAT * Math.PI / 180;
const LON = DEFAULT_LON;

function buildForecastUrl(lat = DEFAULT_LAT, lon = DEFAULT_LON, tz = DEFAULT_TZ) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,cloud_cover,precipitation,wind_speed_10m&timezone=${encodeURIComponent(tz)}`;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// URL 쿼리(?weather=drizzle|rain|shower|heavy|storm|snow|fog|cloudy|partly|clear, ?wind=숫자, ?temp=숫자, ?hour=0~23)로 날씨·시각 강제 지정
const WEATHER_PRESETS = {
  clear: { code: 0, cloud: 5, precip: 0, temp: 18, wind: 2 },
  sunny: { code: 0, cloud: 5, precip: 0, temp: 18, wind: 2 },
  partly: { code: 2, cloud: 45, precip: 0, temp: 16, wind: 3 },
  cloudy: { code: 3, cloud: 88, precip: 0, temp: 14, wind: 4 },
  fog: { code: 45, cloud: 95, precip: 0, temp: 11, wind: 2 },
  drizzle: { code: 53, cloud: 78, precip: 0.4, temp: 13, wind: 4 },
  rain: { code: 61, cloud: 88, precip: 1.0, temp: 12, wind: 8 },
  shower: { code: 80, cloud: 85, precip: 1.2, temp: 14, wind: 10 },
  heavy: { code: 65, cloud: 98, precip: 4.5, temp: 11, wind: 18 },
  storm: { code: 95, cloud: 100, precip: 6.0, temp: 11, wind: 22 },
  snow: { code: 73, cloud: 90, precip: 1.5, temp: -2, wind: 6 },
};

function forcedWeatherFromUrl() {
  if (typeof location === 'undefined') return null;
  const params = new URLSearchParams(location.search);
  const w = params.get('weather')?.trim().toLowerCase();
  if (!w) return null;
  let base = WEATHER_PRESETS[w];
  if (!base && /^\d+$/.test(w)) {
    const code = Number(w);
    base = {
      code,
      cloud: code >= 51 ? 90 : code >= 2 ? 65 : 10,
      precip: code >= 63 || code >= 95 ? 3.5 : code >= 51 ? 1.0 : 0,
      temp: (code >= 71 && code <= 77) || code === 85 || code === 86 ? -2 : 13,
      wind: code >= 63 || code >= 95 ? 16 : 6,
    };
  }
  if (!base) return null;
  const windParam = params.get('wind');
  const tempParam = params.get('temp');
  return {
    ...base,
    wind: windParam != null && windParam !== '' && Number.isFinite(Number(windParam)) ? Number(windParam) : base.wind,
    temp: tempParam != null && tempParam !== '' && Number.isFinite(Number(tempParam)) ? Number(tempParam) : base.temp,
  };
}

let manualHour = null;

function forcedHourFromUrl() {
  if (manualHour != null && Number.isFinite(Number(manualHour))) {
    return clamp(Number(manualHour), 0, 23.99);
  }
  if (typeof location === 'undefined') return null;
  const params = new URLSearchParams(location.search);
  const h = params.get('hour');
  if (h != null && h !== '' && Number.isFinite(Number(h))) {
    return clamp(Number(h), 0, 23.99);
  }
  const rush = params.get('rush')?.trim().toLowerCase();
  if (rush === 'morning' || rush === 'commute' || rush === 'in') return 8.5;
  if (rush === 'lunch' || rush === 'noon') return 12.5;
  if (rush === 'evening' || rush === 'out') return 18.5;
  const ev = params.get('evening');
  if (ev === '0' || ev === 'off' || ev === 'day') return 14;
  if (ev === '1' || ev === 'on' || ev === 'night') return 21;
  if (ev === 'dusk' || ev === 'sunset') return 18.25;
  if (ev === 'dawn') return 5.5;
  return null;
}

export function rushPeriod(hour) {
  if (hour >= 7 && hour < 10) return 'morning';
  if (hour >= 11 && hour < 14) return 'lunch';
  if (hour >= 17 && hour < 20) return 'evening';
  return 'normal';
}

function effectiveDate(now = new Date(), tz = DEFAULT_TZ) {
  const fh = forcedHourFromUrl();
  if (fh == null) return now;
  const { hour, minute } = seoulClock(now, tz);
  const currentHours = hour + minute / 60;
  const diffMs = (fh - currentHours) * 3600 * 1000;
  return new Date(now.getTime() + diffMs);
}

// 태양 고도(alt)·방위(az, 북=0, 시계방향). x=동, z=남.
export function solarPosition(date, latDeg = DEFAULT_LAT, lonDeg = DEFAULT_LON) {
  const latRad = latDeg * Math.PI / 180;
  const days = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const meanAnomaly = ((357.5291 + 0.98560028 * days) % 360) * Math.PI / 180;
  const meanLong = (280.459 + 0.98564736 * days) % 360;
  const lambda = ((meanLong + 1.915 * Math.sin(meanAnomaly) + 0.020 * Math.sin(2 * meanAnomaly)) % 360) * Math.PI / 180;
  const eps = (23.439 - 0.00000036 * days) * Math.PI / 180;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmst = ((280.46061837 + 360.98564736629 * days) % 360) * Math.PI / 180;
  const ha = Math.atan2(Math.sin(gmst + lonDeg * Math.PI / 180 - ra), Math.cos(gmst + lonDeg * Math.PI / 180 - ra));
  const sinAlt = Math.sin(latRad) * Math.sin(dec) + Math.cos(latRad) * Math.cos(dec) * Math.cos(ha);
  const alt = Math.asin(clamp(sinAlt, -1, 1));
  const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(latRad)) / (Math.cos(alt) * Math.cos(latRad) || 1e-6);
  let az = Math.acos(clamp(cosAz, -1, 1));
  if (ha > 0) az = Math.PI * 2 - az;
  return { alt, az };
}

export function seoulClock(date = new Date(), timeZone = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const num = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { hour: num('hour') % 24, minute: num('minute') % 60 };
}

export function dayPart(hour, alt) {
  if (hour >= 21 || hour < 4) return '밤';
  if (hour < 7) return '새벽';
  if (alt < -0.1 && hour >= 19) return '밤';
  if (hour < 11) return '아침';
  if (hour < 17) return '낮';
  if (hour < 20) return '저녁';
  return '밤';
}

export function weatherPhrase(code, isEn = false) {
  const c = Number(code) || 0;
  if (isEn) {
    if (c === 0) return 'Clear';
    if (c === 1) return 'Mostly Clear';
    if (c === 2) return 'Partly Cloudy';
    if (c === 3) return 'Cloudy';
    if (c === 45 || c === 48) return 'Fog';
    if (c >= 51 && c <= 57) return 'Drizzle';
    if (c >= 61 && c <= 67) return 'Rain';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'Snow';
    if (c >= 80 && c <= 82) return 'Showers';
    if (c >= 95) return 'Thunderstorm';
    return 'Clear';
  }
  if (c === 0) return '맑음';
  if (c === 1) return '대체로 맑음';
  if (c === 2) return '구름 조금';
  if (c === 3) return '흐림';
  if (c === 45 || c === 48) return '안개';
  if (c >= 51 && c <= 57) return '이슬비';
  if (c >= 61 && c <= 67) return '비';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return '눈';
  if (c >= 80 && c <= 82) return '소나기';
  if (c >= 95) return '뇌우';
  return '맑음';
}

// 기온이 아직 없으면 하늘 상태만. 있으면 "맑음 18°".
export function weatherWithTemp(phrase, temp) {
  if (temp == null || !Number.isFinite(Number(temp))) return phrase;
  return `${phrase} ${Math.round(Number(temp))}°`;
}

function precipKind(code, precip, temp) {
  const c = Number(code) || 0;
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) return 'rain';
  if (precip >= 0.2) return temp != null && temp <= 0.5 ? 'snow' : 'rain';
  if (c === 45 || c === 48) return 'fog';
  return 'clear';
}

// 0 맑음, 1 대체로 맑음만 달이 보인다. 구름·흐림·안개·비·눈은 가린다.
function skyIsClear(code, kind, live) {
  if (kind === 'rain' || kind === 'snow' || kind === 'fog') return false;
  const c = live ? (Number(code) || 0) : 0;
  return c <= 1;
}

function sunVector(alt, az, out) {
  const east = Math.cos(alt) * Math.sin(az);
  const south = -Math.cos(alt) * Math.cos(az);
  if (alt > 0.02) out.set(east, Math.max(Math.sin(alt), 0.08), south);
  else out.set(east * 0.2, 1, south * 0.2);
  return out.normalize();
}

function makePrecip(scene) {
  const n = 420;
  const pos = new Float32Array(n * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xc5d7e6, transparent: true, opacity: 0.5, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.visible = false;
  scene.add(lines);
  const drops = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0, vy: 12, len: 0.8, on: false }));
  return { n, pos, geo, mat, lines, drops };
}

function reseed(drop, cam, snow) {
  drop.x = cam.x + (Math.random() - 0.5) * 40;
  drop.z = cam.z + (Math.random() - 0.5) * 40;
  drop.y = cam.y + 2 + Math.random() * 20;
  drop.vy = snow ? 1.4 + Math.random() * 1.3 : 14 + Math.random() * 10;
  drop.len = snow ? 0.08 + Math.random() * 0.08 : 0.65 + Math.random() * 0.7;
  drop.on = true;
}

export function createAtmosphere({ scene, sun, hemi, skyGeo, getMode, clock, region = null }) {
  const rLat = region?.lat ?? DEFAULT_LAT;
  const rLon = region?.lon ?? DEFAULT_LON;
  const rTz = region?.timeZone || DEFAULT_TZ;
  const isEn = region?.lang === 'en';
  const forecastUrl = buildForecastUrl(rLat, rLon, rTz);
  const sunDir = new THREE.Vector3(-0.45, 1, 0.35).normalize();
  const precip = makePrecip(scene);
  const topC = new THREE.Color();
  const botC = new THREE.Color();
  const fogC = new THREE.Color();
  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();
  const state = { code: 0, cloud: 0, precip: 0, temp: null, wind: 0, live: false, phrase: '맑음', label: '', alt: 0, part: '낮', evening: false };
  const dayTop = new THREE.Color('#7ec4ef');
  const dayBot = new THREE.Color('#e9f6fb');
  const duskTop = new THREE.Color('#3a4d7c');
  const duskBot = new THREE.Color('#f0a36a');
  const nightTop = new THREE.Color('#070d1c');
  const nightBot = new THREE.Color('#1a2744');
  const grey = new THREE.Color('#8e99a6');
  // 기본 따라보기 시선(남서) 위쪽 높은 하늘. 원점에 고정해 플레이어를 따라가지 않는다.
  const MOON_ALT = 0.74;
  const MOON_AZ = -Math.PI * 0.85;
  const moonDir = new THREE.Vector3(
    Math.cos(MOON_ALT) * Math.sin(MOON_AZ),
    Math.sin(MOON_ALT),
    -Math.cos(MOON_ALT) * Math.cos(MOON_AZ),
  ).normalize();
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(105, 32, 20),
    new THREE.MeshBasicMaterial({ color: '#fff6e4', fog: false, depthWrite: false }),
  );
  moon.name = 'moon';
  moon.renderOrder = 2;
  moon.visible = false;
  moon.position.copy(moonDir).multiplyScalar(2300);
  scene.add(moon);
  const moonLight = new THREE.DirectionalLight('#d4e2ff', 0);
  moonLight.name = 'moonlight';
  scene.add(moonLight, moonLight.target);

  function paintSky(top, bot) {
    const p = skyGeo.attributes.position;
    const col = skyGeo.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const t = Math.max(0, p.getY(i) / 3000);
      tmpA.copy(bot).lerp(top, Math.pow(t, 0.6));
      col.setXYZ(i, tmpA.r, tmpA.g, tmpA.b);
    }
    col.needsUpdate = true;
  }

  function apply(date, camera, dt) {
    const { alt, az } = solarPosition(date, rLat, rLon);
    const { hour, minute } = seoulClock(date, rTz);
    const kind = precipKind(state.live ? state.code : 0, state.live ? state.precip : 0, state.temp);
    let cloud = state.live ? clamp((state.cloud || 0) / 100, 0, 1) : 0;
    if (state.live) {
      if (state.code === 2) cloud = Math.max(cloud, 0.34);
      if (state.code === 3 || kind === 'fog') cloud = Math.max(cloud, 0.78);
      if (kind === 'rain' || kind === 'snow') cloud = Math.max(cloud, 0.62);
    }
    const dayK = smooth(-0.1, 0.32, alt);
    const duskK = smooth(-0.12, 0.05, alt) * (1 - smooth(0.12, 0.38, alt));
    topC.copy(nightTop).lerp(dayTop, dayK).lerp(duskTop, duskK * 0.85);
    botC.copy(nightBot).lerp(dayBot, dayK).lerp(duskBot, duskK);
    const greyAmt = cloud * (dayK > 0.35 ? 0.62 : 0.22);
    topC.lerp(grey, greyAmt);
    botC.lerp(grey, greyAmt * 0.75);
    if (kind === 'fog') { topC.lerp(grey, 0.35); botC.lerp(grey, 0.45); }
    paintSky(topC, botC);
    fogC.copy(botC).lerp(new THREE.Color('#d6eef8'), dayK * (1 - cloud) * 0.35);
    scene.fog.color.copy(fogC);
    scene.background.copy(botC);
    const mode = getMode?.() || 'follow';
    const base = mode === 'overview' ? [1500, 4500] : [350, 1600];
    const thick = kind === 'fog' ? 0.42 : kind === 'rain' || kind === 'snow' ? 0.72 : cloud > 0.7 ? 0.85 : 1;
    scene.fog.near = base[0] * (kind === 'fog' ? 0.35 : 1);
    scene.fog.far = base[1] * thick;

    sunVector(alt, az, sunDir);
    const cover = 1 - cloud * 0.74;
    sun.intensity = (0.08 + 1.92 * dayK) * cover * (kind === 'fog' ? 0.45 : 1);
    sun.color.copy(tmpB.set('#b7c6dc')).lerp(tmpA.set(duskK > 0.35 ? '#ffb36b' : '#fff4e0'), dayK);
    if (cloud > 0.45 && dayK > 0.2) sun.color.lerp(grey, cloud * 0.55);
    sun.castShadow = alt > 0.06;
    hemi.intensity = (0.46 + 1.14 * dayK) * (1 - cloud * 0.22);
    hemi.color.copy(topC).lerp(tmpB.set('#d5deea'), 0.72).lerp(tmpA.set('#ffffff'), dayK * 0.55);
    hemi.groundColor.set('#1a1612').lerp(tmpA.set('#c9b99a'), dayK);

    const uiEn = isUiEn();
    const phrase = state.live ? weatherPhrase(state.code, uiEn) : (uiEn ? 'Clear' : '맑음');
    const shown = weatherWithTemp(phrase, state.live ? state.temp : null);
    const part = dayPart(hour, alt);
    const rush = rushPeriod(hour);
    const partDisplay = uiEn
      ? ({ '새벽': 'Dawn', '아침': 'Morning', '낮': 'Day', '저녁': 'Dusk', '밤': 'Night' }[part] || part)
      : part;
    const rushBadge = uiEn
      ? (rush === 'morning' ? ' · 🚗 Morning' : rush === 'lunch' ? ' · ☕ Lunch' : rush === 'evening' ? ' · 🌇 Evening' : '')
      : (rush === 'morning' ? ' · 🚇 출근' : rush === 'lunch' ? ' · ☕ 점심' : rush === 'evening' ? ' · 🌇 퇴근' : '');
    const label = `${partDisplay} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} · ${shown}${rushBadge}`;
    state.hour = hour;
    state.minute = minute;
    state.rush = rush;
    state.alt = alt;
    state.part = part;
    const nightPart = eveningFromPart(part);
    setEvening(nightPart);
    state.evening = isEvening();
    const sunUp = alt > 0.05;
    const showMoon = nightPart && !sunUp && skyIsClear(state.code, kind, state.live);
    state.moon = showMoon;
    moon.visible = showMoon;
    if (showMoon) {
      moonLight.intensity = 0.5;
      moonLight.target.position.copy(sun.target.position);
      moonLight.position.copy(moon.position);
    } else {
      moonLight.intensity = 0;
    }
    state.phrase = shown;
    state.label = label;
    state.kind = kind;
    if (clock && clock.textContent !== label) clock.textContent = label;

    const snow = kind === 'snow';
    const wet = kind === 'rain' || kind === 'snow';
    const heavy = state.code >= 63 || state.code >= 95 || state.precip >= 1.5;
    const amount = !wet ? 0 : state.code >= 51 && state.code <= 57 ? 0.4 : heavy ? 1 : 0.72;
    precip.lines.visible = amount > 0;
    if (!wet) return;
    precip.mat.color.set(snow ? '#f4f7fb' : '#c5d7e6');
    precip.mat.opacity = snow ? 0.75 : heavy ? 0.55 : 0.38;
    if (!camera) return;
    const active = Math.floor(precip.n * amount);
    const wind = (state.wind || 0) * 0.04;
    for (let i = 0; i < precip.n; i++) {
      const d = precip.drops[i];
      const o = i * 6;
      if (i >= active) {
        precip.pos[o + 1] = precip.pos[o + 4] = -9999;
        continue;
      }
      if (!d.on) reseed(d, camera.position, snow);
      d.y -= d.vy * dt;
      d.x += wind * dt;
      if (d.y < camera.position.y - 3 || Math.hypot(d.x - camera.position.x, d.z - camera.position.z) > 28) reseed(d, camera.position, snow);
      precip.pos[o] = d.x;
      precip.pos[o + 1] = d.y;
      precip.pos[o + 2] = d.z;
      precip.pos[o + 3] = d.x + (snow ? wind * 0.05 : wind * 0.02);
      precip.pos[o + 4] = d.y + d.len;
      precip.pos[o + 5] = d.z;
    }
    precip.geo.attributes.position.needsUpdate = true;
  }

  async function pull() {
    const forced = forcedWeatherFromUrl();
    if (forced) {
      state.code = forced.code;
      state.cloud = forced.cloud;
      state.precip = forced.precip;
      state.temp = forced.temp;
      state.wind = forced.wind;
      state.live = true;
      return;
    }
    try {
      const res = await fetch(forecastUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      const c = body.current || {};
      state.code = Number(c.weather_code) || 0;
      state.cloud = Number(c.cloud_cover) || 0;
      state.precip = Number(c.precipitation) || 0;
      state.temp = c.temperature_2m == null ? null : Number(c.temperature_2m);
      state.wind = Number(c.wind_speed_10m) || 0;
      state.live = true;
    } catch {
      state.code = 0;
      state.cloud = 0;
      state.precip = 0;
      state.temp = null;
      state.wind = 0;
      state.live = false;
      state.phrase = '맑음';
    }
  }

  function setWeather(presetOrOpts) {
    if (!presetOrOpts) return;
    const base = typeof presetOrOpts === 'string'
      ? (WEATHER_PRESETS[presetOrOpts.toLowerCase()] || WEATHER_PRESETS.clear)
      : presetOrOpts;
    if (base.code != null) state.code = Number(base.code) || 0;
    if (base.cloud != null) state.cloud = Number(base.cloud) || 0;
    if (base.precip != null) state.precip = Number(base.precip) || 0;
    if ('temp' in base) state.temp = base.temp == null ? null : Number(base.temp);
    if (base.wind != null) state.wind = Number(base.wind) || 0;
    state.live = true;
  }

  function setHour(h) {
    manualHour = h == null || h === 'live' ? null : clamp(Number(h), 0, 23.99);
    apply(effectiveDate(new Date(), rTz), null, 0);
  }

  if (clock) {
    clock.style.cursor = 'pointer';
    clock.title = isEn
      ? 'Click to cycle time of day (Live → 08:30 → 12:30 → 18:30 → 21:30)'
      : '클릭하여 시간대 전환 (실시간 → 08:30 출근 → 12:30 점심 → 18:30 퇴근 → 21:30 밤)';
    const cycle = [null, 8.5, 12.5, 18.5, 21.5];
    let cIdx = 0;
    clock.addEventListener('click', () => {
      cIdx = (cIdx + 1) % cycle.length;
      setHour(cycle[cIdx]);
    });
  }

  pull();
  setInterval(pull, 10 * 60 * 1000);
  apply(effectiveDate(new Date(), rTz), null, 0);

  return {
    sunDir,
    state,
    setWeather,
    setHour,
    presets: WEATHER_PRESETS,
    update(dt, camera) { apply(effectiveDate(new Date(), rTz), camera, dt || 0); },
    sample(date) {
      const d = date || effectiveDate(new Date(), rTz);
      const { alt, az } = solarPosition(d, rLat, rLon);
      const clock = seoulClock(d, rTz);
      return { alt, az, day: dayPart(clock.hour, alt), ...clock };
    },
  };
}
