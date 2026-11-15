import * as THREE from 'three';
import type { Builder } from './builder';
import { CORNERS, frameLayout, motorThrust, powerCoef } from './parts';
import type { DroneConfig, MotorCfg } from './sim';

export type Level = 'ok' | 'error' | 'warn' | 'info';
export interface CheckItem { level: Level; text: string }

export interface Analysis {
  items: CheckItem[];
  canFly: boolean;
  mass: number;
  totalThrust: number;
  twr: number;
  flightTimeMin: number;
  cogOffsetMm: number;
  hint: string;
  config: DroneConfig | null;
}

const G = 9.81;

export function analyze(b: Builder): Analysis {
  const items: CheckItem[] = [];
  const add = (level: Level, text: string) => items.push({ level, text });
  const P = (id: string) => b.placed.get(id);
  const frame = P('frame');

  // ---- mass & centre of gravity (from where parts actually sit)
  b.droneRoot.updateMatrixWorld(true);
  let mass = 0;
  const cog = new THREE.Vector3();
  const points: { m: number; p: THREE.Vector3 }[] = [];
  const box = new THREE.Box3();
  for (const p of b.placed.values()) {
    const center = box.setFromObject(p.mesh).getCenter(new THREE.Vector3());
    b.droneRoot.worldToLocal(center);
    if (p.def.kind === 'frame') {
      // spread frame mass: 40% centre, 60% along the arms
      const L = p.def.armLength!;
      points.push({ m: p.def.mass * 0.4, p: new THREE.Vector3(0, 0.012, 0) });
      for (const c of CORNERS) {
        points.push({ m: p.def.mass * 0.15, p: new THREE.Vector3(c.x, 0, c.z).normalize().multiplyScalar(L * 0.55).setY(0.005) });
      }
    } else {
      points.push({ m: p.def.mass, p: center });
    }
  }
  for (const pt of points) {
    mass += pt.m;
    cog.addScaledVector(pt.p, pt.m);
  }
  if (mass > 0) cog.divideScalar(mass);
  const inertia = new THREE.Vector3(1e-4, 1e-4, 1e-4);
  for (const pt of points) {
    const r = pt.p.clone().sub(cog);
    inertia.x += pt.m * (r.y * r.y + r.z * r.z);
    inertia.y += pt.m * (r.x * r.x + r.z * r.z);
    inertia.z += pt.m * (r.x * r.x + r.y * r.y);
  }
  const cogOffsetMm = Math.hypot(cog.x, cog.z) * 1000;

  if (!frame) {
    add('error', 'Install a frame');
    return {
      items, canFly: false, mass, totalThrust: 0, twr: 0, flightTimeMin: 0, cogOffsetMm: 0, config: null,
      hint: 'Step 1 — drag a frame from the parts bin onto the workbench (or click it).',
    };
  }
  add('ok', `Frame: ${frame.def.name}`);
  const lay = frameLayout(frame.def);

  // ---- motors & props
  const battery = P('battery');
  const motors: MotorCfg[] = [];
  const motorCount = CORNERS.filter((c) => P('motor-' + c.id)).length;
  const propCount = CORNERS.filter((c) => P('prop-' + c.id)).length;
  let hint = '';
  const setHint = (h: string) => { if (!hint) hint = h; };

  if (motorCount < 4) {
    add('error', `Motors installed: ${motorCount}/4`);
    setHint('Step 2 — mount a motor at the end of each arm.');
  } else {
    const kinds = new Set(CORNERS.map((c) => P('motor-' + c.id)!.def.id));
    if (kinds.size > 1) add('warn', 'Mixed motor models — the drone will pull to one side at full throttle');
    else add('ok', 'Motors: 4/4');
  }

  if (propCount < 4) {
    add('error', `Propellers installed: ${propCount}/4`);
    setHint('Step 3 — put a propeller on each motor. Match the ↻ CW / ↺ CCW labels!');
  } else {
    add('ok', 'Propellers: 4/4');
  }

  let anyBigProp = false;
  let wrongDir = 0;
  for (const c of CORNERS) {
    const mo = P('motor-' + c.id);
    const pr = P('prop-' + c.id);
    if (!mo || !pr) continue;
    if (pr.def.size! > frame.def.maxProp!) anyBigProp = true;
    const ok = pr.def.dir === c.spin;
    if (!ok) {
      wrongDir++;
      add('warn', `${c.label} prop is ${pr.def.dir} but that motor spins ${c.spin} — it will push DOWN and flip the drone!`);
    }
    const r = pr.def.size! / mo.def.idealProp!;
    if (r > 1.2) add('warn', `${c.label}: ${mo.def.name} will overheat swinging ${pr.def.size}" props`);
    else if (r < 0.8) add('warn', `${c.label}: ${pr.def.size}" props are too small for ${mo.def.name} — weak thrust`);
    motors.push({
      slot: c.id,
      label: c.label,
      pos: lay.slots.find((s) => s.id === 'prop-' + c.id)!.pos.clone(),
      spin: c.spin === 'CW' ? 1 : -1,
      maxThrust: motorThrust(mo.def, pr.def, battery?.def ?? null),
      propOk: ok,
      propSize: pr.def.size!,
      powerCoef: powerCoef(mo.def, pr.def),
      yawCoef: 0.012 * (pr.def.size! / 5),
    });
  }
  if (anyBigProp) {
    add('error', `Props are too big for the ${frame.def.name} — they would strike each other (max ${frame.def.maxProp}")`);
    setHint(`Swap to ${frame.def.maxProp}" propellers — the current ones overlap.`);
  }
  if (propCount === 4 && wrongDir === 0) add('ok', 'Prop directions match motor rotation');

  // ---- electronics
  if (!P('esc')) {
    add('error', 'ESC missing — motors have no power driver');
    setHint('Step 4 — install the ESC in the centre of the frame.');
  } else add('ok', 'ESC installed');
  if (!P('fc')) {
    add('error', 'Flight controller missing — nothing to stabilise the drone');
    setHint('Step 5 — stack the flight controller on top of the ESC.');
  } else add('ok', 'Flight controller installed');
  if (!battery) {
    add('error', 'No battery');
    setHint('Step 6 — strap a battery onto the top plate.');
  } else add('ok', `Battery: ${battery.def.name}`);

  // ---- performance
  const totalThrust = motors.reduce((s, m) => s + m.maxThrust, 0);
  const twr = mass > 0 ? totalThrust / (mass * G) : 0;
  if (motors.length === 4 && battery) {
    if (twr < 1.3) {
      add('error', `Thrust-to-weight ${twr.toFixed(2)}:1 — too heavy to fly (need ≥ 1.3)`);
      setHint('Too heavy! Use a lighter battery or stronger motor/prop combo.');
    } else if (twr < 2) add('warn', `Thrust-to-weight ${twr.toFixed(1)}:1 — will feel sluggish`);
    else add('ok', `Thrust-to-weight ${twr.toFixed(1)}:1`);
  }
  if (battery) {
    if (cogOffsetMm > 14) add('warn', `Centre of gravity is ${cogOffsetMm.toFixed(0)} mm off-centre — slide the battery to balance`);
    else add('ok', `Balanced (CoG offset ${cogOffsetMm.toFixed(0)} mm)`);
  }

  // ---- optional
  if (P('camera')) add('ok', 'FPV camera — press C in flight for first-person view');
  else add('info', 'No camera — FPV view unavailable');
  if (P('gps')) add('ok', 'GPS — position-hold mode available (key 3)');
  else add('info', 'No GPS — position-hold mode unavailable');

  const canFly = !items.some((i) => i.level === 'error');
  let flightTimeMin = 0;
  let config: DroneConfig | null = null;
  if (motors.length === 4 && battery) {
    const capacityWh = (battery.def.cells! * 3.7 * battery.def.capacity!) / 1000;
    const hoverT = (mass * G) / 4;
    const hoverP = motors.reduce((s, m) => s + m.powerCoef * Math.pow(hoverT, 1.5), 3);
    flightTimeMin = ((capacityWh * 0.8) / hoverP) * 60;
    const clr = frame.def.clearance ?? 0;
    const d = frame.def.armLength! * Math.SQRT1_2;
    const feet = [new THREE.Vector3(0, -clr, 0), new THREE.Vector3(0, lay.propY + 0.03, 0)];
    for (const c of CORNERS) feet.push(new THREE.Vector3(c.x * d, clr > 0 ? -clr : 0.004, c.z * d));
    const cam = P('camera');
    config = {
      mass,
      cog,
      inertia,
      motors,
      clearance: clr,
      capacityWh,
      cells: battery.def.cells!,
      hasCamera: !!cam,
      cameraPos: cam ? cam.slot.pos.clone().add(new THREE.Vector3(0, 0.012, -0.02)) : null,
      hasGPS: !!P('gps'),
      radius: frame.def.armLength! + (motors[0]?.propSize ?? 5) * 0.0254 * 0.35,
      sizeScale: Math.sqrt(frame.def.armLength! / 0.125),
      feet,
    };
  }

  if (!hint) {
    hint = items.some((i) => i.level === 'warn')
      ? 'Ready to fly — but check the ⚠ warnings first. Press FLY when you dare.'
      : 'All systems go! Press FLY ▶';
  }

  return { items, canFly, mass, totalThrust, twr, flightTimeMin, cogOffsetMm, hint, config };
}
