// Starbase, TX (Boca Chica) 전용 영문 NPC 정의 및 구역별 인구 분포
// - 생산기지(Production / Build Site: Starfactory, Mega Bay 1 & 2, Gigabay, Raptor Nest)와
//   발사장(Orbital Launch Site: Integration Tower 1 & 2, Pad 2, Starhopper, Cryo/GSE)에는
//   인근 브라운즈빌(Brownsville)·사우스패드레(South Padre)·할링전(Harlingen)에서 출퇴근하는 작업자·엔지니어를 대거 배치
// - 스타베이스 마을(Village: City Hall, Astropub, Airstream & 주택 단지)은 실제 거주 인원(직원·가족 수백 명)에 맞춰 한산하고 여유로운 분위기로 소수 배치

export const STARBASE_CROWD_BUILD = 180;   // 생산기지 (Starfactory / Mega Bay / Gigabay 일대)
export const STARBASE_CROWD_LAUNCH = 130;  // 발사장 (Integration Towers / Pad 2 / GSE 일대)
export const STARBASE_CROWD_VILLAGE = 22;  // 마을 (Airstream / 주택가 / Astropub — 한산함)
export const STARBASE_CROWD_EXTRA = STARBASE_CROWD_BUILD + STARBASE_CROWD_LAUNCH + STARBASE_CROWD_VILLAGE;

