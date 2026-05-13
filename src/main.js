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
scene.background = new THREE.Color(0x8fc7ee);
scene.fog = new THREE.Fog(0x8fc7ee, 95, 240);

const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const clock = new THREE.Clock();
const keys = new Set();
const totalLaps = 3;
const trackHalfWidth = 8.5;
const grassSlowdown = 0.72;
const playerName = "You";
let gameState = "home";
let raceStartTime = 0;

const centerPoints = [
  new THREE.Vector3(-42, 0, 0),
  new THREE.Vector3(-36, 0, -34),
  new THREE.Vector3(-4, 0, -49),
  new THREE.Vector3(34, 0, -38),
  new THREE.Vector3(52, 0, -8),
  new THREE.Vector3(35, 0, 24),
  new THREE.Vector3(8, 0, 40),
  new THREE.Vector3(-24, 0, 34),
  new THREE.Vector3(-54, 0, 18),
];
const trackCurve = new THREE.CatmullRomCurve3(centerPoints, true, "catmullrom", 0.45);
const trackSamples = buildTrackSamples(460);
const boostPads = [];
const startPosition = trackCurve.getPointAt(0);
const startHeading = headingAtProgress(0);

const player = {
  name: playerName,
  mesh: createKart(0xf2b84b, 0x222831),
  position: startPosition.clone(),
  heading: startHeading,
  velocity: new THREE.Vector3(),
  speed: 0,
  lap: 1,
  completed: 0,
  progress: 0,
  previousProgress: 0,
  boostUntil: 0,
  finishTime: null,
};

const bots = [
  createBot("Astra", 0x48cae4, 0.93, 0.02, -3.2),
  createBot("Blaze", 0xef476f, 0.99, 0.05, 0),
  createBot("Vex", 0x80ed99, 0.91, 0.08, 3.2),
  createBot("Nova", 0xfff275, 0.96, 0.11, 5.2),
];
const racers = [player, ...bots];

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
  const hemi = new THREE.HemisphereLight(0xeaf8ff, 0x315820, 2.6);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2.8);
  sun.position.set(-48, 78, 34);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -120;
  sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120;
  sun.shadow.camera.bottom = -120;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 220, 18, 18),
    new THREE.MeshStandardMaterial({ color: 0x5d963f, roughness: 0.96 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  scene.add(createTrackMesh());
  addTrackDetails();
  addBoostPads();
  addRampsAndScenery();
}

function createTrackMesh() {
  const { left, right } = offsetTrackEdges(trackHalfWidth);
  const shape = new THREE.Shape(left.map((point) => new THREE.Vector2(point.x, point.z)));
  shape.holes.push(new THREE.Path(right.reverse().map((point) => new THREE.Vector2(point.x, point.z))));
  const road = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ color: 0x2f343a, roughness: 0.84 }),
  );
  road.rotation.x = Math.PI / 2;
  road.position.y = 0.04;
  road.receiveShadow = true;
  return road;
}

function addTrackDetails() {
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xf7f0df });
  const centerLine = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(trackSamples.map((sample) => sample.point.clone().setY(0.12))),
    lineMaterial,
  );
  scene.add(centerLine);

  const startLine = new THREE.Mesh(
    new THREE.BoxGeometry(trackHalfWidth * 2, 0.12, 1.6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  startLine.position.copy(startPosition).setY(0.16);
  startLine.rotation.y = startHeading + Math.PI / 2;
  scene.add(startLine);

  const railMaterial = new THREE.MeshStandardMaterial({ color: 0xe24843, roughness: 0.55 });
  const edgeGroups = offsetTrackEdges(trackHalfWidth + 1.1);
  [...edgeGroups.left, ...edgeGroups.right].forEach((point, index) => {
    if (index % 5 !== 0) return;
    const nearest = nearestTrackInfo(point);
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 0.75), railMaterial);
    barrier.position.set(point.x, 0.64, point.z);
    barrier.rotation.y = Math.atan2(nearest.tangent.x, nearest.tangent.z);
    barrier.castShadow = true;
    scene.add(barrier);
  });
}

