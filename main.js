import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

const noise = new ImprovedNoise();

const STORAGE_KEY = 'sandecho.settings';

/* ---------------------------------------------------------------- */
/*  Settings persistence                                             */
/* ---------------------------------------------------------------- */

const ui = {
  settingsBtn: document.getElementById('settingsBtn'),
  modal: document.getElementById('settingsModal'),
  birthDateInput: document.getElementById('birthDateInput'),
  lifespanInput: document.getElementById('lifespanInput'),
  saveSettings: document.getElementById('saveSettings'),
  rDays: document.getElementById('rDays'),
  rHours: document.getElementById('rHours'),
  rMinutes: document.getElementById('rMinutes'),
  rSeconds: document.getElementById('rSeconds'),
  rCaption: document.getElementById('rCaption'),
  loadingScreen: document.getElementById('loadingScreen'),
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.birthDate || !data.lifespanYears) return null;
    return data;
  } catch {
    return null;
  }
}

function saveSettingsToStorage(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function openModal() {
  const settings = loadSettings();
  if (settings) {
    ui.birthDateInput.value = settings.birthDate;
    ui.lifespanInput.value = settings.lifespanYears;
  }
  ui.modal.classList.remove('hidden');
}

function closeModal() {
  ui.modal.classList.add('hidden');
}

function getDeathDate(settings) {
  const birth = new Date(settings.birthDate + 'T00:00:00');
  const death = new Date(birth);
  death.setFullYear(death.getFullYear() + Number(settings.lifespanYears));
  return { birth, death };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

ui.settingsBtn.addEventListener('click', openModal);

ui.saveSettings.addEventListener('click', () => {
  const birthDate = ui.birthDateInput.value;
  const lifespanYears = Number(ui.lifespanInput.value);
  if (!birthDate || !lifespanYears || lifespanYears <= 0) return;
  saveSettingsToStorage({ birthDate, lifespanYears });
  closeModal();
});

ui.modal.addEventListener('click', (e) => {
  if (e.target === ui.modal && loadSettings()) closeModal();
});

if (!loadSettings()) {
  openModal();
}

function updateReadout() {
  const settings = loadSettings();
  if (!settings) return { fractionRemaining: 1 };

  const { birth, death } = getDeathDate(settings);
  const now = new Date();

  const totalMs = death - birth;
  const remainingMs = clamp(death - now, 0, totalMs);
  const fractionRemaining = totalMs > 0 ? remainingMs / totalMs : 0;

  const DAY = 86400000, HOUR = 3600000, MINUTE = 60000, SECOND = 1000;
  const days = Math.floor(remainingMs / DAY);
  const hours = Math.floor((remainingMs % DAY) / HOUR);
  const minutes = Math.floor((remainingMs % HOUR) / MINUTE);
  const seconds = Math.floor((remainingMs % MINUTE) / SECOND);

  ui.rDays.textContent = days.toLocaleString('ja-JP');
  ui.rHours.textContent = String(hours).padStart(2, '0');
  ui.rMinutes.textContent = String(minutes).padStart(2, '0');
  ui.rSeconds.textContent = String(seconds).padStart(2, '0');
  ui.rCaption.textContent = remainingMs > 0 ? '残された時間' : '砂の旅は終わりました';

  return { fractionRemaining, remainingMs };
}

setInterval(updateReadout, 1000);

/* ---------------------------------------------------------------- */
/*  Three.js scene                                                   */
/* ---------------------------------------------------------------- */

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xe3f4f0, 0.00012);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 5000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.enableZoom = false;
controls.enableRotate = false;
// Default: fixed view from the beach toward the sea.
// Shift viewing direction with CAMERA_AZIMUTH (+ = from the right / subject faces a bit left).
const CAMERA_DISTANCE = 14;
const CAMERA_POLAR = Math.PI * 0.46;
const CAMERA_AZIMUTH = 0.4;
const LOOK_TARGET_DEFAULT = new THREE.Vector3(0, 1.8, 0);
const LOOK_TARGET_ROTATE = new THREE.Vector3(0, 1.8, 0);
const EXPLORE_DIST_MIN = 5.5;
const EXPLORE_DIST_MAX = 22;
const EXPLORE_POLAR_MIN = Math.PI * 0.22;
const EXPLORE_POLAR_MAX = Math.PI * 0.52;
controls.target.copy(LOOK_TARGET_DEFAULT);
controls.minDistance = CAMERA_DISTANCE;
controls.maxDistance = CAMERA_DISTANCE;
controls.minPolarAngle = CAMERA_POLAR;
controls.maxPolarAngle = CAMERA_POLAR;
controls.autoRotate = false;
controls.autoRotateSpeed = 0.35;

function resetCameraToDefault() {
  controls.target.copy(LOOK_TARGET_DEFAULT);
  camera.position.setFromSphericalCoords(CAMERA_DISTANCE, CAMERA_POLAR, CAMERA_AZIMUTH);
  camera.position.add(controls.target);
  controls.update();
}

function freezeOrbitAtCurrent() {
  const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  controls.minDistance = controls.maxDistance = spherical.radius;
  controls.minPolarAngle = controls.maxPolarAngle = spherical.phi;
}

function applyExploreMode(on) {
  controls.enableZoom = on;
  controls.enableRotate = on;
  controls.enablePan = on;
  if (on) {
    controls.minDistance = EXPLORE_DIST_MIN;
    controls.maxDistance = EXPLORE_DIST_MAX;
    controls.minPolarAngle = EXPLORE_POLAR_MIN;
    controls.maxPolarAngle = EXPLORE_POLAR_MAX;
  } else {
    freezeOrbitAtCurrent();
  }
  controls.update();
}

resetCameraToDefault();
freezeOrbitAtCurrent();

const rotateToggle = document.getElementById('rotateToggle');
const exploreToggle = document.getElementById('exploreToggle');
const resetCameraBtn = document.getElementById('resetCameraBtn');
const audioToggle = document.getElementById('audioToggle');

const bgm = new Audio('assets/audio/nami.mp3');
bgm.loop = true;
bgm.preload = 'auto';

async function setBgmPlaying(on) {
  if (on) {
    try {
      await bgm.play();
    } catch (err) {
      console.warn('BGM play failed:', err);
      audioToggle.checked = false;
    }
  } else {
    bgm.pause();
  }
}

rotateToggle.addEventListener('change', () => {
  controls.autoRotate = rotateToggle.checked;
});

exploreToggle.addEventListener('change', () => {
  applyExploreMode(exploreToggle.checked);
});

resetCameraBtn.addEventListener('click', () => {
  rotateToggle.checked = false;
  exploreToggle.checked = false;
  controls.autoRotate = false;
  controls.enableZoom = false;
  controls.enableRotate = false;
  controls.enablePan = false;
  resetCameraToDefault();
  freezeOrbitAtCurrent();
});

audioToggle.addEventListener('change', () => {
  setBgmPlaying(audioToggle.checked);
});

/* ---------- Sky + sun ---------- */

const sky = new Sky();
sky.scale.setScalar(10000);

const sun = new THREE.Vector3();
const skyParams = { elevation: 42, azimuth: 130 };

const skyUniforms = sky.material.uniforms;
skyUniforms['turbidity'].value = 0.8;
skyUniforms['rayleigh'].value = 5;
skyUniforms['mieCoefficient'].value = 0.0008;
skyUniforms['mieDirectionalG'].value = 0.68;

/* ---------- Water ---------- */

const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
const water = new Water(waterGeometry, {
  textureWidth: 512,
  textureHeight: 512,
  waterNormals: new THREE.TextureLoader().load(
    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/waternormals.jpg',
    (tex) => { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; },
  ),
  sunDirection: new THREE.Vector3(),
  sunColor: 0xffffff,
  waterColor: 0x1f7a8c,
  distortionScale: 2.2,
  fog: true,
});
water.rotation.x = -Math.PI / 2;
water.position.y = 0;
scene.add(water);

function updateSun() {
  const phi = THREE.MathUtils.degToRad(90 - skyParams.elevation);
  const theta = THREE.MathUtils.degToRad(skyParams.azimuth);
  sun.setFromSphericalCoords(1, phi, theta);

  skyUniforms['sunPosition'].value.copy(sun);
  water.material.uniforms['sunDirection'].value.copy(sun).normalize();

  // Keep the light's direction faithful to the sky's actual sun position —
  // clamping its height previously made shadows point somewhere the visual
  // sun disc didn't, which read as "wrong" directional lighting.
  sunLight.position.copy(sun).multiplyScalar(60);
}

/* ---------- Lights ---------- */

const sunLight = new THREE.DirectionalLight(0xfffaf0, 1.7);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 120;
sunLight.shadow.camera.left = -10;
sunLight.shadow.camera.right = 10;
sunLight.shadow.camera.top = 10;
sunLight.shadow.camera.bottom = -10;
sunLight.shadow.bias = -0.0015;
scene.add(sunLight);
scene.add(sunLight.target);

const hemiLight = new THREE.HemisphereLight(0xbfe6f2, 0xdcc79a, 0.4);
scene.add(hemiLight);

// Soft fill so hourglass sand stays readable when the key light is low/side-lit.
const fillLight = new THREE.AmbientLight(0xfff0e0, 0.25);
scene.add(fillLight);

/* ---------- Time of day (local clock → sky / light / water) ---------- */

function hexToRgb(hex) {
  const n = typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r, g, b) {
  return (clamp(Math.round(r), 0, 255) << 16)
    | (clamp(Math.round(g), 0, 255) << 8)
    | clamp(Math.round(b), 0, 255);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function lerpHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A.r, B.r, t), lerp(A.g, B.g, t), lerp(A.b, B.b, t));
}
function lerpStops(a, b, t) {
  return a.map((stop, i) => ({
    t: stop.t,
    c: '#' + lerpHex(parseInt(stop.c.slice(1), 16), parseInt(b[i].c.slice(1), 16), t)
      .toString(16).padStart(6, '0'),
  }));
}

