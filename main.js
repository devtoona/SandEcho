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
  ui.rCaption.textContent = remainingMs > 0 ? '残された時間' : '砂は落ちきりました';

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
camera.position.set(0, 2.6, 7.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.8, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.minDistance = 5.5;
controls.maxDistance = 14;
controls.minPolarAngle = Math.PI * 0.28;
controls.maxPolarAngle = Math.PI * 0.5;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;
controls.update();

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

updateSun();

/* ---------- Environment map (from sky) for reflections ---------- */

const pmremGenerator = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(sky);
const envRT = pmremGenerator.fromScene(envScene, 0.04);
scene.environment = envRT.texture;
// Sky.js's physically-based horizon band is inevitably pale/hazy from this
// camera's near-level framing (it never tilts up toward the saturated
// zenith), which read as "overcast". Sky stays in envScene only, driving
// reflections/IBL — the visible backdrop is a hand-authored gradient so the
// sky reads as clear and sunny regardless of viewing angle.
function makeSkyGradientTexture(w = 512, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  // This camera only ever tilts between level and looking slightly down, so
  // the visible sky band sits around v≈0.33–0.50 (never reaches the paler
  // zenith/near-horizon-haze tones) — keep that whole band a saturated blue.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1560a3');
  grad.addColorStop(0.25, '#2d86c9');
  grad.addColorStop(0.45, '#57addd');
  grad.addColorStop(0.5, '#79c2e6');
  grad.addColorStop(0.58, '#a8dcee');
  grad.addColorStop(0.7, '#dff4f0');
  grad.addColorStop(1, '#eaf6f2');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
scene.background = makeSkyGradientTexture();

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

// Hourglass needs coarser UV repeat so grain reads up close.
const hgSandMap = wrapSandTexture(sandMaps.map.clone(), 2.4, THREE.SRGBColorSpace);
const hgSandRough = wrapSandTexture(sandMaps.roughnessMap.clone(), 2.4);
const hgSandNormal = wrapSandTexture(sandMaps.normalMap.clone(), 2.4);

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
  color: 0xf2d08a,
  map: hgSandMap,
  roughnessMap: hgSandRough,
  roughness: 0.92,
  normalMap: hgSandNormal,
  normalScale: new THREE.Vector2(0.7, 0.7),
  metalness: 0.02,
  envMapIntensity: 0.28,
});

function buildSandLathe(fromY, toY) {
  const pts = fullProfile
    .filter((p) => p.y >= fromY - 1e-6 && p.y <= toY + 1e-6)
    .map((p) => new THREE.Vector2(Math.max(p.r * SAND_INSET, 0.001), p.y));
  return new THREE.LatheGeometry(pts, 48);
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

// A perfectly flat, perfectly circular disc reads as a mathematical surface,
// not settled granular sand. Build a real radial grid (concentric rings, not
// CircleGeometry's single-ring fan) so noise + a parabolic mound/dimple bias
// have enough vertices to actually read as a grainy, gently piled surface.
function buildSandCapGeometry(moundHeight, noiseSeed, rings = 14, radialSegments = 48) {
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
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const radius = Math.sqrt(x * x + y * y);
    // Every displacement term must vanish exactly at the rim (radius===1) —
    // the noise wasn't falling off before, so the noisy rim no longer sat
    // flush against the clipped glass-shell edge, leaving gaps that looked
    // like the sand had gone see-through when viewed from above.
    const edgeFalloff = Math.max(0, 1 - radius * radius);
    let h = moundHeight * edgeFalloff;
    h += noise.noise(x * 6, y * 6, noiseSeed) * 0.016 * edgeFalloff;
    h += noise.noise(x * 15, y * 15, noiseSeed + 5) * 0.006 * edgeFalloff;
    h += noise.noise(x * 32, y * 32, noiseSeed + 9) * 0.0025 * edgeFalloff;
    pos.setZ(i, h);
  }
  geo.computeVertexNormals();
  return geo;
}

// Sand funnels down into the neck (dimple) at the top, and piles up (mound)
// where it lands at the bottom.
const topCapGeometry = buildSandCapGeometry(-0.05, 1);
const bottomCapGeometry = buildSandCapGeometry(0.07, 7);
const topCapMaterial = sandMaterial.clone();
topCapMaterial.roughness = 0.82;
const bottomCapMaterial = sandMaterial.clone();
bottomCapMaterial.roughness = 0.78;
bottomCapMaterial.envMapIntensity = 0.34;
const topCap = new THREE.Mesh(topCapGeometry, topCapMaterial);
const bottomCap = new THREE.Mesh(bottomCapGeometry, bottomCapMaterial);
topCap.rotation.x = -Math.PI / 2;
bottomCap.rotation.x = -Math.PI / 2;
topCap.receiveShadow = true;
bottomCap.receiveShadow = true;
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

const STREAM_COUNT = 72;
const streamGeometry = new THREE.BufferGeometry();
const streamPositions = new Float32Array(STREAM_COUNT * 3);
const streamColors = new Float32Array(STREAM_COUNT * 3);
const streamPhases = new Float32Array(STREAM_COUNT);
const streamSpeeds = new Float32Array(STREAM_COUNT);
const streamRadii = new Float32Array(STREAM_COUNT);
for (let i = 0; i < STREAM_COUNT; i++) {
  streamPhases[i] = Math.random();
  streamSpeeds[i] = 1.25 + Math.random() * 0.9;
  streamRadii[i] = Math.random() * 0.018;
  const ang = Math.random() * Math.PI * 2;
  streamPositions[i * 3] = Math.cos(ang) * streamRadii[i];
  streamPositions[i * 3 + 1] = 0;
  streamPositions[i * 3 + 2] = Math.sin(ang) * streamRadii[i];
  const warm = 0.85 + Math.random() * 0.15;
  streamColors[i * 3] = warm;
  streamColors[i * 3 + 1] = 0.72 + Math.random() * 0.18;
  streamColors[i * 3 + 2] = 0.42 + Math.random() * 0.2;
}
streamGeometry.setAttribute('position', new THREE.BufferAttribute(streamPositions, 3));
streamGeometry.setAttribute('color', new THREE.BufferAttribute(streamColors, 3));
const streamMaterial = new THREE.PointsMaterial({
  size: 0.024,
  transparent: true,
  opacity: 0.82,
  sizeAttenuation: true,
  vertexColors: true,
  depthWrite: false,
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

  const streamTop = NECK_Y - 0.02;
  const streamBottomLevel = -heightForVolumeFraction(1 - fractionRemaining);
  const dropRange = 0.5;
  const streamBottom = Math.max(streamBottomLevel + 0.05, streamTop - dropRange);
  const positions = streamGeometry.attributes.position;
  if (streamPoints.visible) {
    for (let i = 0; i < STREAM_COUNT; i++) {
      const t = (elapsed * streamSpeeds[i] + streamPhases[i]) % 1;
      const y = streamTop - t * (streamTop - streamBottom);
      // Slight lateral wobble as grains fall.
      const wobble = Math.sin(elapsed * 6.5 + streamPhases[i] * 12.0) * 0.003;
      const ang = streamPhases[i] * Math.PI * 2;
      const r = streamRadii[i] * (1 - t * 0.35);
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