function addBoostPads() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x26d7c9,
    emissive: 0x13877f,
    emissiveIntensity: 1.1,
    roughness: 0.22,
  });

  [0.14, 0.31, 0.52, 0.74, 0.88].forEach((progress) => {
    const center = trackCurve.getPointAt(progress);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.16, 3.4), material);
    pad.position.set(center.x, 0.18, center.z);
    pad.rotation.y = headingAtProgress(progress);
    pad.castShadow = true;
    scene.add(pad);
    boostPads.push({ mesh: pad, progress, cooldownUntil: 0 });
  });
}

function addRampsAndScenery() {
  const rampMaterial = new THREE.MeshStandardMaterial({ color: 0xc78d48, roughness: 0.6 });
  [0.22, 0.66].forEach((progress) => {
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(8, 1.1, 5), rampMaterial);
    const pos = trackCurve.getPointAt(progress);
    ramp.position.set(pos.x, 0.34, pos.z);
    ramp.rotation.y = headingAtProgress(progress);
    ramp.rotation.x = -0.08;
    ramp.castShadow = true;
    scene.add(ramp);
  });

  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8a5a35, roughness: 0.9 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x276b45, roughness: 0.9 });
  for (let i = 0; i < 48; i += 1) {
    const angle = i * 2.399;
    const radius = 74 + (i % 7) * 8;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * 0.78;
    if (nearestTrackInfo(new THREE.Vector3(x, 0, z)).distance < trackHalfWidth + 10) continue;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.58, 4, 8), trunkMaterial);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.6, 6.2, 9), leafMaterial);
    trunk.position.y = 2;
    leaves.position.y = 6.2;
    tree.add(trunk, leaves);
    tree.position.set(x, 0, z);
    tree.traverse((part) => {
      part.castShadow = true;
    });
    scene.add(tree);
  }

  const balloonMaterial = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.35 });
  for (let i = 0; i < 8; i += 1) {
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(1.8, 18, 12), balloonMaterial);
    const progress = i / 8;
    const info = trackSampleAt(progress);
    const side = i % 2 === 0 ? 1 : -1;
    balloon.position.copy(info.point).add(info.normal.clone().multiplyScalar(side * 18)).setY(9 + (i % 3) * 2);
    scene.add(balloon);
  }
}

function createKart(bodyColor, stripeColor) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.95, 4.4),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.36, metalness: 0.16 }),
  );
  body.position.y = 0.92;
  body.castShadow = true;

  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.55, 1.2),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.38 }),
  );
  nose.position.set(0, 0.78, -2.55);
  nose.castShadow = true;

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.95, 1.65),
    new THREE.MeshStandardMaterial({ color: 0xdff8ff, roughness: 0.12, metalness: 0.08 }),
  );
  cabin.position.set(0, 1.58, -0.3);
  cabin.castShadow = true;

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 4.65), new THREE.MeshBasicMaterial({ color: stripeColor }));
  stripe.position.set(0, 1.43, -0.05);

  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.72 });
  const wheelGeometry = new THREE.CylinderGeometry(0.55, 0.55, 0.48, 18);
  [
    [-1.85, 0.46, -1.48],
    [1.85, 0.46, -1.48],
    [-1.85, 0.46, 1.45],
    [1.85, 0.46, 1.45],
  ].forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    group.add(wheel);
  });

  const exhaust = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.8, 10),
    new THREE.MeshStandardMaterial({ color: 0x555b61, metalness: 0.5, roughness: 0.35 }),
  );
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0, 0.85, 2.55);
  group.add(body, nose, cabin, stripe, exhaust);
  return group;
}

function createBot(name, color, pace, progress, lane) {
  return {
    name,
    mesh: createKart(color, 0xffffff),
    position: trackCurve.getPointAt(progress),
    heading: headingAtProgress(progress),
    velocity: new THREE.Vector3(),
    speed: 20 * pace,
    pace,
    lane,
    lap: 1,
    completed: 0,
    progress,
    previousProgress: progress,
    boostUntil: 0,
    finishTime: null,
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
  }, 850);
}

function resetRace() {
  const startInfo = trackSampleAt(0);
  resetRacer(player, 0, -2.7, startInfo);
  player.speed = 0;
  bots.forEach((bot, index) => {
    resetRacer(bot, 0.018 + index * 0.024, bot.lane, trackSampleAt(0.018 + index * 0.024));
    bot.speed = 19.5 * bot.pace;
  });
  boostPads.forEach((boost) => {
    boost.cooldownUntil = 0;
    boost.mesh.visible = true;
  });
  raceMessage.classList.remove("is-active");
  updateRacerMeshes(0);
  updateHud();
  updateLeaderboard();
}