// Keyframes by local hour. Elevation drives Sky/sun; gradient is what the camera sees.
const DAY_KEYS = [
  {
    h: 0,
    elevation: -14, azimuth: 210,
    turbidity: 1.2, rayleigh: 0.6,
    sunColor: 0xb0c4e8, sunIntensity: 0.12,
    hemiSky: 0x1a2740, hemiGround: 0x1c1814, hemiIntensity: 0.22,
    fog: 0x0b1220, exposure: 0.48,
    water: 0x0a1824, waterSun: 0x8899bb,
    stops: [
      { t: 0, c: '#050814' }, { t: 0.25, c: '#0a1430' }, { t: 0.45, c: '#152048' },
      { t: 0.55, c: '#1c2a4a' }, { t: 0.7, c: '#24304a' }, { t: 1, c: '#1a2030' },
    ],
  },
  {
    h: 5.2,
    elevation: -3, azimuth: 85,
    turbidity: 2.5, rayleigh: 1.4,
    sunColor: 0xffc4a0, sunIntensity: 0.35,
    hemiSky: 0x6a7aaa, hemiGround: 0x4a3a35, hemiIntensity: 0.28,
    fog: 0x2a3048, exposure: 0.55,
    water: 0x142838, waterSun: 0xffb090,
    stops: [
      { t: 0, c: '#1a2040' }, { t: 0.3, c: '#4a3a60' }, { t: 0.48, c: '#c07060' },
      { t: 0.58, c: '#e8a070' }, { t: 0.72, c: '#f0c8a0' }, { t: 1, c: '#d8c8b8' },
    ],
  },
  {
    h: 6.8,
    elevation: 10, azimuth: 95,
    turbidity: 1.4, rayleigh: 2.8,
    sunColor: 0xffe0c0, sunIntensity: 1.1,
    hemiSky: 0x9ec8e8, hemiGround: 0xd0b090, hemiIntensity: 0.38,
    fog: 0xd8e8f0, exposure: 0.75,
    water: 0x1a6a7a, waterSun: 0xffe8d0,
    stops: [
      { t: 0, c: '#3a7ab8' }, { t: 0.28, c: '#6aa8d8' }, { t: 0.48, c: '#a8d0e8' },
      { t: 0.58, c: '#d0e4f0' }, { t: 0.72, c: '#e8f0f4' }, { t: 1, c: '#f0f4f2' },
    ],
  },
  {
    h: 10,
    elevation: 42, azimuth: 130,
    turbidity: 0.8, rayleigh: 5,
    sunColor: 0xfffaf0, sunIntensity: 1.7,
    hemiSky: 0xbfe6f2, hemiGround: 0xdcc79a, hemiIntensity: 0.4,
    fog: 0xe3f4f0, exposure: 0.85,
    water: 0x1f7a8c, waterSun: 0xffffff,
    stops: [
      { t: 0, c: '#1560a3' }, { t: 0.25, c: '#2d86c9' }, { t: 0.45, c: '#57addd' },
      { t: 0.55, c: '#8ccce8' }, { t: 0.7, c: '#dff4f0' }, { t: 1, c: '#eaf6f2' },
    ],
  },
  {
    h: 14,
    elevation: 48, azimuth: 200,
    turbidity: 0.9, rayleigh: 4.5,
    sunColor: 0xfff5e6, sunIntensity: 1.55,
    hemiSky: 0xa8d8e8, hemiGround: 0xd4b888, hemiIntensity: 0.38,
    fog: 0xe0f0ec, exposure: 0.82,
    water: 0x1c7385, waterSun: 0xfff8f0,
    stops: [
      { t: 0, c: '#1870b0' }, { t: 0.25, c: '#3a92d0' }, { t: 0.45, c: '#62b4e0' },
      { t: 0.55, c: '#8cc8e8' }, { t: 0.7, c: '#d8f0ec' }, { t: 1, c: '#e8f4f0' },
    ],
  },
  {
    h: 17.2,
    elevation: 14, azimuth: 250,
    turbidity: 3.2, rayleigh: 2.2,
    sunColor: 0xffb070, sunIntensity: 1.35,
    hemiSky: 0xe8a888, hemiGround: 0xc09060, hemiIntensity: 0.42,
    fog: 0xe8c8a8, exposure: 0.78,
    water: 0x2a5568, waterSun: 0xffc090,
    stops: [
      { t: 0, c: '#2a4a78' }, { t: 0.28, c: '#c06040' }, { t: 0.45, c: '#e87830' },
      { t: 0.55, c: '#f0a050' }, { t: 0.68, c: '#f8c878' }, { t: 1, c: '#f0d8b0' },
    ],
  },
  {
    h: 18.6,
    elevation: 1.5, azimuth: 265,
    turbidity: 4.5, rayleigh: 1.6,
    sunColor: 0xff8050, sunIntensity: 0.85,
    hemiSky: 0xd07060, hemiGround: 0x6a4038, hemiIntensity: 0.32,
    fog: 0xc08070, exposure: 0.62,
    water: 0x1a3048, waterSun: 0xff9060,
    stops: [
      { t: 0, c: '#1a2048' }, { t: 0.3, c: '#803050' }, { t: 0.48, c: '#e05030' },
      { t: 0.58, c: '#f08040' }, { t: 0.72, c: '#d09070' }, { t: 1, c: '#a08078' },
    ],
  },
  {
    h: 20,
    elevation: -6, azimuth: 280,
    turbidity: 1.8, rayleigh: 0.9,
    sunColor: 0x8899cc, sunIntensity: 0.2,
    hemiSky: 0x2a3558, hemiGround: 0x2a2018, hemiIntensity: 0.24,
    fog: 0x141c30, exposure: 0.5,
    water: 0x0c1828, waterSun: 0x7788aa,
    stops: [
      { t: 0, c: '#080c20' }, { t: 0.3, c: '#1a2040' }, { t: 0.5, c: '#302848' },
      { t: 0.62, c: '#403858' }, { t: 0.78, c: '#2a3048' }, { t: 1, c: '#1c2235' },
    ],
  },
  {
    h: 24,
    elevation: -14, azimuth: 210,
    turbidity: 1.2, rayleigh: 0.6,
    sunColor: 0xb0c4e8, sunIntensity: 0.12,
    hemiSky: 0x1a2740, hemiGround: 0x1c1814, hemiIntensity: 0.22,
    fog: 0x0b1220, exposure: 0.48,
    water: 0x0a1824, waterSun: 0x8899bb,
    stops: [
      { t: 0, c: '#050814' }, { t: 0.25, c: '#0a1430' }, { t: 0.45, c: '#152048' },
      { t: 0.55, c: '#1c2a4a' }, { t: 0.7, c: '#24304a' }, { t: 1, c: '#1a2030' },
    ],
  },
];

