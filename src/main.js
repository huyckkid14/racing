import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

const canvas = document.querySelector("#game");
const homeScreen = document.querySelector("#homeScreen");
const mapScreen = document.querySelector("#mapScreen");
const startButton = document.querySelector("#startButton");
const mapButton = document.querySelector("#mapButton");
const countdownEl = document.querySelector("#countdown");
const hud = document.querySelector("#hud");
const leaderboard = document.querySelector("#leaderboard");
const leaderList = document.querySelector("#leaderList");
const lapText = document.querySelector("#lapText");
const speedText = document.querySelector("#speedText");
const boostText = document.querySelector("#boostText");
const raceMessage = document.querySelector("#raceMessage");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87bfe3);
scene.fog = new THREE.Fog(0x87bfe3, 85, 190);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const clock = new THREE.Clock();
const keys = new Set();
const totalLaps = 3;
const trackRadiusX = 52;
const trackRadiusZ = 34;
const trackWidth = 12;
const playerName = "You";
let gameState = "home";
let raceStartTime = 0;

const player = {
  name: playerName,
  angle: Math.PI,
  lap: 1,
  completed: 0,
  speed: 0,
  maxSpeed: 24,
  acceleration: 18,
  turnSpeed: 2.25,
  boostUntil: 0,
  finishTime: null,
  mesh: createCar(0xf4b454, 0x12171d),
};

const bots = [
  createBot("Astra", 0x4cc9f0, 0.97, 0.3),
  createBot("Blaze", 0xef476f, 1.02, -0.6),
  createBot("Vex", 0x8ac926, 0.94, 1.15),
  createBot("Nova", 0xfff275, 1.0, -1.45),
];

const racers = [player, ...bots];
const boosts = [];

buildWorld();
scene.add(player.mesh);
bots.forEach((bot) => scene.add(bot.mesh));
resetRace();
animate();

startButton.addEventListener("click", () => {
  homeScreen.classList.remove("is-active");
  mapScreen.classList.add("is-active");
  gameState = "map";
});

mapButton.addEventListener("click", () => {
  mapScreen.classList.remove("is-active");
  hud.classList.add("is-active");
  leaderboard.classList.add("is-active");
  startCountdown();
});

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    keys.add(event.key);
  }
});

window.addEventListener("keyup", (event) => keys.delete(event.key));
window.addEventListener("resize", resize);

function buildWorld() {
  const hemi = new THREE.HemisphereLight(0xdff6ff, 0x30451f, 2.8);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-30, 55, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 180),
    new THREE.MeshStandardMaterial({ color: 0x5d8f43, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const track = new THREE.Mesh(
    new THREE.RingGeometry(trackRadiusZ - trackWidth / 2, trackRadiusZ + trackWidth / 2, 160, 2),
    new THREE.MeshStandardMaterial({ color: 0x29333b, roughness: 0.82 }),
  );
  track.scale.x = trackRadiusX / trackRadiusZ;
  track.rotation.x = -Math.PI / 2;
  track.position.y = 0.02;
  track.receiveShadow = true;
  scene.add(track);

  const innerGrass = new THREE.Mesh(
    new THREE.CircleGeometry(trackRadiusZ - trackWidth / 2 - 1, 120),
    new THREE.MeshStandardMaterial({ color: 0x4f7f38, roughness: 1 }),
  );
  innerGrass.scale.x = trackRadiusX / trackRadiusZ;
  innerGrass.rotation.x = -Math.PI / 2;
  innerGrass.position.y = 0.04;
  scene.add(innerGrass);

  addTrackLines();
  addScenery();
  addBoostPads();
}

function addTrackLines() {
  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xf5f0df });
  const center = new THREE.Mesh(new THREE.RingGeometry(trackRadiusZ - 0.35, trackRadiusZ + 0.35, 160), lineMaterial);
  center.scale.x = trackRadiusX / trackRadiusZ;
  center.rotation.x = -Math.PI / 2;
  center.position.y = 0.08;
  scene.add(center);

  const startLine = new THREE.Mesh(
    new THREE.BoxGeometry(trackWidth + 2, 0.08, 1.1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  startLine.position.set(-trackRadiusX, 0.14, 0);
  scene.add(startLine);
}

function addScenery() {
  const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0xd94f45, roughness: 0.6 });
  for (let i = 0; i < 52; i += 1) {
    const t = (i / 52) * Math.PI * 2;
    const side = i % 2 === 0 ? 1 : -1;
    const x = Math.cos(t) * (trackRadiusX + side * (trackWidth / 2 + 2));
    const z = Math.sin(t) * (trackRadiusZ + side * (trackWidth / 2 + 2));
    const block = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1, 0.8), barrierMaterial);
    block.position.set(x, 0.5, z);
    block.rotation.y = -t;
    block.castShadow = true;
    scene.add(block);
  }

  const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6b3f, roughness: 0.9 });
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8a5a35, roughness: 0.9 });
  for (let i = 0; i < 34; i += 1) {
    const angle = i * 1.618;
    const radius = 72 + (i % 5) * 7;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * (radius * 0.72);
    if (Math.abs(x) < 68 && Math.abs(z) < 48) continue;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 4, 7), trunkMaterial);
    trunk.position.y = 2;
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.5, 6, 9), treeMaterial);
    leaves.position.y = 6;
    tree.add(trunk, leaves);
    tree.position.set(x, 0, z);
    tree.traverse((part) => {
      part.castShadow = true;
    });
    scene.add(tree);
  }
}