function resetRacer(racer, progress, lane, info) {
  racer.progress = progress;
  racer.previousProgress = progress;
  racer.position.copy(info.point).add(info.normal.clone().multiplyScalar(lane));
  racer.position.y = 0;
  racer.heading = Math.atan2(info.tangent.x, info.tangent.z);
  racer.velocity.set(0, 0, 0);
  racer.lap = 1;
  racer.completed = 0;
  racer.boostUntil = 0;
  racer.finishTime = null;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.045);
  const now = performance.now();

  boostPads.forEach((boost) => {
    boost.mesh.position.y = 0.18 + Math.sin(now * 0.006 + boost.progress * 20) * 0.04;
    if (!boost.mesh.visible && now > boost.cooldownUntil) boost.mesh.visible = true;
  });

  if (gameState === "racing" || gameState === "finished") updateRace(dt, now);
  updateCamera(dt);
  renderer.render(scene, camera);
}

function updateRace(dt, now) {
  if (gameState === "racing") {
    updatePlayer(dt, now);
    bots.forEach((bot) => updateBot(bot, dt, now));
    checkBoosts(now);
    updateLapsAndFinish(now);
  }
  updateRacerMeshes(now);
  updateHud();
  updateLeaderboard();
}

function updatePlayer(dt, now) {
  const info = nearestTrackInfo(player.position);
  const onTrack = info.distance <= trackHalfWidth;
  const boostMultiplier = now < player.boostUntil ? 1.48 : 1;
  const maxSpeed = (onTrack ? 31 : 20) * boostMultiplier;
  const acceleration = onTrack ? 26 : 15;

  if (keys.has("ArrowUp")) player.speed += acceleration * dt;
  if (keys.has("ArrowDown")) player.speed -= 28 * dt;
  if (!keys.has("ArrowUp") && !keys.has("ArrowDown")) player.speed *= 1 - 1.45 * dt;

  player.speed = THREE.MathUtils.clamp(player.speed, -11, maxSpeed);
  if (!onTrack) player.speed *= 1 - grassSlowdown * dt;

  const steer = (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
  const steerPower = THREE.MathUtils.clamp(Math.abs(player.speed) / 16, 0.22, 1);
  player.heading += steer * 2.55 * steerPower * dt * Math.sign(player.speed || 1);

  const forward = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  player.velocity.copy(forward).multiplyScalar(player.speed);
  player.position.addScaledVector(player.velocity, dt);

  collideWithTrackEdges(player);
  const newInfo = nearestTrackInfo(player.position);
  player.previousProgress = player.progress;
  player.progress = newInfo.progress;
}

function updateBot(bot, dt, now) {
  if (bot.finishTime) return;
  const boostMultiplier = now < bot.boostUntil ? 1.3 : 1;
  const targetSpeed = 22.5 * bot.pace * boostMultiplier;
  bot.speed = THREE.MathUtils.lerp(bot.speed, targetSpeed, 1.7 * dt);
  bot.previousProgress = bot.progress;
  bot.progress = normalizeProgress(bot.progress + (bot.speed * dt) / trackSamples.totalLength);

  const info = trackSampleAt(bot.progress);
  const wobble = Math.sin(now * 0.0015 + bot.pace * 11) * 0.8;
  const targetPosition = info.point.clone().add(info.normal.clone().multiplyScalar(bot.lane + wobble));
  bot.position.lerp(targetPosition, 1 - Math.pow(0.0008, dt));
  bot.heading = Math.atan2(info.tangent.x, info.tangent.z);

  if (boostPads.some((boost) => boost.mesh.visible && Math.abs(progressDelta(bot.progress, boost.progress)) < 0.012)) {
    bot.boostUntil = now + 1200;
  }
}

function collideWithTrackEdges(racer) {
  const info = nearestTrackInfo(racer.position);
  if (info.distance <= trackHalfWidth) return;
  const side = Math.sign(info.lateral || 1);
  const clamped = info.point.clone().add(info.normal.clone().multiplyScalar(side * trackHalfWidth));
  racer.position.lerp(clamped, 0.62);
  racer.speed *= 0.78;
}

function checkBoosts(now) {
  boostPads.forEach((boost) => {
    if (!boost.mesh.visible) return;
    if (player.position.distanceTo(boost.mesh.position) < 4.7) {
      player.boostUntil = now + 1550;
      player.speed = Math.max(player.speed, 25);
      boost.mesh.visible = false;
      boost.cooldownUntil = now + 2600;
    }
  });
}

function updateLapsAndFinish(now) {
  racers.forEach((racer) => {
    if (racer.finishTime) return;
    if (racer.previousProgress > 0.82 && racer.progress < 0.18 && racer.speed > 0) {
      racer.completed += 1;
      racer.lap = Math.min(totalLaps, racer.completed + 1);
      if (racer.completed >= totalLaps) {
        racer.finishTime = now - raceStartTime;
        racer.lap = totalLaps;
      }
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
  racers.forEach((racer) => {
    racer.mesh.position.copy(racer.position);
    racer.mesh.position.y = 0.08 + (now < racer.boostUntil ? Math.sin(now * 0.045) * 0.08 : 0);
    racer.mesh.rotation.set(0, racer.heading, 0);
  });
}

function updateCamera(dt) {
  const forward = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  const side = new THREE.Vector3(Math.cos(player.heading), 0, -Math.sin(player.heading));
  const target = player.position.clone().add(new THREE.Vector3(0, 2.4, 0));
  const desired = target
    .clone()
    .addScaledVector(forward, -16)
    .addScaledVector(side, 2.8)
    .add(new THREE.Vector3(0, 8.6, 0));
  camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
  camera.lookAt(target.addScaledVector(forward, 8));
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
    const status = racer.finishTime ? "Finished" : `Lap ${racer.lap}`;
    item.textContent = `${racer.name} - ${status}`;
    leaderList.appendChild(item);
  });
}

function sortedRacers() {
  return [...racers].sort((a, b) => {
    if (a.finishTime && b.finishTime) return a.finishTime - b.finishTime;
    if (a.finishTime) return -1;
    if (b.finishTime) return 1;
    return b.completed + b.progress - (a.completed + a.progress);
  });
}

function buildTrackSamples(count) {
  const samples = [];
  let totalLength = 0;
  let previous = trackCurve.getPointAt(0);
  for (let i = 0; i < count; i += 1) {
    const progress = i / count;
    const point = trackCurve.getPointAt(progress);
    const next = trackCurve.getPointAt((i + 1) / count);
    const tangent = next.clone().sub(point).normalize();
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    if (i > 0) totalLength += point.distanceTo(previous);
    samples.push({ point, progress, tangent, normal, lengthAt: totalLength });
    previous = point;
  }
  totalLength += samples[0].point.distanceTo(previous);
  samples.totalLength = totalLength;
  return samples;
}

function offsetTrackEdges(width) {
  const left = [];
  const right = [];
  trackSamples.forEach((sample) => {
    left.push(sample.point.clone().add(sample.normal.clone().multiplyScalar(width)));
    right.push(sample.point.clone().add(sample.normal.clone().multiplyScalar(-width)));
  });
  return { left, right };
}

function nearestTrackInfo(position) {
  let nearest = trackSamples[0];
  let nearestDistance = Infinity;
  trackSamples.forEach((sample) => {
    const distance = sample.point.distanceToSquared(position);
    if (distance < nearestDistance) {
      nearest = sample;
      nearestDistance = distance;
    }
  });
  const offset = position.clone().sub(nearest.point);
  const lateral = offset.dot(nearest.normal);
  return {
    ...nearest,
    lateral,
    distance: Math.abs(lateral),
  };
}

function trackSampleAt(progress) {
  const normalized = normalizeProgress(progress);
  const index = Math.floor(normalized * trackSamples.length) % trackSamples.length;
  return trackSamples[index];
}

function headingAtProgress(progress) {
  const sample = trackSampleAt(progress);
  return Math.atan2(sample.tangent.x, sample.tangent.z);
}

function normalizeProgress(value) {
  return ((value % 1) + 1) % 1;
}

function progressDelta(a, b) {
  const diff = Math.abs(normalizeProgress(a) - normalizeProgress(b));
  return Math.min(diff, 1 - diff);
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