export const STARBASE_NPC_DEFS = [
  // --- 생산기지 (Build Site: Starfactory, Mega Bay, Gigabay, Raptor Nest) ---
  {
    name: 'Starfactory Welder Marcus',
    look: { color: '#1e272e', hat: '#ffd166', pants: '#2d3436', skin: '#c4926e', gender: 'm', face: 'square', hair: 'short', beard: 'goatee', top: 'long', badge: '#0984e3' },
    speed: 1.35,
    spot: 'Starfactory',
    lines: [
      'Commuted in from Brownsville at 5 AM—Highway 4 was bumper-to-bumper with shift trucks.',
      'We are welding 304L stainless steel barrels non-stop inside Starfactory today.',
      'Once a ring section clears quality check, we roll it straight toward Mega Bay.',
    ],
  },
  {
    name: 'Mega Bay Crane Tech Elena',
    look: { color: '#ff7a00', hat: '#ffffff', pants: '#243044', skin: '#e8c4a8', gender: 'f', face: 'round', hair: 'pony', top: 'long', badge: '#ff7a00' },
    speed: 1.25,
    spot: 'Mega Bay',
    lines: [
      'Stacking barrel sections inside Mega Bay never gets old—the scale is unreal.',
      'Most of my crew drives in from Brownsville or Harlingen every morning.',
      'Bridge crane clearance is tight when a full Super Heavy booster is on the stand.',
    ],
  },
  {
    name: 'Booster Integration Lead Noah',
    look: { color: '#243044', hat: '#ffd166', pants: '#1e272e', skin: '#f2d0b0', gender: 'm', face: 'long', hair: 'short', glasses: true, top: 'long', badge: '#03c75a' },
    speed: 1.4,
    spot: 'Mega Bay 2',
    lines: [
      'Mega Bay 2 has aft dome and grid fin teams working back-to-back shifts.',
      'Thirty-three Raptor engines on one thrust puck—plumbing check takes all night.',
      'Grabbing a quick breather before our 2 PM integration standup.',
    ],
  },
  {
    name: 'Raptor Propulsion Eng. Liam',
    look: { color: '#2c3e50', bag: '#1a1a1a', pants: '#2d3436', skin: '#f6d7c3', gender: 'm', face: 'round', hair: 'medium', glasses: true, top: 'hoodie', coffee: 'iced', badge: '#0984e3' },
    speed: 1.45,
    spot: 'Raptor Nest',
    lines: [
      'Fresh batch of Raptor engines just arrived from McGregor test stands.',
      'Checkinggimbal actuators and turbopump purge lines over at Raptor Nest.',
      'I carpool from Rancho Viejo with three other propulsion engineers.',
    ],
  },
  {
    name: 'Gigabay Structural Lead Priya',
    look: { color: '#0984e3', hat: '#ffffff', pants: '#2c3e50', skin: '#c4926e', gender: 'f', face: 'square', hair: 'long', glasses: true, top: 'long', badge: '#0984e3' },
    speed: 1.3,
    spot: 'Gigabay',
    lines: [
      'Gigabay is going to take high-rate Starship production to a whole new level.',
      'Structural steel and high-bay trusses are going up fast even in the Gulf breeze.',
      'Between Starfactory and Gigabay, this side of Highway 4 never sleeps.',
    ],
  },
  {
    name: 'Heat Shield Tile Tech Mateo',
    look: { color: '#e67e22', hat: '#ffd166', pants: '#2f3640', skin: '#d7a888', gender: 'm', face: 'round', hair: 'short', top: 'short', badge: '#e67e22' },
    speed: 1.35,
    spot: 'Starfactory',
    lines: [
      'Thousands of hex silica tiles—and every single gap tolerance matters for reentry.',
      'The drive back to Brownsville after a 12-hour tile shift hits different.',
      'Checking pin-weld mounts along the windward chine section.',
    ],
  },
  {
    name: 'Avionics Harness Eng. Chloe',
    look: { color: '#3b4252', bag: '#2d3436', pants: '#1e272e', skin: '#f6d7c3', gender: 'f', face: 'long', hair: 'medium', glasses: true, top: 'long', coffee: 'latte', badge: '#03c75a' },
    speed: 1.3,
    spot: 'Mega Bay',
    lines: [
      'Routing fiber and power harnesses all the way up to the forward flap actuators.',
      'Only a few hundred of us actually live in Starbase—most folks commute from town.',
      'Hardware-in-the-loop tests passed clean on the ship flight computers.',
    ],
  },
  {
    name: 'Logistics Coordinator Sam',
    look: { color: '#f59f00', hat: '#1e272e', pants: '#2d3436', skin: '#a87556', gender: 'm', face: 'square', hair: 'bald', top: 'short', badge: '#c0392b' },
    speed: 1.55,
    spot: 'Starfactory',
    lines: [
      'Steel coils, LOX valves, and crane rigging—everything flows through Starfactory receiving.',
      'Shift change on Boca Chica Boulevard looks like a small city moving all at once.',
      'Keeping the build bays stocked 24/7 is a full-contact sport.',
    ],
  },

  // --- 발사장 (Orbital Launch Site: Integration Towers, Pad 2, Starhopper, GSE) ---
  {
    name: 'Mechazilla Operator Ryan',
    look: { color: '#1e3a5f', hat: '#ffffff', pants: '#2d3436', skin: '#f2d0b0', gender: 'm', face: 'square', hair: 'short', top: 'long', badge: '#0984e3' },
    speed: 1.3,
    spot: 'Starbase Integration Tower 1',
    lines: [
      'Calibrating the chopstick arms on Integration Tower 1 for the next booster catch.',
      'Looking up 146 meters at the tower arms still gives me goosebumps.',
      'Ship QD arm swing test is scheduled right after pad clear.',
    ],
  },
  {
    name: 'Tower 2 Pad Engineer Sofia',
    look: { color: '#d35400', hat: '#ffd166', pants: '#243044', skin: '#e8c4a8', gender: 'f', face: 'round', hair: 'pony', glasses: true, top: 'long', badge: '#ff7a00' },
    speed: 1.35,
    spot: 'Starbase Integration Tower 2',
    lines: [
      'Integration Tower 2 and Pad 2 give us dual-pad turnaround capability.',
      'We just finished walking down the water-cooled steel flame deflector plate.',
      'You can feel the ocean spray from Boca Chica Beach right across the dunes.',
    ],
  },
  {
    name: 'Pad 2 Cryo GSE Tech Devon',
    look: { color: '#006241', hat: '#ffffff', pants: '#1e272e', skin: '#8d5524', gender: 'm', face: 'long', hair: 'short', beard: 'full', top: 'long', badge: '#03c75a' },
    speed: 1.25,
    spot: 'Pad 2',
    lines: [
      'Subcooled liquid methane and LOX vaporizers are frosty even in this Texas heat.',
      'Checking pressure relief valves across the orbital tank farm.',
      'When frost forms on the transfer lines, you know cryo load is getting close.',
    ],
  },
  {
    name: 'Starhopper Pad Guard Miller',
    look: { color: '#2d3436', hat: '#1e272e', pants: '#1e272e', skin: '#f2d0b0', gender: 'm', face: 'square', hair: 'short', glasses: true, top: 'short', badge: '#c0392b' },
    speed: 1.05,
    spot: 'Starhopper',
    lines: [
      'Starhopper started it all—150 meters up and back down right here in Boca Chica.',
      'Now she sits by the launch site watching full stacks fly to orbit.',
      'Keep your hard hat on when you are east of the security checkpoint!',
    ],
  },
  {
    name: 'Flight Safety Officer Brooks',
    look: { color: '#c0392b', hat: '#ffffff', pants: '#2c3e50', skin: '#e8c4a8', gender: 'f', face: 'square', hair: 'short', top: 'long', badge: '#c0392b' },
    speed: 1.4,
    spot: 'Starbase Integration Tower 1',
    lines: [
      'Road closure notice is up for wet dress rehearsal later this week.',
      'Head about 350 meters south of the tower if you want to catch the Roadster Jump Show!',
      'Clearance perimeter runs all the way out toward the Gulf shoreline.',
    ],
  },
  {
    name: 'Flame Trench Inspector Carlos',
    look: { color: '#e67e22', hat: '#ffd166', pants: '#2d3436', skin: '#c4926e', gender: 'm', face: 'round', hair: 'short', top: 'long', badge: '#ff7a00' },
    speed: 1.2,
    spot: 'Pad 2',
    lines: [
      'Inspecting the deluge manifold nozzles under the orbital launch mount.',
      'Hundreds of thousands of gallons of water fire in seconds during ignition.',
      'I drive in from South Padre Island—best view of the towers is across the bay.',
    ],
  },

  // --- 스타베이스 마을 (Starbase Village: 한산한 거주 구역, 직원 가족·소수 입주민) ---
  {
    name: 'Astropub Bartender Cody',
    look: { color: '#6b4f3a', hat: '#2d3436', pants: '#2c3e50', skin: '#f2d0b0', gender: 'm', face: 'round', hair: 'medium', beard: 'goatee', top: 'short' },
    speed: 0.95,
    spot: 'Astropub',
    lines: [
      'Welcome to Astropub! Check out the Starship MK1 fin right over the patio.',
      'The village is super quiet during shift hours—most workers commute from Brownsville.',
      'When evening shift wraps up at Starfactory, engineers stop by for cold drinks.',
    ],
  },
  {
    name: 'Village Resident & Mom Hannah',
    look: { color: '#20c997', bag: '#f4efe4', pants: '#3b4252', skin: '#f6d7c3', gender: 'f', face: 'round', hair: 'long', top: 'hoodie' },
    speed: 0.9,
    spot: 'Starbase City Hall',
    lines: [
      'Only a few hundred of us live right here in Starbase with our families.',
      'It is such a peaceful little neighborhood until static fire day shakes the windows!',
      'My husband is on the Mega Bay integration crew, so we walk over to say hi at lunch.',
    ],
  },
  {
    name: 'Starbase Kid Leo',
    look: { color: '#4f7cff', hat: '#ffd166', pants: '#2d3436', skin: '#f2d0b0', gender: 'm', face: 'round', hair: 'short', top: 'short', scale: 0.68 },
    speed: 1.15,
    spot: 'Starbase City Hall',
    lines: [
      'My dad builds rocket engines at Raptor Nest! 🚀',
      'We can see the giant Megabay cranes right from our yard.',
      'Are you going to watch the Rocket Roadster jump over the cars at the show stage?',
    ],
  },
  {
    name: 'Airstream Resident Sarah',
    look: { color: '#845ef7', pants: '#3d342c', skin: '#e8c4a8', gender: 'f', face: 'long', hair: 'pony', top: 'short', coffee: 'iced' },
    speed: 0.85,
    lines: [
      'Living in one of the Starbase Airstreams means a two-minute walk to the build site.',
      'Most of my teammates drive in from Brownsville, so the village streets stay really calm.',
      'Evening walks here with the Gulf breeze are the best part of Boca Chica life.',
    ],
  },
  {
    name: 'City Hall Coordinator Claire',
    look: { color: '#3d5a80', bag: '#2d3436', pants: '#2c3e50', skin: '#f2d0b0', gender: 'f', face: 'square', hair: 'medium', glasses: true, top: 'long' },
    speed: 0.95,
    spot: 'Starbase City Hall',
    lines: [
      'Starbase City Hall keeps the municipality running for our local residents and families.',
      'We only have a few hundred residents in town, repeater vans, and a whole lot of rockets.',
      'If you head west down the road you will hit Starfactory; east takes you to the launch pad.',
    ],
  },
  {
    name: 'Boca Chica Barn Cat Orbit',
    cat: true,
    look: { color: '#f0a050' },
    speed: 0.7,
    spot: 'Astropub',
    lines: [
      'Meow. (Orbit patrols the Astropub patio for dropped taco crumbs)',
      'Purrrr… static fires do not even wake me up anymore 🐾',
      '…(sunbathing under the Starship fin)',
    ],
  },
];