function addBoostPads() {
  const padMaterial = new THREE.MeshStandardMaterial({
    color: 0x24d6c8,
    emissive: 0x116a64,
    roughness: 0.25,
  });

  [0.62, 1.78, 3.18, 4.75].forEach((angle) => {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(8, 0.14, 4), padMaterial);
    const point = pointOnTrack(angle, 0);
    pad.position.set(point.x, 0.13, point.z);
    pad.rotation.y = tangentAngle(angle);
    pad.userData.angle = angle;
    scene.add(pad);
    boosts.push({ mesh: pad, angle, cooldownUntil: 0 });
  });
}

function createCar(bodyColor, stripeColor) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.05, 5),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.35, metalness: 0.2 }),
  );
  body.position.y = 0.82;
  body.castShadow = true;

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.8, 2),
    new THREE.MeshStandardMaterial({ color: 0xdaf8ff, roughness: 0.15, metalness: 0.1 }),
  );
  cabin.position.set(0, 1.55, -0.35);
  cabin.castShadow = true;

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.08, 5.15),
    new THREE.MeshBasicMaterial({ color: stripeColor }),
  );
  stripe.position.set(0, 1.39, 0);

  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
  const wheelGeometry = new THREE.CylinderGeometry(0.48, 0.48, 0.42, 16);
  const wheelPositions = [
    [-1.75, 0.45, -1.55],
    [1.75, 0.45, -1.55],
    [-1.75, 0.45, 1.55],
    [1.75, 0.45, 1.55],
  ];
  wheelPositions.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    group.add(wheel);
  });

  group.add(body, cabin, stripe);
  return group;
}

function createBot(name, color, pace, offset) {
  return {
    name,
    angle: Math.PI + offset,
    lap: 1,
    completed: 0,
    speed: 18.5 * pace,
    pace,
    wobble: Math.random() * Math.PI * 2,
    boostUntil: 0,
    finishTime: null,
    mesh: createCar(color, 0xffffff),
  };
}

function startCountdown() {
  resetRace();
  gameState = "countdown";
  countdownEl.classList.add("is-active");
  const steps = ["3", "2", "1", "GO!"];
  let index = 0;
  countdownEl.textContent = steps[index];

  const interval = window.setInterval(() => {
    index += 1;
    if (index >= steps.length) {
      window.clearInterval(interval);
      countdownEl.classList.remove("is-active");
      raceStartTime = performance.now();
      gameState = "racing";
      return;
    }
    countdownEl.textContent = steps[index];
  }, 900);
}

function resetRace() {
  player.angle = Math.PI;
  player.lap = 1;
  player.completed = 0;
  player.speed = 0;
  player.boostUntil = 0;
  player.finishTime = null;
  bots.forEach((bot, index) => {
    bot.angle = Math.PI + (index - 1.5) * 0.18;
    bot.lap = 1;
    bot.completed = 0;
    bot.speed = 17.5 * bot.pace;
    bot.boostUntil = 0;
    bot.finishTime = null;
  });
  boosts.forEach((boost) => {
    boost.cooldownUntil = 0;
    boost.mesh.visible = true;
  });
  raceMessage.classList.remove("is-active");
  updateRacerMeshes(0);
  updateHud();
  updateLeaderboard();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  boosts.forEach((boost) => {
    boost.mesh.rotation.y += dt * 0.9;
    if (!boost.mesh.visible && now > boost.cooldownUntil) {
      boost.mesh.visible = true;
    }
  });

  if (gameState === "racing" || gameState === "finished") {
    updateRace(dt, now);
  }

  updateCamera(dt);
  renderer.render(scene, camera);
}

function updateRace(dt, now) {
  if (gameState === "racing") {
    updatePlayer(dt, now);
    bots.forEach((bot) => updateBot(bot, dt, now));
    checkBoosts(now);
    updateFinishStates(now);
  }
  updateRacerMeshes(now);
  updateHud();
  updateLeaderboard();
}