function localHour() {
  // Preview: ?hour=18.5 forces a time (0–24).
  const params = new URLSearchParams(location.search);
  if (params.has('hour')) {
    const forced = Number(params.get('hour'));
    if (Number.isFinite(forced)) return ((forced % 24) + 24) % 24;
  }
  const n = new Date();
  return n.getHours() + n.getMinutes() / 60 + n.getSeconds() / 3600;
}

function sampleDayMood(hour) {
  let i = 0;
  while (i < DAY_KEYS.length - 1 && DAY_KEYS[i + 1].h <= hour) i++;
  const a = DAY_KEYS[i];
  const b = DAY_KEYS[i + 1];
  const t = (hour - a.h) / (b.h - a.h || 1);
  const s = t * t * (3 - 2 * t);
  return {
    elevation: lerp(a.elevation, b.elevation, s),
    azimuth: lerp(a.azimuth, b.azimuth, s),
    turbidity: lerp(a.turbidity, b.turbidity, s),
    rayleigh: lerp(a.rayleigh, b.rayleigh, s),
    sunColor: lerpHex(a.sunColor, b.sunColor, s),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, s),
    hemiSky: lerpHex(a.hemiSky, b.hemiSky, s),
    hemiGround: lerpHex(a.hemiGround, b.hemiGround, s),
    hemiIntensity: lerp(a.hemiIntensity, b.hemiIntensity, s),
    fog: lerpHex(a.fog, b.fog, s),
    exposure: lerp(a.exposure, b.exposure, s),
    water: lerpHex(a.water, b.water, s),
    waterSun: lerpHex(a.waterSun, b.waterSun, s),
    stops: lerpStops(a.stops, b.stops, s),
  };
}

function paintSkyGradient(ctx, w, h, stops) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  for (const s of stops) grad.addColorStop(s.t, s.c);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function makeSkyGradientTexture(stops, w = 512, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paintSkyGradient(c.getContext('2d'), w, h, stops);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.canvas = c;
  return tex;
}

function updateSkyGradientTexture(tex, stops) {
  const c = tex.userData.canvas;
  paintSkyGradient(c.getContext('2d'), c.width, c.height, stops);
  tex.needsUpdate = true;
}

let envRT = null;
let lastEnvElevation = null;

function refreshEnvironmentMap() {
  if (envRT) envRT.dispose();
  envRT = pmremGenerator.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
}

function applyDayMood(mood) {
  skyParams.elevation = mood.elevation;
  skyParams.azimuth = mood.azimuth;
  skyUniforms['turbidity'].value = mood.turbidity;
  skyUniforms['rayleigh'].value = mood.rayleigh;
  updateSun();

  sunLight.color.setHex(mood.sunColor);
  sunLight.intensity = mood.sunIntensity;
  hemiLight.color.setHex(mood.hemiSky);
  hemiLight.groundColor.setHex(mood.hemiGround);
  hemiLight.intensity = mood.hemiIntensity;
  // Keep a little fill even at night; more in daylight.
  fillLight.intensity = 0.12 + mood.sunIntensity * 0.12;
  fillLight.color.setHex(mood.sunColor);

  scene.fog.color.setHex(mood.fog);
  renderer.toneMappingExposure = mood.exposure;

  water.material.uniforms['waterColor'].value.setHex(mood.water);
  water.material.uniforms['sunColor'].value.setHex(mood.waterSun);

  updateSkyGradientTexture(skyGradTex, mood.stops);
  scene.background = skyGradTex;

  if (lastEnvElevation === null || Math.abs(mood.elevation - lastEnvElevation) > 1.5) {
    lastEnvElevation = mood.elevation;
    refreshEnvironmentMap();
  }

  // Dev check: open console → __sandechoTod
  window.__sandechoTod = {
    hour: localHour(),
    elevation: mood.elevation,
    sunIntensity: mood.sunIntensity,
    exposure: mood.exposure,
  };
}

const pmremGenerator = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(sky);

const skyGradTex = makeSkyGradientTexture(DAY_KEYS[3].stops);
scene.background = skyGradTex;

applyDayMood(sampleDayMood(localHour()));

let lastTodSample = -1;
function updateTimeOfDay(force = false) {
  const hour = localHour();
  // Refresh ~every 20s of clock time (smooth enough for sunset).
  if (!force && lastTodSample >= 0 && Math.abs(hour - lastTodSample) < 20 / 3600) return;
  lastTodSample = hour;
  applyDayMood(sampleDayMood(hour));
}

/* ---------------------------------------------------------------- */
/*  Beach                                                             */
/* ---------------------------------------------------------------- */