const BUILD_WORKER_LINES = [
  'Drove in from Brownsville for the morning shift at Starfactory.',
  'Moving stainless steel rings between Starfactory and Mega Bay.',
  'Traffic on Highway 4 was packed with SpaceX commuters this morning.',
  'Heading over to Gigabay to check the crane rigging schedule.',
  'Quick coffee break before we go back inside the high bay.',
  'Weld inspection on the forward dome just wrapped up clean.',
  'Raptor engine delivery truck just pulled into the build site.',
  'Heat shield tile crew is working double shifts on the ship.',
  'Most of us commute from Brownsville or Harlingen—village itself is tiny.',
  'Checking manifold purge lines before the booster rolls out to the pad.',
];

const LAUNCH_WORKER_LINES = [
  'Walking down the orbital launch mount before cryo pressure testing.',
  'Mechazilla chopstick actuators look good on Integration Tower 1.',
  'Checking LOX and liquid methane lines across the GSE tank farm.',
  'Pad 2 flame trench deluge test is on the schedule this afternoon.',
  'You can hear the Gulf waves from Boca Chica Beach right behind the pad.',
  'Keep your hard hat and safety glasses on inside the pad perimeter!',
  'Commuted in from South Padre—nothing beats seeing both towers at sunrise.',
  'Roadster Jump Show stage is set up 350m south of Integration Tower 1!',
  'Telemetry link to the launch control bunker is locked in.',
  'Stacking prep is underway—chopsticks are ready to lift.',
];