function updatePlayer(dt, now) {
  const boostMultiplier = now < player.boostUntil ? 1.45 : 1;
  const maxSpeed = player.maxSpeed * boostMultiplier;
  if (keys.has("ArrowUp")) player.speed += player.acceleration * dt;
  if (keys.has("ArrowDown")) player.speed -= player.acceleration * 1.15 * dt;
  if (!keys.has("ArrowUp") && !keys.has("ArrowDown")) player.speed *= 1 - 1.8 * dt;

  player.speed = THREE.MathUtils.clamp(player.speed, -8, maxSpeed);
  const steerInput = (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
  const speedFactor = THREE.MathUtils.clamp(Math.abs(player.speed) / 12, 0.35, 1);
  player.angle += steerInput * player.turnSpeed * speedFactor * dt;
  advanceRacer(player, player.speed, dt);
}

function updateBot(bot, dt, now) {
  if (bot.finishTime) return;
  const botBoost = now < bot.boostUntil ? 1.28 : 1;
  const target = 18.5 * bot.pace * botBoost + Math.sin(now * 0.0018 + bot.wobble) * 1.1;
  bot.speed = THREE.MathUtils.lerp(bot.speed, target, 1.4 * dt);
  advanceRacer(bot, bot.speed, dt);
  if (boosts.some((boost) => angularDistance(bot.angle, boost.angle) < 0.035 && boost.mesh.visible)) {
    bot.boostUntil = now + 1200;
  }
}

function advanceRacer(racer, speed, dt) {
  if (racer.finishTime) return;
  const previous = normalizeAngle(racer.angle);
  racer.angle = normalizeAngle(racer.angle + (speed / averageTrackRadius()) * dt);
  if (previous > Math.PI * 1.75 && racer.angle < Math.PI * 0.25 && speed > 0) {
    racer.completed += 1;
    racer.lap = Math.min(totalLaps, racer.completed + 1);
  }
}

function checkBoosts(now) {
  boosts.forEach((boost) => {
    if (!boost.mesh.visible) return;
    if (angularDistance(player.angle, boost.angle) < 0.055) {
      player.boostUntil = now + 1450;
      player.speed = Math.max(player.speed, 22);
      boost.mesh.visible = false;
      boost.cooldownUntil = now + 2600;
    }
  });
}

function updateFinishStates(now) {
  racers.forEach((racer) => {
    if (!racer.finishTime && racer.completed >= totalLaps) {
      racer.finishTime = now - raceStartTime;
      racer.lap = totalLaps;
    }
  });

  if (player.finishTime && gameState !== "finished") {
    gameState = "finished";
    const place = sortedRacers().findIndex((racer) => racer.name === playerName) + 1;
    raceMessage.textContent = `Finished ${ordinal(place)}`;
    raceMessage.classList.add("is-active");
  }
}

function updateRacerMeshes(now) {
  racers.forEach((racer, index) => {
    const lane = racer === player ? 0 : (index - 2) * 1.8;
    const point = pointOnTrack(racer.angle, lane);
    racer.mesh.position.set(point.x, 0.08, point.z);
    racer.mesh.rotation.y = tangentAngle(racer.angle);
    racer.mesh.position.y += now < racer.boostUntil ? Math.sin(now * 0.03) * 0.06 : 0;
  });
}

function updateCamera(dt) {
  const target = player.mesh.position;
  const desired = new THREE.Vector3(
    target.x - Math.cos(player.angle) * 18,
    13,
    target.z - Math.sin(player.angle) * 18,
  );
  camera.position.lerp(desired, 1 - Math.pow(0.002, dt));
  camera.lookAt(target.x, target.y + 2, target.z);
}

function updateHud() {
  lapText.textContent = `${player.lap} / ${totalLaps}`;
  speedText.textContent = Math.round(Math.abs(player.speed) * 3.1).toString();
  boostText.textContent = performance.now() < player.boostUntil ? "Boosting" : "Ready";
}

function updateLeaderboard() {
  leaderList.replaceChildren();
  sortedRacers().forEach((racer) => {
    const item = document.createElement("li");
    item.className = racer.name === playerName ? "player" : "";
    const progress = racer.finishTime ? "Finished" : `Lap ${racer.lap}`;
    item.textContent = `${racer.name} - ${progress}`;
    leaderList.appendChild(item);
  });
}

function sortedRacers() {
  return [...racers].sort((a, b) => {
    if (a.finishTime && b.finishTime) return a.finishTime - b.finishTime;
    if (a.finishTime) return -1;
    if (b.finishTime) return 1;
    const progressA = a.completed * Math.PI * 2 + normalizeAngle(a.angle);
    const progressB = b.completed * Math.PI * 2 + normalizeAngle(b.angle);
    return progressB - progressA;
  });
}

function pointOnTrack(angle, laneOffset) {
  const laneX = trackRadiusX + laneOffset * 0.6;
  const laneZ = trackRadiusZ + laneOffset;
  return {
    x: Math.cos(angle) * laneX,
    z: Math.sin(angle) * laneZ,
  };
}

function tangentAngle(angle) {
  const dx = -Math.sin(angle) * trackRadiusX;
  const dz = Math.cos(angle) * trackRadiusZ;
  return Math.atan2(dx, dz);
}

function averageTrackRadius() {
  return (trackRadiusX + trackRadiusZ) / 2;
}

function normalizeAngle(angle) {
  return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

function angularDistance(a, b) {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(diff, Math.PI * 2 - diff);
}

function ordinal(value) {
  const suffixes = ["th", "st", "nd", "rd"];
  const mod = value % 100;
  return `${value}${suffixes[(mod - 20) % 10] || suffixes[mod] || suffixes[0]}`;
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