function wrapSandTexture(tex, repeat, colorSpace = THREE.NoColorSpace) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.colorSpace = colorSpace;
  tex.needsUpdate = true;
  return tex;
}

function heightFieldToNormalTexture(heights, size, strength = 2.4) {
  const out = new ImageData(size, size);
  const at = (x, y) => heights[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const nx = -dx;
      const ny = -dy;
      const nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const o = (y * size + x) * 4;
      out.data[o] = ((nx / len) * 0.5 + 0.5) * 255;
      out.data[o + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      out.data[o + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').putImageData(out, 0, 0);
  return new THREE.CanvasTexture(c);
}

// Multi-scale procedural sand: low-freq color mottling, mid-freq clumps,
// fine grain speckles, plus roughness variation and wind-ripple normals.
function makeSandMaps(size = 512) {
  const albedo = document.createElement('canvas');
  albedo.width = albedo.height = size;
  const actx = albedo.getContext('2d');
  const aImg = actx.createImageData(size, size);

  const rough = document.createElement('canvas');
  rough.width = rough.height = size;
  const rctx = rough.getContext('2d');
  const rImg = rctx.createImageData(size, size);

  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Large warm/cool mottling
      const mottling =
        noise.noise(u * 3.2, v * 3.2, 1.1) * 0.55 +
        noise.noise(u * 7.0, v * 7.0, 2.4) * 0.35;
      // Mid-scale clumps
      const clump = noise.noise(u * 18, v * 18, 4.2) * 0.5 + noise.noise(u * 32, v * 32, 5.1) * 0.3;
      // Fine grain
      const grain = noise.noise(u * 90, v * 90, 8.7) * 0.45 + noise.noise(u * 160, v * 160, 9.3) * 0.25;
      const shade = mottling * 28 + clump * 18 + grain * 14;

      const r = clamp(210 + shade * 0.9 + mottling * 8, 120, 255);
      const g = clamp(168 + shade * 0.65 + mottling * 2, 90, 240);
      const b = clamp(110 + shade * 0.35 - mottling * 6, 50, 200);
      const ai = (y * size + x) * 4;
      aImg.data[ai] = r;
      aImg.data[ai + 1] = g;
      aImg.data[ai + 2] = b;
      aImg.data[ai + 3] = 255;

      // Roughness: finer / drier grains = higher; clumps a bit smoother
      const roughV = clamp(0.72 + grain * 0.18 - clump * 0.08 + mottling * 0.04, 0.45, 0.98);
      const rv = Math.floor(roughV * 255);
      rImg.data[ai] = rv;
      rImg.data[ai + 1] = rv;
      rImg.data[ai + 2] = rv;
      rImg.data[ai + 3] = 255;

      // Wind ripples (anisotropic bands) + fine grain height for normals
      const windAngle = 0.35;
      const along = u * Math.cos(windAngle) + v * Math.sin(windAngle);
      const across = -u * Math.sin(windAngle) + v * Math.cos(windAngle);
      // Lower frequency + softer amplitude so ripples read as gentle dunes.
      const ripplePhase = along * 28 + noise.noise(across * 4.5, along * 1.5, 11) * 0.7;
      const ripples = Math.sin(ripplePhase * Math.PI * 2) * 0.32
        + Math.sin(ripplePhase * Math.PI * 3.6 + 0.4) * 0.1;
      const micro = noise.noise(u * 70, v * 70, 13) * 0.22 + noise.noise(u * 140, v * 140, 14) * 0.1;
      heights[y * size + x] = ripples * 0.35 + micro + clump * 0.12;
    }
  }

  actx.putImageData(aImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);

  const map = new THREE.CanvasTexture(albedo);
  const roughnessMap = new THREE.CanvasTexture(rough);
  const normalMap = heightFieldToNormalTexture(heights, size, 2.1);
  return { map, roughnessMap, normalMap };
}

function makeFoamTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * size;
    const bandY = size * 0.5 + (Math.random() - 0.5) * size * 0.8;
    const r = 2 + Math.random() * 6;
    const grad = ctx.createRadialGradient(x, bandY, 0, x, bandY, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, bandY, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(10, 1);
  return tex;
}

function makeWetSandTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  // PlaneGeometry UV: v=0 at local -Y. After rotation.x = -PI/2 that edge
  // lands inland (+Z). So v=0 must be the dry fade, v=1 the wet sea edge —
  // the previous map was flipped and put a stranded wet stripe toward camera.
  grad.addColorStop(0, 'rgba(190,150,95,0)');
  grad.addColorStop(0.22, 'rgba(165,128,80,0.08)');
  grad.addColorStop(0.45, 'rgba(135,102,62,0.22)');
  grad.addColorStop(0.68, 'rgba(105,78,48,0.4)');
  grad.addColorStop(0.88, 'rgba(78,56,36,0.62)');
  grad.addColorStop(1, 'rgba(58,42,28,0.78)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, size);
  for (let i = 0; i < 140; i++) {
    const y = Math.random() * size;
    const h = 3 + Math.random() * 22;
    ctx.fillStyle = `rgba(35,25,15,${0.03 + Math.random() * 0.1})`;
    ctx.fillRect(0, y, 8, h);
  }
  for (let i = 0; i < 40; i++) {
    const y = size * (0.35 + Math.random() * 0.55);
    const h = 2 + Math.random() * 8;
    ctx.fillStyle = `rgba(210,190,150,${0.04 + Math.random() * 0.06})`;
    ctx.fillRect(0, y, 8, h);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const sandMaps = makeSandMaps(512);
const beachSandMap = wrapSandTexture(sandMaps.map, 56, THREE.SRGBColorSpace);
const beachSandRough = wrapSandTexture(sandMaps.roughnessMap, 56);
const beachSandNormal = wrapSandTexture(sandMaps.normalMap, 56);

// Hourglass sand is packed grains up close — denser, less "beach ripple" than the shore maps.
function makeHourglassSandMaps(size = 512) {
  const albedo = document.createElement('canvas');
  albedo.width = albedo.height = size;
  const actx = albedo.getContext('2d');
  const aImg = actx.createImageData(size, size);

  const rough = document.createElement('canvas');
  rough.width = rough.height = size;
  const rctx = rough.getContext('2d');
  const rImg = rctx.createImageData(size, size);

  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const mottling = noise.noise(u * 4, v * 4, 31) * 0.45 + noise.noise(u * 9, v * 9, 32) * 0.3;
      const clump = noise.noise(u * 28, v * 28, 33) * 0.55 + noise.noise(u * 48, v * 48, 34) * 0.35;
      const grain = noise.noise(u * 120, v * 120, 35) * 0.55 + noise.noise(u * 220, v * 220, 36) * 0.35;
      const shade = mottling * 22 + clump * 16 + grain * 18;

      const r = clamp(212 + shade * 0.9 + mottling * 5, 130, 255);
      const g = clamp(168 + shade * 0.7 + mottling * 2, 100, 240);
      const b = clamp(98 + shade * 0.35 - mottling * 3, 50, 170);
      const ai = (y * size + x) * 4;
      aImg.data[ai] = r;
      aImg.data[ai + 1] = g;
      aImg.data[ai + 2] = b;
      aImg.data[ai + 3] = 255;

      const roughV = clamp(0.68 + grain * 0.22 - clump * 0.06, 0.4, 0.98);
      const rv = Math.floor(roughV * 255);
      rImg.data[ai] = rv;
      rImg.data[ai + 1] = rv;
      rImg.data[ai + 2] = rv;
      rImg.data[ai + 3] = 255;

      // Packed micro-relief only — no wind ripples inside the glass.
      heights[y * size + x] =
        clump * 0.35 + grain * 0.55 + noise.noise(u * 90, v * 90, 37) * 0.2;
    }
  }

  actx.putImageData(aImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);
  return {
    map: new THREE.CanvasTexture(albedo),
    roughnessMap: new THREE.CanvasTexture(rough),
    normalMap: heightFieldToNormalTexture(heights, size, 3.4),
  };
}

const hgMaps = makeHourglassSandMaps(512);
const hgSandMap = wrapSandTexture(hgMaps.map, 5.5, THREE.SRGBColorSpace);
const hgSandRough = wrapSandTexture(hgMaps.roughnessMap, 5.5);
const hgSandNormal = wrapSandTexture(hgMaps.normalMap, 5.5);

// Ground under the hourglass must read as a flat sand pad the prop stands on.
// A continuing inland rise made the foreground sand climb into the sky and
// look like a floating slab; only slope down toward the sea near the waterline.
const BEACH_WIDTH = 240;
const BEACH_DEPTH = 240;
const BEACH_NEAR_Z = -20;
const WATERLINE_Z = -5.2;
const SAND_PAD_Y = 0.055; // matches hourglass wood feet (~world y 0.05)
const beachCenterZ = BEACH_NEAR_Z + BEACH_DEPTH / 2;
const beachGeometry = new THREE.PlaneGeometry(BEACH_WIDTH, BEACH_DEPTH, 220, 220);
{
  const pos = beachGeometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // rotation.x = -PI/2 maps local +Y → world -Z, so worldZ = center - y.
    const worldZ = beachCenterZ - y;
    const inland = worldZ - WATERLINE_Z; // metres inland from waterline (+ = dry)

    let baseH;
    if (inland < 0) {
      // Submerge the seaward shelf so the mesh rim sits under the Water plane.
      baseH = inland * 0.055;
    } else if (inland < 4.5) {
      // Longer beach face so the swash/wet apron has room to run.
      const t = inland / 4.5;
      const s = t * t * (3 - 2 * t);
      baseH = SAND_PAD_Y * s;
    } else {
      // Flat pad under the hourglass and toward the camera — no skyward climb.
      baseH = SAND_PAD_Y;
    }

    const dry = clamp(inland * 0.5, 0, 1);
    let h = baseH;
    h += noise.noise(x * 0.028, y * 0.028, 0) * 0.03 * dry;
    h += noise.noise(x * 0.08, y * 0.08, 12) * 0.014 * dry;
    h += noise.noise(x * 0.22, y * 0.22, 18) * 0.006 * dry;
    pos.setZ(i, h);
  }
  beachGeometry.computeVertexNormals();
}
const beachMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  map: beachSandMap,
  roughnessMap: beachSandRough,
  roughness: 1,
  normalMap: beachSandNormal,
  normalScale: new THREE.Vector2(0.85, 0.85),
  metalness: 0,
  // The bright midday sky drives a very strong PMREM environment map; at full
  // envMapIntensity its diffuse IBL contribution overexposes the sand texture
  // to solid white under ACES tonemapping. Dial it down for this material.
  envMapIntensity: 0.12,
});
const beach = new THREE.Mesh(beachGeometry, beachMaterial);
beach.rotation.x = -Math.PI / 2;
beach.position.set(0, 0, beachCenterZ);
beach.receiveShadow = true;
scene.add(beach);