const VILLAGE_RESIDENT_LINES = [
  'Starbase village is so quiet—only a few hundred residents and family members live here.',
  'Most of the workforce commutes from Brownsville, so our streets stay peaceful.',
  'Taking a slow walk past the Airstreams toward Astropub.',
  'My partner works at Starfactory; I work remotely from our house here in the village.',
  'Evening Gulf breeze makes walking around the neighborhood really nice.',
  'We always step outside into the yard whenever a static fire or launch happens.',
];

const VILLAGE_KID_LINES = [
  'My mom is an engineer at Mega Bay and my dad works at the launch pad!',
  'Riding bikes around the village is awesome because there is barely any traffic.',
  'When the rocket launches, the whole neighborhood cheers together!',
  'Let us go watch the Roadster jump over the five cars by the launch site!',
];

const FIRST_M = [
  'Alex', 'Ethan', 'Lucas', 'Mason', 'Logan', 'Caleb', 'Nathan', 'Isaac', 'Owen', 'Dylan',
  'Carlos', 'Diego', 'Javier', 'Luis', 'Adrian', 'Gabriel', 'Victor', 'Austin', 'Tyler', 'Wyatt',
  'Hunter', 'Colton', 'Tanner', 'weston', 'Miles', 'Julian', 'Leo', 'Aaron', 'Evan', 'adam',
];
const FIRST_F = [
  'Maya', 'Ava', 'Zoe', 'Nora', 'Lily', 'Grace', 'Chloe', 'Layla', 'Riley', 'Aria',
  'Camila', 'Valeria', 'Lucia', 'Natalia', 'Daniela', 'Gabriela', 'Audrey', 'Claire', 'Stella', 'Hazel',
  'Savannah', 'Brooklyn', 'Skylar', 'Bella', 'Lucy', 'Paisley', 'Ellie', 'Violet', 'Aurora', 'Sienna',
];
const ROLES_BUILD = ['Welder', 'Avionics', 'Propulsion', 'Tile Tech', 'Integration', 'Structures', 'Fab Tech', 'Cryo Tech', 'Crane Crew', 'QA Eng.'];
const ROLES_LAUNCH = ['Pad Crew', 'GSE Tech', 'Tower Eng.', 'Cryo Ops', 'Range Safety', 'Stage 0 Tech', 'Fluid Eng.', 'Pad Welder'];
const ROLES_VILLAGE = ['Resident', 'Family', 'Neighbor'];

