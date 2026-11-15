import './style.css';
import * as THREE from 'three';
import { Builder } from './builder';
import { CATALOG, CATEGORIES, ICONS, PartDef, getDef } from './parts';
import { analyze, Analysis } from './setup';
import { ControlInput, DroneSim, FlightMode } from './sim';
import { createWorld, World } from './world';

// ------------------------------------------------------------------ DOM

const app = document.getElementById('app')!;
app.innerHTML = `
<header class="topbar">
  <div class="brand"><svg viewBox="0 0 24 24" class="logo">${ICONS.frame}</svg><b>SkyForge</b><small>drone builder &amp; flight sim</small></div>
  <nav class="steps"><span id="step-build" class="step active">1 · Build</span><span class="sep">›</span><span id="step-fly" class="step">2 · Fly</span></nav>
  <div class="top-actions" id="top-build">
    <button id="btn-racer" class="ghost">Quick-build Racer</button>
    <button id="btn-explorer" class="ghost">Quick-build Explorer</button>
    <button id="btn-clear" class="ghost danger">Clear</button>
  </div>
  <div class="top-actions hidden" id="top-fly"><button id="btn-back" class="ghost">← Back to workshop</button></div>
</header>
<main class="layout">
  <aside class="panel left" id="inventory">
    <div class="panel-head"><h2>Parts bin</h2><p>Drag a part onto the drone — or click to auto-install.</p></div>
    <div id="inv-list"></div>
  </aside>
  <section class="viewport" id="viewport">
    <canvas id="c"></canvas>
    <div class="hint" id="hint"></div>
    <div class="toast" id="toast"></div>
    <div class="hud hidden" id="hud">
      <div class="hud-row">
        <div class="hud-card"><label>ALT</label><b id="h-alt">0.0</b><span>m</span></div>
        <div class="hud-card"><label>SPEED</label><b id="h-spd">0</b><span>km/h</span></div>
        <div class="hud-card wide"><label>BATTERY</label><b id="h-bat">100</b><span>%</span><em id="h-volt"></em><div class="bar"><i id="h-batbar"></i></div></div>
        <div class="hud-card wide"><label>THROTTLE</label><b id="h-thr">0</b><span>%</span><div class="bar"><i id="h-thrbar"></i></div></div>
        <div class="hud-card"><label>GATE</label><b id="h-gate">1/8</b><span id="h-lap"></span></div>
      </div>
      <div class="hud-modes" id="h-modes"></div>
      <div class="hud-msg" id="h-msg"></div>
      <div class="hud-help">
        <div><kbd>W</kbd><kbd>S</kbd> throttle / climb</div>
        <div><kbd>A</kbd><kbd>D</kbd> yaw</div>
        <div><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> pitch / roll</div>
        <div><kbd>Enter</kbd> arm/disarm · <kbd>R</kbd> reset</div>
        <div><kbd>C</kbd> camera · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> flight mode</div>
        <div class="muted">Gamepad supported (mode 2)</div>
      </div>
      <div class="horizon" id="horizon"><div class="sky" id="hz-sky"></div><div class="mark"></div></div>
    </div>
  </section>
  <aside class="panel right" id="inspector">
    <section><h3>Selected part</h3><div id="sel" class="sel"></div></section>
    <section><h3>Pre-flight checklist</h3><ul id="checklist" class="checklist"></ul></section>
    <section><h3>Build stats</h3><div class="stats" id="stats"></div></section>
    <button id="btn-fly" class="fly" disabled>FLY ▶</button>
  </aside>
</main>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const viewport = $('viewport');
const canvas = $<HTMLCanvasElement>('c');

// ------------------------------------------------------------------ renderer

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const builder = new Builder(viewport, canvas);
let world: World | null = null;
const flyCam = new THREE.PerspectiveCamera(70, 1, 0.02, 800);

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  builder.camera.aspect = w / h;
  builder.camera.updateProjectionMatrix();
  flyCam.aspect = w / h;
  flyCam.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);

// ------------------------------------------------------------------ toast

let toastTimer = 0;
function toast(msg: string) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 2800);
}
builder.onToast = toast;

// ------------------------------------------------------------------ inventory

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

function renderInventory() {
  const list = $('inv-list');
  list.innerHTML = CATEGORIES.map((cat) => `
    <div class="cat">
      <div class="cat-head"><span>${cat.label}</span><small>${cat.note}</small></div>
      ${CATALOG.filter((d) => d.kind === cat.kind).map((d) => `
        <div class="card" data-id="${d.id}" title="${d.desc}">
          <div class="icon" style="--c:${hex(d.kind === 'esc' || d.kind === 'camera' || d.kind === 'frame' ? 0x8a93a6 : d.color)}"><svg viewBox="0 0 24 24">${ICONS[d.kind]}</svg></div>
          <div class="info"><b>${d.name}</b><small>${d.specs} · ${Math.round(d.mass * 1000)} g</small></div>
          <span class="badge" data-badge="${d.id}"></span>
        </div>`).join('')}
    </div>`).join('');

  let pendingCard: { def: PartDef; x: number; y: number } | null = null;
  list.addEventListener('pointerdown', (e) => {
    const card = (e.target as HTMLElement).closest('.card') as HTMLElement | null;
    if (!card || e.button !== 0) return;
    e.preventDefault();
    pendingCard = { def: getDef(card.dataset.id!), x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointermove', (e) => {
    if (pendingCard && Math.hypot(e.clientX - pendingCard.x, e.clientY - pendingCard.y) > 6) {
      builder.startDrag(pendingCard.def, e);
      pendingCard = null;
    }
  });
  window.addEventListener('pointerup', () => {
    if (pendingCard) builder.autoPlace(pendingCard.def);
    pendingCard = null;
  });
}
renderInventory();

// ------------------------------------------------------------------ inspector

let analysis: Analysis = analyze(builder);
const ICON_LV = { ok: '✓', error: '✕', warn: '!', info: 'i' };

function renderSelected() {
  const el = $('sel');
  const p = builder.selected;
  if (!p) {
    el.innerHTML = `<p class="muted">Click a part on the drone to inspect it. Drag it to move it, or drag it off the drone to remove it.</p>`;
    return;
  }
  const d = p.def;
  let extra = '';
  if (d.kind === 'prop') {
    const need = p.slot.spin!;
    const ok = d.dir === need;
    extra = `<p class="${ok ? 'good' : 'bad'}">This motor spins <b>${need}</b> — prop is <b>${d.dir}</b> ${ok ? '✓' : '✕'}</p>
      <button id="sel-flip" class="ghost">⟲ Swap for ${d.dir === 'CW' ? 'CCW' : 'CW'} prop</button>`;
  }
  if (d.kind === 'battery') {
    extra = `<label class="slider">Battery position <span>front ↔ back</span>
      <input type="range" id="sel-rail" min="0" max="1" step="0.01" value="${p.railT}"></label>
      <p class="muted">Slide it until the CoG offset is near 0 mm.</p>`;
  }
  el.innerHTML = `
    <div class="sel-head"><div class="icon" style="--c:${hex(d.color)}"><svg viewBox="0 0 24 24">${ICONS[d.kind]}</svg></div>
    <div><b>${d.name}</b><small>${p.slot.label} · ${Math.round(d.mass * 1000)} g</small></div></div>
    <p>${d.desc}</p>${extra}
    <button id="sel-remove" class="ghost danger">Remove${d.kind === 'frame' ? ' frame (and everything on it)' : ''}</button>`;
  $('sel-remove').onclick = () => builder.remove(p.slot.id);
  const flip = document.getElementById('sel-flip');
  if (flip) flip.onclick = () => builder.flipProp(p.slot.id);
  const rail = document.getElementById('sel-rail') as HTMLInputElement | null;
  if (rail) rail.oninput = () => builder.setRailT(p.slot.id, parseFloat(rail.value));
}

function renderAnalysis() {
  analysis = analyze(builder);
  const a = analysis;
  $('checklist').innerHTML = a.items.map((i) => `<li class="${i.level}"><span>${ICON_LV[i.level]}</span>${i.text}</li>`).join('');
  const kg = (n: number) => (n / 9.81).toFixed(2);
  $('stats').innerHTML = `
    <div><label>All-up weight</label><b>${Math.round(a.mass * 1000)} g</b></div>
    <div><label>Max thrust</label><b>${kg(a.totalThrust)} kg</b></div>
    <div><label>Thrust / weight</label><b class="${a.twr >= 2 ? 'good' : a.twr >= 1.3 ? 'warnc' : 'bad'}">${a.twr ? a.twr.toFixed(1) + ':1' : '—'}</b></div>
    <div><label>Hover time</label><b>${a.flightTimeMin ? a.flightTimeMin.toFixed(1) + ' min' : '—'}</b></div>
    <div><label>CoG offset</label><b class="${a.cogOffsetMm > 14 ? 'warnc' : ''}">${a.mass ? a.cogOffsetMm.toFixed(0) + ' mm' : '—'}</b></div>
    <div><label>Parts</label><b>${builder.placed.size}</b></div>`;
  const fly = $<HTMLButtonElement>('btn-fly');
  fly.disabled = !a.canFly;
  fly.textContent = a.canFly ? 'FLY ▶' : `Fix ${a.items.filter((i) => i.level === 'error').length} issue(s) to fly`;
  $('hint').textContent = a.hint;
  $('hint').className = 'hint ' + (a.canFly ? 'ready' : '');

  const counts = new Map<string, number>();
  for (const p of builder.placed.values()) counts.set(p.def.id, (counts.get(p.def.id) ?? 0) + 1);
  document.querySelectorAll<HTMLElement>('[data-badge]').forEach((b) => {
    const n = counts.get(b.dataset.badge!) ?? 0;
    b.textContent = n ? `×${n}` : '';
  });
}

builder.onChange = (light) => {
  if (!light) renderSelected();
  renderAnalysis();
};
builder.onChange();

$('btn-racer').onclick = () => builder.autoBuild('racer');
$('btn-explorer').onclick = () => builder.autoBuild('explorer');
$('btn-clear').onclick = () => builder.clear();
$('btn-fly').onclick = () => enterFly();
$('btn-back').onclick = () => exitFly();

// ------------------------------------------------------------------ flight

type CamMode = 'chase' | 'fpv' | 'los';
let mode: 'build' | 'fly' = 'build';
let sim: DroneSim | null = null;
let flyGroup: THREE.Group | null = null;
let props: { spinner: THREE.Object3D; disc: THREE.Mesh; idx: number }[] = [];
let camMode: CamMode = 'chase';
let nextGate = 0;
let lapStart = 0;
let lapRunning = false;
let bestLap = Infinity;
let simTime = 0;
let flashMsg = '';
let flashUntil = 0;

const stick = { thr: 0, yaw: 0, pitch: 0, roll: 0 };
let thr01 = 0;
const keys = new Set<string>();

function enterFly() {
  const a = analyze(builder);
  if (!a.canFly || !a.config) return;
  if (!world) world = createWorld();
  if (flyGroup) world.scene.remove(flyGroup);

  sim = new DroneSim(a.config);
  sim.mode = 'althold';
  const vis = builder.droneRoot.clone(true);
  vis.position.set(0, 0, 0);
  props = [];
  vis.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData.disc) o.castShadow = true;
    const sid: string | undefined = o.userData.slotId;
    if (sid?.startsWith('prop-')) {
      const idx = sim!.cfg.motors.findIndex((m) => 'prop-' + m.slot === sid);
      let spinner: THREE.Object3D | null = null;
      let disc: THREE.Mesh | null = null;
      o.traverse((c) => {
        if (c.userData.spinner) spinner = c;
        if (c.userData.disc) {
          disc = c as THREE.Mesh;
          disc.material = (disc.material as THREE.Material).clone();
        }
      });
      if (spinner && disc && idx >= 0) props.push({ spinner, disc, idx });
    }
  });
  flyGroup = new THREE.Group();
  flyGroup.add(vis);
  world.scene.add(flyGroup);
  resetFlight();

  mode = 'fly';
  camMode = 'chase';
  document.body.classList.add('mode-fly');
  $('top-build').classList.add('hidden');
  $('top-fly').classList.remove('hidden');
  $('step-build').classList.remove('active');
  $('step-fly').classList.add('active');
  $('hud').classList.remove('hidden');
  requestAnimationFrame(resize);
}

function exitFly() {
  mode = 'build';
  document.body.classList.remove('mode-fly');
  $('top-build').classList.remove('hidden');
  $('top-fly').classList.add('hidden');
  $('step-build').classList.add('active');
  $('step-fly').classList.remove('active');
  $('hud').classList.add('hidden');
  requestAnimationFrame(resize);
}

function resetFlight() {
  if (!sim || !world) return;
  sim.reset(world.spawn, 0);
  thr01 = 0;
  nextGate = 0;
  lapRunning = false;
  world.setNextGate(0);
  const o = sim.frameOrigin();
  flyCam.position.set(o.x, o.y + 0.8, o.z + 2.5);
}

function flash(msg: string, secs = 2.5) {
  flashMsg = msg;
  flashUntil = simTime + secs;
}

function setMode(m: FlightMode) {
  if (!sim) return;
  if (m === 'gps' && !sim.cfg.hasGPS) return flash('No GPS installed — add one in the workshop');
  sim.mode = m;
  if (m === 'angle') thr01 = sim.onGround ? 0 : Math.sqrt(Math.min(1, (sim.cfg.mass * 9.81) / sim.totalMax));
  flash({ angle: 'MANUAL — you control the throttle', althold: 'ALT HOLD — stick sets climb rate', gps: 'GPS HOLD — drone holds position' }[m]);
}

window.addEventListener('keydown', (e) => {
  if (mode !== 'fly' || !sim) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  switch (e.code) {
    case 'Enter':
      if (sim.crashed) break;
      if (sim.armed) { sim.armed = false; flash('DISARMED'); }
      else if (!sim.onGround) break;
      else if (sim.mode === 'angle' && thr01 > 0.05) flash('Lower the throttle (S) before arming');
      else if (sim.battery <= 0) flash('Battery empty — press R');
      else { sim.armed = true; flash('ARMED — props spinning!'); }
      break;
    case 'KeyR': resetFlight(); break;
    case 'KeyC': {
      const order: CamMode[] = ['chase', 'fpv', 'los'];
      let i = order.indexOf(camMode);
      do i = (i + 1) % 3; while (order[i] === 'fpv' && !sim.cfg.hasCamera);
      camMode = order[i];
      flash({ chase: 'Chase camera', fpv: 'FPV camera', los: 'Line-of-sight (pilot view)' }[camMode], 1.2);
      break;
    }
    case 'Digit1': setMode('angle'); break;
    case 'Digit2': setMode('althold'); break;
    case 'Digit3': setMode('gps'); break;
    case 'Escape': exitFly(); break;
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

function readInput(dt: number): ControlInput {
  const k = (c: string) => (keys.has(c) ? 1 : 0);
  const target = {
    thr: k('KeyW') - k('KeyS'),
    yaw: k('KeyD') - k('KeyA'),
    pitch: k('ArrowUp') - k('ArrowDown'),
    roll: k('ArrowRight') - k('ArrowLeft'),
  };
  const pad = navigator.getGamepads?.().find((g) => g && g.axes.length >= 4);
  if (pad) {
    const dz = (v: number) => (Math.abs(v) < 0.12 ? 0 : v);
    const ax = pad.axes.map(dz);
    if (ax.some((v) => v !== 0)) {
      target.yaw = ax[0] || target.yaw;
      target.thr = -ax[1] || target.thr;
      target.roll = ax[2] || target.roll;
      target.pitch = -ax[3] || target.pitch;
    }
  }
  const a = 1 - Math.exp(-dt * 9);
  stick.thr += (target.thr - stick.thr) * a;
  stick.yaw += (target.yaw - stick.yaw) * a;
  stick.pitch += (target.pitch - stick.pitch) * a;
  stick.roll += (target.roll - stick.roll) * a;
  thr01 = THREE.MathUtils.clamp(thr01 + target.thr * 0.35 * dt, 0, 1);
  return { thr: stick.thr, thr01, yaw: stick.yaw, pitch: stick.pitch, roll: stick.roll };
}

const _prev = new THREE.Vector3();
const _o = new THREE.Vector3();
const _look = new THREE.Vector3();
const _off = new THREE.Vector3();
const UPTILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(20));

function updateFly(dt: number) {
  if (!sim || !world || !flyGroup) return;
  simTime += dt;
  const input = readInput(dt);
  _prev.copy(sim.pos);
  const wasCrashed = sim.crashed;
  sim.update(dt, input, world.colliders);
  if (!wasCrashed && sim.crashed && sim.cfg.motors.some((m) => !m.propOk)) sim.crashReason += ' — check your prop directions!';

  // gates
  const g = world.gates[nextGate];
  const s0 = _prev.clone().sub(g.center).dot(g.normal);
  const s1 = sim.pos.clone().sub(g.center).dot(g.normal);
  if (s0 < 0 && s1 >= 0 && !sim.crashed) {
    const t = s0 / (s0 - s1);
    const hit = _prev.clone().lerp(sim.pos, t);
    if (hit.distanceTo(g.center) < g.radius) {
      if (nextGate === 0) {
        if (lapRunning) {
          const lap = simTime - lapStart;
          const best = lap < bestLap;
          bestLap = Math.min(bestLap, lap);
          flash(`LAP ${lap.toFixed(2)} s${best ? ' — NEW BEST!' : ''}`, 3);
        } else flash('Lap started — fly through the green gates!', 2);
        lapStart = simTime;
        lapRunning = true;
      }
      nextGate = (nextGate + 1) % world.gates.length;
      world.setNextGate(nextGate);
    }
  }

  // visuals
  sim.frameOrigin(_o);
  flyGroup.position.copy(_o);
  flyGroup.quaternion.copy(sim.q);
  for (const p of props) {
    const mc = sim.cfg.motors[p.idx];
    const ratio = sim.thrust[p.idx] / mc.maxThrust;
    const spinning = sim.armed || sim.thrust[p.idx] > 0.01;
    const speed = spinning ? 25 + 220 * ratio : 0;
    p.spinner.rotation.y -= mc.spin * speed * dt;
    (p.disc.material as THREE.MeshBasicMaterial).opacity = spinning ? Math.min(0.2, 0.06 + ratio * 0.4) : 0;
  }

  // camera
  const sc = sim.cfg.sizeScale;
  if (camMode === 'fpv' && sim.cfg.cameraPos) {
    flyCam.position.copy(sim.cfg.cameraPos).applyQuaternion(sim.q).add(_o);
    flyCam.quaternion.copy(sim.q).multiply(UPTILT);
    flyCam.fov = 100;
    flyCam.near = 0.01;
  } else if (camMode === 'los') {
    flyCam.position.copy(world.pilot);
    flyCam.lookAt(sim.pos);
    const dist = world.pilot.distanceTo(sim.pos);
    flyCam.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(2.5 / dist)), 8, 60);
    flyCam.near = 0.05;
  } else {
    const yaw = sim.heading;
    _off.set(0, 0.55 * sc, 1.7 * sc).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const desired = _look.copy(sim.pos).add(_off);
    desired.y = Math.max(desired.y, 0.15);
    flyCam.position.lerp(desired, 1 - Math.exp(-dt * 5));
    flyCam.lookAt(sim.pos.x, sim.pos.y + 0.1 * sc, sim.pos.z);
    flyCam.fov = 70;
    flyCam.near = 0.02;
  }
  flyCam.updateProjectionMatrix();

  world.sun.position.copy(sim.pos).add(new THREE.Vector3(18, 35, 12));
  world.sun.target.position.copy(sim.pos);

  updateHUD();
}

function updateHUD() {
  if (!sim) return;
  $('h-alt').textContent = Math.max(0, sim.altitude).toFixed(1);
  $('h-spd').textContent = (sim.vel.length() * 3.6).toFixed(0);
  const bat = Math.round(sim.battery * 100);
  $('h-bat').textContent = String(bat);
  $('h-volt').textContent = sim.voltage.toFixed(1) + ' V';
  const bb = $('h-batbar');
  bb.style.width = bat + '%';
  bb.style.background = bat > 40 ? 'var(--ok)' : bat > 15 ? 'var(--warn)' : 'var(--bad)';
  const thr = Math.round(sim.throttleFrac * 100);
  $('h-thr').textContent = String(thr);
  $('h-thrbar').style.width = thr + '%';
  $('h-gate').textContent = `${nextGate + 1}/${world!.gates.length}`;
  $('h-lap').textContent = lapRunning ? (simTime - lapStart).toFixed(1) + 's' : bestLap < Infinity ? `best ${bestLap.toFixed(1)}s` : '';

  const modes: [FlightMode, string, boolean][] = [
    ['angle', '1 · Manual', true], ['althold', '2 · Alt hold', true], ['gps', '3 · GPS hold', sim.cfg.hasGPS],
  ];
  $('h-modes').innerHTML =
    modes.map(([m, l, ok]) => `<span class="chip ${sim!.mode === m ? 'on' : ''} ${ok ? '' : 'off'}">${l}</span>`).join('') +
    `<span class="chip ${sim.armed ? 'armed' : ''}">${sim.armed ? 'ARMED' : 'DISARMED'}</span>`;

  let msg = '';
  if (sim.crashed) msg = `💥 CRASHED — ${sim.crashReason}<small>Press R to reset · Esc to return to the workshop</small>`;
  else if (sim.battery <= 0) msg = '🔋 Battery depleted<small>Press R to reset</small>';
  else if (simTime < flashUntil) msg = flashMsg;
  else if (!sim.armed && sim.onGround) msg = 'Press ENTER to arm motors<small>then hold W to take off</small>';
  else if (sim.battery < 0.15) msg = '⚠ LOW BATTERY — land now';
  const m = $('h-msg');
  m.innerHTML = msg;
  m.style.opacity = msg ? '1' : '0';

  // mini attitude indicator
  const e = new THREE.Euler().setFromQuaternion(sim.q, 'YXZ');
  $('hz-sky').style.transform = `rotate(${THREE.MathUtils.radToDeg(e.z)}deg) translateY(${THREE.MathUtils.radToDeg(e.x) * 0.9}px)`;
}

// ------------------------------------------------------------------ loop

let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mode === 'build') {
    builder.update(dt);
    renderer.render(builder.scene, builder.camera);
  } else if (world) {
    updateFly(dt);
    renderer.render(world.scene, flyCam);
  }
  requestAnimationFrame(loop);
}
resize();
requestAnimationFrame(loop);