/* ---------- Sand Echo: finger-traced writing in the sand ---------- */

const SAND_WRITE = {
  text: 'Sand Echo',
  width: 1024,
  height: 320,
  planeW: 7.2,
  planeH: 2.25,
  // On the dry pad, toward the camera from the hourglass.
  position: new THREE.Vector3(1.9, SAND_PAD_Y + 0.009, 5.1),
  yaw: 0.14,
  fadeSec: 5.5,
  reveal: 0,
  ready: false,
  canvas: null,
  ctx: null,
  texture: null,
  mesh: null,
};

function paintSandWriting(reveal) {
  const { ctx, width: w, height: h, text } = SAND_WRITE;
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);

  ctx.save();
  const soft = 0.07;
  const edge = Math.min(1, Math.max(0, reveal));
  const revealX = w * (soft + edge * (1 - soft));
  ctx.beginPath();
  ctx.rect(0, 0, revealX, h);
  ctx.clip();

  ctx.font = '152px "Four Seasons", "Yorusugara", "Yomogi", cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const x = w * 0.5;
  const y = h * 0.52;

  // Pushed-aside sand ridge (lighter lip around the groove).
  ctx.strokeStyle = 'rgba(255, 240, 214, 0.5)';
  ctx.lineWidth = 16;
  ctx.strokeText(text, x, y - 1.5);

  // Finger groove: slightly darker / damp sand.
  ctx.fillStyle = 'rgba(68, 48, 32, 0.4)';
  ctx.fillText(text, x, y + 1.5);
  ctx.strokeStyle = 'rgba(48, 34, 24, 0.48)';
  ctx.lineWidth = 3.2;
  ctx.strokeText(text, x, y + 1.5);

  // Soften the groove with a faint second pass for hand-drawn thickness.
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = 'rgba(90, 64, 42, 0.55)';
  ctx.fillText(text, x + 1.2, y + 2.2);
  ctx.globalAlpha = 1;
  ctx.restore();

  // Feather the decal into the beach so it doesn't read as a floating card.
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.18, w * 0.5, h * 0.5, w * 0.52);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.55, 'rgba(0,0,0,0.85)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  SAND_WRITE.texture.needsUpdate = true;
}

function createSandWriting() {
  const canvas = document.createElement('canvas');
  canvas.width = SAND_WRITE.width;
  canvas.height = SAND_WRITE.height;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    roughness: 0.98,
    metalness: 0,
    envMapIntensity: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(SAND_WRITE.planeW, SAND_WRITE.planeH),
    material,
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = SAND_WRITE.yaw;
  mesh.position.copy(SAND_WRITE.position);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  scene.add(mesh);

  SAND_WRITE.canvas = canvas;
  SAND_WRITE.ctx = ctx;
  SAND_WRITE.texture = texture;
  SAND_WRITE.mesh = mesh;

  const start = () => {
    SAND_WRITE.ready = true;
    paintSandWriting(0);
  };
  document.fonts.load('152px "Four Seasons"').then(start).catch(start);
}

createSandWriting();

/* ---------- swash zone: wet apron + foam running from sea toward hourglass ---------- */