const WORK_SHIRTS = ['#1e272e', '#243044', '#2c3e50', '#ff7a00', '#e67e22', '#0984e3', '#3b4252', '#2d3436', '#1e3a5f', '#006241'];
const CASUAL_SHIRTS = ['#4f7cff', '#20c997', '#f59f00', '#845ef7', '#e64980', '#74b9ff', '#ff7a59', '#a29bfe'];
const PANTS = ['#2d3436', '#1e272e', '#243044', '#3b4252', '#2c3e50', '#3d342c'];
const SKINS = ['#f2d0b0', '#f6d7c3', '#e8c4a8', '#d7a888', '#c4926e', '#a87556', '#8d5524'];
const HARD_HATS = ['#ffd166', '#ffffff', '#ff7a00', '#ffd166', '#ffffff'];
const HAIR_M = ['short', 'short', 'medium', 'bald', 'short'];
const HAIR_F = ['pony', 'long', 'medium', 'pony', 'short'];
const FACES = ['round', 'square', 'long'];
const CUPS = ['iced', 'latte', 'hot'];
const BADGES = ['#0984e3', '#ff7a00', '#03c75a', '#c0392b'];

export function isStarbaseBuildZone(x, z) {
  return x < -150 && z > 120;
}

export function isStarbaseLaunchZone(x, z) {
  return x > 1800;
}

export function isStarbaseVillageZone(x, z) {
  return x >= -380 && x <= 460 && z >= -360 && z <= 220;
}

export function starbaseCrowdDef(i, zone, asChild) {
  const female = i % 3 === 1;
  const isWorker = zone === 'build' || zone === 'launch';
  const child = !isWorker && (!!asChild || i % 5 === 0);
  const firstPool = female ? FIRST_F : FIRST_M;
  const rawFirst = firstPool[Math.floor(i / 2) % firstPool.length];
  const first = rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1);
  const roleTag = zone === 'build'
    ? ROLES_BUILD[i % ROLES_BUILD.length]
    : zone === 'launch'
      ? ROLES_LAUNCH[i % ROLES_LAUNCH.length]
      : (child ? 'Kid' : ROLES_VILLAGE[i % ROLES_VILLAGE.length]);

  const lines = zone === 'build'
    ? BUILD_WORKER_LINES
    : zone === 'launch'
      ? LAUNCH_WORKER_LINES
      : child
        ? VILLAGE_KID_LINES
        : VILLAGE_RESIDENT_LINES;

  const hardHat = isWorker && i % 4 !== 3 ? HARD_HATS[i % HARD_HATS.length] : null;
  const badge = isWorker ? BADGES[i % BADGES.length] : null;
  const coffee = !child && i % 5 === 0 ? CUPS[i % CUPS.length] : null;
  const social = isWorker ? i % 4 === 0 : i % 3 === 0;

  return {
    name: `${roleTag} ${first}`,
    crowd: true,
    role: zone,
    child,
    social,
    speed: child ? 1.0 + (i % 4) * 0.1 : isWorker ? 1.15 + (i % 6) * 0.1 : 0.82 + (i % 4) * 0.08,
    lines,
    look: {
      color: isWorker ? WORK_SHIRTS[i % WORK_SHIRTS.length] : CASUAL_SHIRTS[i % CASUAL_SHIRTS.length],
      pants: PANTS[(i * 3) % PANTS.length],
      skin: SKINS[(i * 5) % SKINS.length],
      gender: female ? 'f' : 'm',
      face: FACES[i % FACES.length],
      hair: (female ? HAIR_F : HAIR_M)[i % 5],
      top: isWorker ? (i % 3 === 0 ? 'short' : 'long') : (child ? 'short' : 'hoodie'),
      glasses: !child && (i % 4 === 0),
      beard: child || female ? 'none' : i % 7 === 0 ? 'full' : i % 9 === 0 ? 'goatee' : 'none',
      hat: hardHat,
      bag: isWorker && i % 5 === 0 ? '#1e272e' : null,
      scale: child ? 0.65 + (i % 3) * 0.04 : 0.96 + (i % 4) * 0.025,
      coffee,
      badge,
    },
  };
}