// One continuous damp apron whose seaward edge stays glued to the waterline.
// Depth expands inland with the wash — never a detached stripe mid-beach.
const WET_BAND_DEPTH = 4.5;
const WET_MIN_DEPTH = 1.6;
const WET_MAX_DEPTH = 4.2; // stops short of the hourglass (z≈0)
const wetGeometry = new THREE.PlaneGeometry(260, WET_BAND_DEPTH, 1, 1);
const wetMaterial = new THREE.MeshStandardMaterial({
  map: makeWetSandTexture(),
  color: 0xffffff,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  roughness: 0.45,
  metalness: 0.02,
  envMapIntensity: 0.3,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});
const wetSand = new THREE.Mesh(wetGeometry, wetMaterial);
wetSand.rotation.x = -Math.PI / 2;
wetSand.position.set(0, SAND_PAD_Y + 0.005, WATERLINE_Z + WET_MIN_DEPTH * 0.5);
wetSand.scale.y = WET_MIN_DEPTH / WET_BAND_DEPTH;
wetSand.receiveShadow = true;
scene.add(wetSand);

/* ---------- foam: surges inland toward the hourglass, then recedes ---------- */

const FOAM_DEPTH = 2.2;
const FOAM_TRAVEL = 3.2; // waterline → ~z=-2, toward hourglass but connected to sea
const foamGeometry = new THREE.PlaneGeometry(260, FOAM_DEPTH, 1, 1);
const foamMaterial = new THREE.MeshBasicMaterial({
  map: makeFoamTexture(),
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
  fog: false,
  blending: THREE.AdditiveBlending,
});
const foam = new THREE.Mesh(foamGeometry, foamMaterial);
foam.rotation.x = -Math.PI / 2;
foam.position.set(0, 0.02, WATERLINE_Z + FOAM_DEPTH * 0.35);
scene.add(foam);

/* ---------- shallow water tint: turquoise near shore fading to the deep sea ---------- */

function makeShallowGradientTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  // The plane itself now runs 400 units out to keep its far edge off-screen,
  // but the actual turquoise-to-transparent transition should still happen
  // over the same ~9 units of shoreline it always did — otherwise the tint
  // smears across most of the visible sea instead of hugging the beach.
  const t = 9 / SHALLOW_DEPTH;
  grad.addColorStop(0, 'rgba(185,242,224,0.7)');
  grad.addColorStop(t * 0.3, 'rgba(100,210,197,0.45)');
  grad.addColorStop(t * 0.65, 'rgba(45,150,165,0.14)');
  grad.addColorStop(t, 'rgba(20,90,120,0)');
  grad.addColorStop(1, 'rgba(20,90,120,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Extend this plane's far edge well past the horizon/fog falloff — its near
// (shore) edge stays put, but a nearby far edge was visible on screen as a
// hard seam where the tint plane simply ended in front of the plain sea.
const SHALLOW_NEAR_Z = WATERLINE_Z;
const SHALLOW_DEPTH = 400;
const shallowGeometry = new THREE.PlaneGeometry(260, SHALLOW_DEPTH, 1, 1);
const shallowMaterial = new THREE.MeshBasicMaterial({
  map: makeShallowGradientTexture(),
  transparent: true,
  depthWrite: false,
  fog: false,
});
const shallowWater = new THREE.Mesh(shallowGeometry, shallowMaterial);
shallowWater.rotation.x = -Math.PI / 2;
// Keep the tint on the water side of the waterline so it doesn't paint dry sand.
shallowWater.position.set(0, 0.008, SHALLOW_NEAR_Z - SHALLOW_DEPTH / 2);
scene.add(shallowWater);

/* ---------------------------------------------------------------- */
/*  Hourglass                                                         */
/* ---------------------------------------------------------------- */

const NECK_Y = 0;
const TIP_Y = 1.6;

const halfProfile = [
  { y: 0.0, r: 0.075 },
  { y: 0.08, r: 0.105 },
  { y: 0.35, r: 0.24 },
  { y: 0.75, r: 0.58 },
  { y: 1.05, r: 0.82 },
  { y: 1.32, r: 0.86 },
  { y: 1.50, r: 0.78 },
  { y: 1.58, r: 0.32 },
  { y: 1.60, r: 0.0 },
];

const fullProfile = [
  ...halfProfile.slice().reverse().map((p) => ({ y: -p.y, r: p.r })),
  ...halfProfile.slice(1),
];

function radiusAtY(y, scale = 1) {
  for (let i = 0; i < fullProfile.length - 1; i++) {
    const a = fullProfile[i], b = fullProfile[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / (b.y - a.y || 1);
      return (a.r + (b.r - a.r) * t) * scale;
    }
  }
  return 0;
}

// A bulb's radius (and so cross-sectional area) is far from constant along y,
// so filling by equal HEIGHT steps does not fill by equal VOLUME steps.
// Build a cumulative-volume table (neck -> tip) once, so the sand level can be
// driven by volume fraction (== elapsed/remaining time fraction) instead.
function buildVolumeTable(steps = 300) {
  const table = [{ y: NECK_Y, frac: 0 }];
  let cum = 0;
  const dy = (TIP_Y - NECK_Y) / steps;
  for (let i = 1; i <= steps; i++) {
    const y0 = NECK_Y + (i - 1) * dy;
    const y1 = NECK_Y + i * dy;
    const r0 = radiusAtY(y0);
    const r1 = radiusAtY(y1);
    cum += ((r0 * r0 + r1 * r1) / 2) * dy;
    table.push({ y: y1, frac: cum });
  }
  const total = table[table.length - 1].frac || 1;
  for (const p of table) p.frac /= total;
  return table;
}

const volumeTable = buildVolumeTable();

function heightForVolumeFraction(fraction) {
  const f = clamp(fraction, 0, 1);
  for (let i = 0; i < volumeTable.length - 1; i++) {
    const a = volumeTable[i], b = volumeTable[i + 1];
    if (f >= a.frac && f <= b.frac) {
      const t = (f - a.frac) / (b.frac - a.frac || 1);
      return a.y + (b.y - a.y) * t;
    }
  }
  return f <= 0 ? NECK_Y : TIP_Y;
}

const glassPoints = fullProfile.map((p) => new THREE.Vector2(Math.max(p.r, 0.001), p.y));
const glassGeometry = new THREE.LatheGeometry(glassPoints, 64);
const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xeef7fb,
  transparent: true,
  opacity: 0.16,
  roughness: 0.06,
  metalness: 0,
  ior: 1.5,
  envMapIntensity: 1.1,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const hourglassGroup = new THREE.Group();
const glassMesh = new THREE.Mesh(glassGeometry, glassMaterial);
glassMesh.castShadow = true;
hourglassGroup.add(glassMesh);

const SAND_INSET = 0.88;
const sandMaterial = new THREE.MeshStandardMaterial({
  color: 0xe8c070,
  map: hgSandMap,
  roughnessMap: hgSandRough,
  roughness: 0.95,
  normalMap: hgSandNormal,
  normalScale: new THREE.Vector2(1.15, 1.15),
  metalness: 0,
  envMapIntensity: 0.35,
});

function buildSandLathe(fromY, toY) {
  const pts = fullProfile
    .filter((p) => p.y >= fromY - 1e-6 && p.y <= toY + 1e-6)
    .map((p) => new THREE.Vector2(Math.max(p.r * SAND_INSET, 0.001), p.y));
  return new THREE.LatheGeometry(pts, 64);
}

const topSandGeometry = buildSandLathe(NECK_Y, TIP_Y);
const bottomSandGeometry = buildSandLathe(-TIP_Y, NECK_Y);

const topClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), TIP_Y);
const bottomClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), NECK_Y);

const topSandMaterial = sandMaterial.clone();
topSandMaterial.clippingPlanes = [topClipPlane];
const bottomSandMaterial = sandMaterial.clone();
bottomSandMaterial.clippingPlanes = [bottomClipPlane];

const topSandMesh = new THREE.Mesh(topSandGeometry, topSandMaterial);
const bottomSandMesh = new THREE.Mesh(bottomSandGeometry, bottomSandMaterial);
topSandMesh.receiveShadow = true;
bottomSandMesh.receiveShadow = true;
bottomSandMesh.castShadow = true;
hourglassGroup.add(topSandMesh, bottomSandMesh);

// A perfectly flat disc reads as math, not settled grains. Radial grid +
// angle-of-repose cone (pile / funnel) + multi-octave surface grit.
function buildSandCapGeometry(moundHeight, noiseSeed, rings = 22, radialSegments = 64) {
  const positions = [0, 0, 0];
  const uvs = [0.5, 0.5];
  for (let r = 1; r <= rings; r++) {
    const radius = r / rings;
    for (let s = 0; s < radialSegments; s++) {
      const theta = (s / radialSegments) * Math.PI * 2;
      const x = Math.cos(theta) * radius;
      const y = Math.sin(theta) * radius;
      positions.push(x, y, 0);
      uvs.push(x * 0.5 + 0.5, y * 0.5 + 0.5);
    }
  }
  const indices = [];
  for (let s = 0; s < radialSegments; s++) {
    indices.push(0, 1 + s, 1 + ((s + 1) % radialSegments));
  }
  for (let r = 1; r < rings; r++) {
    const ringStart = 1 + (r - 1) * radialSegments;
    const nextRingStart = 1 + r * radialSegments;
    for (let s = 0; s < radialSegments; s++) {
      const a = ringStart + s;
      const b = ringStart + ((s + 1) % radialSegments);
      const c = nextRingStart + s;
      const d = nextRingStart + ((s + 1) % radialSegments);
      indices.push(a, b, d, a, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  const pos = geo.attributes.position;
  const sign = Math.sign(moundHeight) || 1;
  const amp = Math.abs(moundHeight);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const radius = Math.sqrt(x * x + y * y);
    // Vanish at the rim so the cap meets the clipped glass shell.
    const edgeFalloff = Math.max(0, 1 - radius * radius);
    // Soft cone (~angle of repose) instead of a pure parabola.
    const cone = Math.pow(Math.max(0, 1 - radius), 1.35);
    let h = sign * amp * (0.55 * cone + 0.45 * edgeFalloff);
    h += noise.noise(x * 5, y * 5, noiseSeed) * 0.02 * edgeFalloff;
    h += noise.noise(x * 14, y * 14, noiseSeed + 5) * 0.009 * edgeFalloff;
    h += noise.noise(x * 32, y * 32, noiseSeed + 9) * 0.004 * edgeFalloff;
    h += noise.noise(x * 70, y * 70, noiseSeed + 13) * 0.0016 * edgeFalloff;
    pos.setZ(i, h);
  }
  geo.computeVertexNormals();
  return geo;
}

// Sand funnels down into the neck (dimple) at the top, and piles up (mound)
// where it lands at the bottom.
const topCapGeometry = buildSandCapGeometry(-0.075, 1);
const bottomCapGeometry = buildSandCapGeometry(0.11, 7);
const topCapMaterial = sandMaterial.clone();
topCapMaterial.normalScale = new THREE.Vector2(1.35, 1.35);
topCapMaterial.roughness = 0.9;
const bottomCapMaterial = sandMaterial.clone();
bottomCapMaterial.normalScale = new THREE.Vector2(1.4, 1.4);
bottomCapMaterial.roughness = 0.86;
bottomCapMaterial.envMapIntensity = 0.22;
const topCap = new THREE.Mesh(topCapGeometry, topCapMaterial);
const bottomCap = new THREE.Mesh(bottomCapGeometry, bottomCapMaterial);
topCap.rotation.x = -Math.PI / 2;
bottomCap.rotation.x = -Math.PI / 2;
topCap.receiveShadow = true;
bottomCap.receiveShadow = true;
bottomCap.castShadow = true;
hourglassGroup.add(topCap, bottomCap);

/* wood caps + posts */
function makeWoodGrainTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    const wobble = Math.sin(y * 0.15) * 4 + Math.sin(y * 0.05) * 8;
    const shade = 0.75 + 0.25 * Math.sin(y * 0.4 + wobble);
    ctx.fillStyle = `rgba(0,0,0,${(1 - shade) * 0.35})`;
    ctx.fillRect(0, y, size, 1);
  }
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    ctx.fillRect(x, y, 1, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 4);
  return tex;
}

const woodGrainTex = makeWoodGrainTexture();
const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4326, map: woodGrainTex, roughness: 0.65 });
const woodDarkMaterial = new THREE.MeshStandardMaterial({ color: 0x3f2717, map: woodGrainTex, roughness: 0.7 });

const capGeo = new THREE.CylinderGeometry(0.98, 0.98, 0.16, 40);
const topWoodCap = new THREE.Mesh(capGeo, woodMaterial);
topWoodCap.position.y = 1.68;
const bottomWoodCap = new THREE.Mesh(capGeo, woodMaterial);
bottomWoodCap.position.y = -1.68;
topWoodCap.castShadow = true;
bottomWoodCap.castShadow = true;
bottomWoodCap.receiveShadow = true;
hourglassGroup.add(topWoodCap, bottomWoodCap);

const ringGeo = new THREE.TorusGeometry(0.98, 0.05, 12, 40);
const topRing = new THREE.Mesh(ringGeo, woodDarkMaterial);
topRing.rotation.x = Math.PI / 2;
topRing.position.y = 1.6;
const bottomRing = new THREE.Mesh(ringGeo, woodDarkMaterial);
bottomRing.rotation.x = Math.PI / 2;
bottomRing.position.y = -1.6;
hourglassGroup.add(topRing, bottomRing);

const postGeo = new THREE.CylinderGeometry(0.045, 0.045, 3.36, 12);
for (let i = 0; i < 4; i++) {
  const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
  const post = new THREE.Mesh(postGeo, woodDarkMaterial);
  post.position.set(Math.cos(angle) * 1.0, 0, Math.sin(angle) * 1.0);
  post.castShadow = true;
  hourglassGroup.add(post);
}

const HOURGLASS_Y_OFFSET = 1.81;
hourglassGroup.position.y = HOURGLASS_Y_OFFSET;
scene.add(hourglassGroup);

/* ---------- falling sand stream ---------- */

function makeGrainSprite(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.5);
  g.addColorStop(0, 'rgba(255,236,190,1)');
  g.addColorStop(0.35, 'rgba(240,200,130,0.85)');
  g.addColorStop(0.7, 'rgba(200,150,80,0.25)');
  g.addColorStop(1, 'rgba(160,110,50,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const STREAM_COUNT = 140;
const streamGeometry = new THREE.BufferGeometry();
const streamPositions = new Float32Array(STREAM_COUNT * 3);
const streamColors = new Float32Array(STREAM_COUNT * 3);
const streamPhases = new Float32Array(STREAM_COUNT);
const streamSpeeds = new Float32Array(STREAM_COUNT);
const streamRadii = new Float32Array(STREAM_COUNT);
for (let i = 0; i < STREAM_COUNT; i++) {
  streamPhases[i] = Math.random();
  streamSpeeds[i] = 1.35 + Math.random() * 1.1;
  // Tighter core with a few stray grains.
  streamRadii[i] = Math.random() < 0.82 ? Math.random() * 0.012 : 0.012 + Math.random() * 0.014;
  const ang = Math.random() * Math.PI * 2;
  streamPositions[i * 3] = Math.cos(ang) * streamRadii[i];
  streamPositions[i * 3 + 1] = 0;
  streamPositions[i * 3 + 2] = Math.sin(ang) * streamRadii[i];
  const warm = 0.88 + Math.random() * 0.12;
  streamColors[i * 3] = warm;
  streamColors[i * 3 + 1] = 0.7 + Math.random() * 0.2;
  streamColors[i * 3 + 2] = 0.38 + Math.random() * 0.22;
}
streamGeometry.setAttribute('position', new THREE.BufferAttribute(streamPositions, 3));
streamGeometry.setAttribute('color', new THREE.BufferAttribute(streamColors, 3));
const streamMaterial = new THREE.PointsMaterial({
  map: makeGrainSprite(),
  size: 0.018,
  transparent: true,
  opacity: 0.9,
  sizeAttenuation: true,
  vertexColors: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
});
const streamPoints = new THREE.Points(streamGeometry, streamMaterial);
hourglassGroup.add(streamPoints);

/* ---------------------------------------------------------------- */
/*  Post-processing                                                   */
/* ---------------------------------------------------------------- */

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.12, 0.25, 0.97,
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

/* ---------------------------------------------------------------- */
/*  Resize                                                            */
/* ---------------------------------------------------------------- */

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
});

/* ---------------------------------------------------------------- */
/*  Animation loop                                                    */
/* ---------------------------------------------------------------- */

const clock = new THREE.Clock();
let fractionRemaining = 1;
let hasFinished = false;

function updateSandLevels() {
  const result = updateReadoutQuiet();
  fractionRemaining = result.fractionRemaining;
  hasFinished = result.remainingMs !== undefined && result.remainingMs <= 0;

  // Volume fraction, not height fraction, must match the elapsed/remaining
  // time fraction so the sand level reads correctly against the bulb shape.
  const topLevelY = heightForVolumeFraction(fractionRemaining);
  const bottomLevelY = -heightForVolumeFraction(1 - fractionRemaining);

  topClipPlane.constant = topLevelY + HOURGLASS_Y_OFFSET;
  bottomClipPlane.constant = bottomLevelY + HOURGLASS_Y_OFFSET;

  const topR = radiusAtY(topLevelY, SAND_INSET);
  topCap.visible = fractionRemaining > 0.002;
  topCap.position.y = topLevelY;
  topCap.scale.setScalar(Math.max(topR, 0.001));

  const bottomR = radiusAtY(bottomLevelY, SAND_INSET);
  bottomCap.visible = fractionRemaining < 0.998;
  bottomCap.position.y = bottomLevelY;
  bottomCap.scale.setScalar(Math.max(bottomR, 0.001));

  streamPoints.visible = fractionRemaining > 0.001 && fractionRemaining < 0.999;
}

function updateReadoutQuiet() {
  const settings = loadSettings();
  if (!settings) return { fractionRemaining: 1 };
  const { birth, death } = getDeathDate(settings);
  const now = new Date();
  const totalMs = death - birth;
  const remainingMs = clamp(death - now, 0, totalMs);
  const fraction = totalMs > 0 ? remainingMs / totalMs : 0;
  return { fractionRemaining: fraction, remainingMs };
}

let loadingHidden = false;
function hideLoadingScreen() {
  if (loadingHidden) return;
  loadingHidden = true;
  ui.loadingScreen.classList.add('hidden');
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  water.material.uniforms['time'].value += delta * 0.5;
  updateTimeOfDay();

  if (SAND_WRITE.ready && SAND_WRITE.reveal < 1) {
    SAND_WRITE.reveal = Math.min(1, SAND_WRITE.reveal + delta / SAND_WRITE.fadeSec);
    paintSandWriting(SAND_WRITE.reveal);
  }

  // Swash from the waterline inland toward the hourglass. Wet apron keeps its
  // seaward edge pinned to WATERLINE_Z so damp sand is never a detached stripe.
  const swashA = 0.5 + 0.5 * Math.sin(elapsed * 0.27);
  const swashB = 0.5 + 0.5 * Math.sin(elapsed * 0.39 + 1.15);
  const wash = clamp(0.08 + swashA * 0.72 + swashB * 0.28, 0, 1);

  // Foam center stays between waterline and wash front (always connected to sea).
  const foamFront = WATERLINE_Z + 0.35 + wash * FOAM_TRAVEL;
  foam.position.z = foamFront - FOAM_DEPTH * 0.15;
  foam.position.y = 0.017 + wash * 0.02;
  foamMaterial.opacity = 0.16 + 0.58 * (0.4 + 0.6 * swashA);
  if (foamMaterial.map) foamMaterial.map.offset.x = elapsed * 0.03;

  const wetDepth = THREE.MathUtils.lerp(WET_MIN_DEPTH, WET_MAX_DEPTH, wash);
  wetSand.scale.y = wetDepth / WET_BAND_DEPTH;
  wetSand.position.z = WATERLINE_Z + wetDepth * 0.5;
  wetMaterial.opacity = 0.38 + 0.3 * wash;

  updateSandLevels();

  const streamTop = NECK_Y - 0.015;
  const streamBottomLevel = -heightForVolumeFraction(1 - fractionRemaining);
  // Fall all the way onto the pile surface instead of stopping mid-air.
  const streamBottom = streamBottomLevel + 0.04;
  const fallDist = Math.max(streamTop - streamBottom, 0.08);
  const positions = streamGeometry.attributes.position;
  if (streamPoints.visible) {
    for (let i = 0; i < STREAM_COUNT; i++) {
      const t = (elapsed * streamSpeeds[i] + streamPhases[i]) % 1;
      // Ease in slightly so grains accelerate as they fall.
      const ease = t * t;
      const y = streamTop - ease * fallDist;
      const wobble = Math.sin(elapsed * 8.0 + streamPhases[i] * 14.0) * 0.0025;
      const ang = streamPhases[i] * Math.PI * 2 + elapsed * 0.4;
      const r = streamRadii[i] * (1 - t * 0.25);
      positions.setX(i, Math.cos(ang) * r + wobble);
      positions.setY(i, y);
      positions.setZ(i, Math.sin(ang) * r);
    }
    positions.needsUpdate = true;
  }

  controls.update();
  composer.render();

  if (elapsed > 0.05) hideLoadingScreen();
}

animate();
