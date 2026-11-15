import * as THREE from 'three';

export type PartKind = 'frame' | 'motor' | 'prop' | 'battery' | 'fc' | 'esc' | 'camera' | 'gps';
export type SpinDir = 'CW' | 'CCW';

export interface PartDef {
  id: string;
  kind: PartKind;
  name: string;
  specs: string;
  desc: string;
  mass: number; // kg
  color: number;
  // frame
  armLength?: number; // m, centre → motor
  maxProp?: number; // inches
  clearance?: number; // m, frame origin → ground contact
  // motor
  kv?: number;
  baseThrust?: number; // N per motor with its ideal prop on 4S
  idealProp?: number; // inches
  radius?: number; // m
  // prop
  size?: number; // inches
  dir?: SpinDir;
  blades?: number;
  // battery
  cells?: number;
  capacity?: number; // mAh
  dims?: [number, number, number]; // w, h, l (m)
}

export interface SlotDef {
  id: string;
  accepts: PartKind;
  label: string;
  pos: THREE.Vector3; // in frame-local space
  rail?: [THREE.Vector3, THREE.Vector3];
  spin?: SpinDir;
  parent?: string; // slot that must be filled first
}

export const CATEGORIES: { kind: PartKind; label: string; note: string }[] = [
  { kind: 'frame', label: 'Frames', note: 'Required · start here' },
  { kind: 'motor', label: 'Motors', note: 'Required · ×4' },
  { kind: 'prop', label: 'Propellers', note: 'Required · ×4 · match spin!' },
  { kind: 'esc', label: 'ESC', note: 'Required' },
  { kind: 'fc', label: 'Flight controller', note: 'Required' },
  { kind: 'battery', label: 'Batteries', note: 'Required' },
  { kind: 'camera', label: 'Camera', note: 'Optional · FPV view' },
  { kind: 'gps', label: 'GPS', note: 'Optional · position hold' },
];

export const CATALOG: PartDef[] = [
  {
    id: 'frame-250', kind: 'frame', name: 'Racer 250', specs: '250 mm · 5" props max', mass: 0.11, color: 0x2b2e35,
    desc: 'Compact, stiff carbon racing frame. Light and agile.', armLength: 0.125, maxProp: 5, clearance: 0,
  },
  {
    id: 'frame-450', kind: 'frame', name: 'Explorer 450', specs: '450 mm · 10" props max', mass: 0.28, color: 0x2b2e35,
    desc: 'Large stable frame with landing skids. Carries big batteries and GPS.', armLength: 0.225, maxProp: 10, clearance: 0.07,
  },
  {
    id: 'motor-2306', kind: 'motor', name: '2306 · 2400KV', specs: 'High-KV · best with 5"', mass: 0.032, color: 0xe5484d,
    desc: 'Fast-spinning racing motor. ~1.3 kg thrust on 4S with 5" props.', kv: 2400, baseThrust: 13, idealProp: 5, radius: 0.0145,
  },
  {
    id: 'motor-2212', kind: 'motor', name: '2212 · 920KV', specs: 'Low-KV · best with 10"', mass: 0.056, color: 0x3e7bfa,
    desc: 'Efficient torque motor for big props. ~0.9 kg thrust on 4S with 10" props.', kv: 920, baseThrust: 9, idealProp: 10, radius: 0.016,
  },
  {
    id: 'prop-5-cw', kind: 'prop', name: '5" tri-blade · CW', specs: 'Clockwise spin', mass: 0.0045, color: 0xff8a2a,
    desc: 'Clockwise (seen from above) 5" racing prop.', size: 5, dir: 'CW', blades: 3,
  },
  {
    id: 'prop-5-ccw', kind: 'prop', name: '5" tri-blade · CCW', specs: 'Counter-clockwise spin', mass: 0.0045, color: 0x2ad4ff,
    desc: 'Counter-clockwise (seen from above) 5" racing prop.', size: 5, dir: 'CCW', blades: 3,
  },
  {
    id: 'prop-10-cw', kind: 'prop', name: '10" two-blade · CW', specs: 'Clockwise spin', mass: 0.012, color: 0xff8a2a,
    desc: 'Clockwise 10" efficient prop for large frames.', size: 10, dir: 'CW', blades: 2,
  },
  {
    id: 'prop-10-ccw', kind: 'prop', name: '10" two-blade · CCW', specs: 'Counter-clockwise spin', mass: 0.012, color: 0x2ad4ff,
    desc: 'Counter-clockwise 10" efficient prop for large frames.', size: 10, dir: 'CCW', blades: 2,
  },
  {
    id: 'esc-4in1', kind: 'esc', name: '45A 4-in-1 ESC', specs: 'Drives all 4 motors', mass: 0.014, color: 0x18191c,
    desc: 'Electronic speed controller — turns flight-controller commands into motor power.',
  },
  {
    id: 'fc-f4', kind: 'fc', name: 'F4 Flight Controller', specs: 'Gyro + PID stabilisation', mass: 0.008, color: 0x1f8a4c,
    desc: 'The brain. Reads the gyro and adjusts each motor hundreds of times per second.',
  },
  {
    id: 'bat-3s-1300', kind: 'battery', name: '3S 1300 mAh LiPo', specs: '11.1 V · 14 Wh', mass: 0.115, color: 0x2a9d8f,
    desc: 'Light, low-voltage pack. Gentle power.', cells: 3, capacity: 1300, dims: [0.034, 0.024, 0.07],
  },
  {
    id: 'bat-4s-1500', kind: 'battery', name: '4S 1500 mAh LiPo', specs: '14.8 V · 22 Wh', mass: 0.185, color: 0xe9c46a,
    desc: 'The racing standard. Punchy and light.', cells: 4, capacity: 1500, dims: [0.036, 0.03, 0.076],
  },
  {
    id: 'bat-4s-5000', kind: 'battery', name: '4S 5000 mAh LiPo', specs: '14.8 V · 74 Wh', mass: 0.48, color: 0x8d5cf6,
    desc: 'Huge capacity for long flights. Heavy — needs a big frame.', cells: 4, capacity: 5000, dims: [0.046, 0.042, 0.14],
  },
  {
    id: 'cam-fpv', kind: 'camera', name: 'FPV Camera', specs: '1200TVL · 20° uptilt', mass: 0.012, color: 0x111111,
    desc: 'Lets you fly in first-person view (press C in flight).',
  },
  {
    id: 'gps-m10', kind: 'gps', name: 'M10 GPS', specs: 'Position hold', mass: 0.01, color: 0xdedede,
    desc: 'Unlocks GPS-hold mode: let go of the sticks and the drone stays put.',
  },
];

export const getDef = (id: string): PartDef => {
  const d = CATALOG.find((p) => p.id === id);
  if (!d) throw new Error('Unknown part ' + id);
  return d;
};

// ---------------------------------------------------------------- layout

export const MOTOR_H = 0.022;

export interface Corner { id: 'FL' | 'FR' | 'BL' | 'BR'; label: string; x: number; z: number; spin: SpinDir }

// "Props-in" layout (Betaflight default): FR & RL spin CCW, FL & RR spin CW. Front is -Z.
export const CORNERS: Corner[] = [
  { id: 'FL', label: 'Front-left', x: -1, z: -1, spin: 'CW' },
  { id: 'FR', label: 'Front-right', x: 1, z: -1, spin: 'CCW' },
  { id: 'BL', label: 'Rear-left', x: -1, z: 1, spin: 'CCW' },
  { id: 'BR', label: 'Rear-right', x: 1, z: 1, spin: 'CW' },
];

export interface FrameLayout {
  s: number;
  plateW: number;
  plateL: number;
  motorY: number;
  propY: number;
  topY: number;
  slots: SlotDef[];
}

export function frameLayout(def: PartDef): FrameLayout {
  const L = def.armLength!;
  const s = L / 0.125;
  const plateW = 0.05 + (s - 1) * 0.05;
  const plateL = 0.11 + (s - 1) * 0.04;
  const motorY = 0.008;
  const propY = motorY + MOTOR_H;
  const topY = 0.032;
  const d = L * Math.SQRT1_2;
  const slots: SlotDef[] = [];
  for (const c of CORNERS) {
    slots.push({ id: 'motor-' + c.id, accepts: 'motor', label: c.label + ' motor', pos: new THREE.Vector3(c.x * d, motorY, c.z * d), spin: c.spin });
  }
  for (const c of CORNERS) {
    slots.push({
      id: 'prop-' + c.id, accepts: 'prop', label: c.label + ' prop', pos: new THREE.Vector3(c.x * d, propY, c.z * d),
      spin: c.spin, parent: 'motor-' + c.id,
    });
  }
  slots.push({ id: 'esc', accepts: 'esc', label: 'Stack (bottom)', pos: new THREE.Vector3(0, 0.003, 0) });
  slots.push({ id: 'fc', accepts: 'fc', label: 'Stack (top)', pos: new THREE.Vector3(0, 0.013, 0), parent: 'esc' });
  slots.push({
    id: 'battery', accepts: 'battery', label: 'Battery strap', pos: new THREE.Vector3(0, topY, 0),
    rail: [new THREE.Vector3(0, topY, -plateL * 0.28), new THREE.Vector3(0, topY, plateL * 0.18)],
  });
  slots.push({ id: 'camera', accepts: 'camera', label: 'Camera mount', pos: new THREE.Vector3(0, 0.007, -plateL / 2 + 0.006) });
  slots.push({ id: 'gps', accepts: 'gps', label: 'GPS mast', pos: new THREE.Vector3(0, 0.003, plateL / 2 - 0.006) });
  return { s, plateW, plateL, motorY, propY, topY, slots };
}

// ---------------------------------------------------------------- materials

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, rough = 0.55, metal = 0.1): THREE.MeshStandardMaterial {
  const key = `${color}-${rough}-${metal}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    matCache.set(key, m);
  }
  return m;
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 24): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
}

export function makeLabel(text: string, color: string, scale = 0.05): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(10,14,22,0.78)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 248, 88, 26);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.font = 'bold 50px system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 20;
  sp.scale.set(scale, scale * 0.375, 1);
  return sp;
}

// ---------------------------------------------------------------- meshes

function buildFrame(def: PartDef): THREE.Group {
  const g = new THREE.Group();
  const lay = frameLayout(def);
  const L = def.armLength!;
  const carbon = mat(0x24262b, 0.45, 0.25);
  const alu = mat(0x8a4dff, 0.3, 0.8);
  const { plateW, plateL, s } = lay;

  g.add(box(plateW, 0.003, plateL, carbon, 0, 0.0015, 0));
  g.add(box(plateW * 0.85, 0.002, plateL * 0.9, carbon, 0, 0.031, 0));

  const armW = 0.016 * Math.sqrt(s);
  for (const c of CORNERS) {
    const dir = new THREE.Vector3(c.x, 0, c.z).normalize();
    const start = 0.015;
    const len = L - start;
    const arm = box(len, 0.005, armW, carbon);
    arm.position.copy(dir.clone().multiplyScalar(start + len / 2)).setY(0.0055);
    arm.rotation.y = -Math.atan2(dir.z, dir.x);
    g.add(arm);
    const mount = cyl(0.015 * Math.sqrt(s), 0.015 * Math.sqrt(s), 0.005, carbon);
    mount.position.copy(dir.clone().multiplyScalar(L)).setY(0.0055);
    g.add(mount);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const so = cyl(0.0025, 0.0025, 0.027, alu, 10);
      so.position.set((sx * plateW * 0.8) / 2, 0.0165, (sz * plateL * 0.85) / 2);
      g.add(so);
    }
  }
  const clr = def.clearance ?? 0;
  if (clr > 0) {
    const legM = mat(0x33363d, 0.6, 0.2);
    for (const sx of [-1, 1]) {
      const x = sx * plateW * 0.75;
      for (const sz of [-1, 1]) {
        const leg = cyl(0.004, 0.004, clr + 0.004, legM, 10);
        leg.position.set(x, -clr / 2 + 0.001, sz * plateL * 0.35);
        leg.rotation.x = sz * 0.15;
        g.add(leg);
      }
      const skid = cyl(0.005, 0.005, plateL * 1.3, legM, 10);
      skid.rotation.x = Math.PI / 2;
      skid.position.set(x, -clr + 0.003, 0);
      g.add(skid);
      const brace = box(plateW * 0.75 - 0.002, 0.003, 0.01, legM, x / 2, 0.0, 0);
      g.add(brace);
    }
  }
  return g;
}

function buildMotor(def: PartDef): THREE.Group {
  const g = new THREE.Group();
  const r = def.radius!;
  const base = cyl(r * 0.9, r, 0.006, mat(0x2a2a2e, 0.4, 0.7));
  base.position.y = 0.003;
  const bell = cyl(r, r, 0.014, mat(def.color, 0.35, 0.6), 28);
  bell.position.y = 0.013;
  const cap = cyl(r * 0.55, r * 0.8, 0.002, mat(0x1a1a1d, 0.3, 0.8));
  cap.position.y = 0.021;
  const shaft = cyl(0.0022, 0.0022, 0.006, mat(0xcfd3da, 0.2, 1), 10);
  shaft.position.y = 0.022;
  g.add(base, bell, cap, shaft);
  // cooling slots
  for (let i = 0; i < 6; i++) {
    const slot = box(0.002, 0.008, 0.0015, mat(0x111111), 0, 0.013, 0);
    const a = (i / 6) * Math.PI * 2;
    slot.position.x = Math.cos(a) * r * 1.001;
    slot.position.z = Math.sin(a) * r * 1.001;
    slot.rotation.y = -a;
    g.add(slot);
  }
  return g;
}

function bladeGeometry(R: number, w: number): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  sh.moveTo(0.004, -w * 0.3);
  sh.quadraticCurveTo(R * 0.3, -w * 0.6, R * 0.85, -w * 0.38);
  sh.quadraticCurveTo(R * 1.02, -w * 0.2, R, 0.0);
  sh.quadraticCurveTo(R * 0.98, w * 0.32, R * 0.8, w * 0.36);
  sh.quadraticCurveTo(R * 0.3, w * 0.55, 0.004, w * 0.3);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.0012, bevelEnabled: false, curveSegments: 6 });
  geo.translate(0, 0, -0.0006);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function buildProp(def: PartDef): THREE.Group {
  const g = new THREE.Group();
  const R = (def.size! * 0.0254) / 2;
  const spinner = new THREE.Group();
  spinner.userData.spinner = true;
  const bladeMat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.4, metalness: 0.05, transparent: true, opacity: 0.95 });
  const hub = cyl(0.006, 0.0065, 0.008, mat(def.color, 0.4, 0.1));
  hub.position.y = 0.004;
  spinner.add(hub);
  const nut = cyl(0.0035, 0.0045, 0.006, mat(0xc9ced6, 0.25, 0.9), 6);
  nut.position.y = 0.011;
  spinner.add(nut);
  const geo = bladeGeometry(R, 0.012 * Math.sqrt(def.size! / 5) * (def.blades === 2 ? 1.25 : 1));
  const n = def.blades ?? 2;
  const pitch = def.dir === 'CW' ? 0.28 : -0.28;
  for (let i = 0; i < n; i++) {
    const holder = new THREE.Group();
    holder.rotation.y = (i / n) * Math.PI * 2;
    const blade = new THREE.Mesh(geo, bladeMat);
    blade.position.y = 0.004;
    blade.rotation.x = pitch;
    holder.add(blade);
    spinner.add(holder);
  }
  g.add(spinner);
  // motion-blur disc (shown when spinning fast)
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(R, 40),
    new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.004;
  disc.userData.disc = true;
  g.add(disc);
  return g;
}

function buildBattery(def: PartDef): THREE.Group {
  const g = new THREE.Group();
  const [w, h, l] = def.dims!;
  g.add(box(w, h, l, mat(0x1d1f24, 0.7, 0.05), 0, h / 2, 0));
  g.add(box(w + 0.001, h * 0.55, l * 0.7, mat(def.color, 0.5, 0.1), 0, h / 2, 0));
  g.add(box(w + 0.003, h + 0.002, 0.012, mat(0xc0392b, 0.85, 0), 0, h / 2 + 0.0005, -l * 0.15)); // strap
  g.add(box(w + 0.003, h + 0.002, 0.012, mat(0xc0392b, 0.85, 0), 0, h / 2 + 0.0005, l * 0.25));
  const red = cyl(0.002, 0.002, 0.03, mat(0xd62828, 0.5), 8);
  red.rotation.x = Math.PI / 2;
  red.position.set(0.004, h * 0.6, l / 2 + 0.014);
  const blk = red.clone();
  blk.material = mat(0x111111, 0.5);
  blk.position.x = -0.004;
  g.add(red, blk);
  g.add(box(0.016, 0.008, 0.01, mat(0xf4c430, 0.5), 0, h * 0.6, l / 2 + 0.032)); // XT60
  return g;
}

function buildFC(def: PartDef): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.036, 0.0016, 0.036, mat(def.color, 0.6, 0.1), 0, 0.0008, 0));
  g.add(box(0.01, 0.0018, 0.01, mat(0x0c0c0c, 0.4, 0.2), 0, 0.0025, 0));
  g.add(box(0.006, 0.0015, 0.004, mat(0x0c0c0c, 0.4, 0.2), 0.008, 0.0024, -0.008));
  g.add(box(0.008, 0.003, 0.006, mat(0xbfc5cc, 0.25, 0.9), -0.014, 0.003, 0)); // usb
  const led = box(0.002, 0.001, 0.002, new THREE.MeshBasicMaterial({ color: 0x3cff6b }), 0.012, 0.0022, 0.012);
  g.add(led);
  // arrow showing forward
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.008, 3), mat(0xffffff, 0.6));
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.set(0, 0.0018, -0.013);
  g.add(arrow);
  return g;
}

function buildESC(def: PartDef): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.038, 0.0018, 0.038, mat(def.color, 0.6, 0.1), 0, 0.0009, 0));
  for (const [x, z] of [[-0.012, -0.012], [0.012, -0.012], [-0.012, 0.012], [0.012, 0.012]]) {
    g.add(box(0.007, 0.0016, 0.007, mat(0x2b2b2b, 0.3, 0.4), x, 0.0026, z));
  }
  const capM = mat(0x2a3b8f, 0.4, 0.3);
  const capC = cyl(0.004, 0.004, 0.008, capM, 14);
  capC.rotation.z = Math.PI / 2;
  capC.position.set(0, 0.0055, 0.016);
  g.add(capC);
  for (const c of CORNERS) {
    g.add(box(0.004, 0.0012, 0.004, mat(0xd4a017, 0.3, 0.9), c.x * 0.017, 0.0024, c.z * 0.006));
  }
  return g;
}

function buildCamera(def: PartDef): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.0095;
  body.rotation.x = 0.35; // uptilt
  body.add(box(0.019, 0.019, 0.017, mat(def.color, 0.5, 0.2)));
  const lens = cyl(0.0075, 0.0075, 0.01, mat(0x1b1b1b, 0.3, 0.6));
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.012;
  body.add(lens);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 20), mat(0x3a6bd8, 0.05, 0.9));
  glass.position.z = -0.0171;
  glass.rotation.y = Math.PI;
  body.add(glass);
  g.add(body);
  for (const sx of [-1, 1]) g.add(box(0.0015, 0.016, 0.014, mat(0x8a4dff, 0.3, 0.8), sx * 0.0105, 0.009, 0));
  return g;
}

function buildGPS(def: PartDef): THREE.Group {
  const g = new THREE.Group();
  const mastH = 0.09;
  const mast = cyl(0.002, 0.0025, mastH, mat(0x2b2e35, 0.5, 0.3), 10);
  mast.position.y = mastH / 2;
  g.add(mast);
  const puck = cyl(0.016, 0.017, 0.008, mat(def.color, 0.5, 0.1), 28);
  puck.position.y = mastH + 0.004;
  g.add(puck);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.01, 3), mat(0x222222, 0.6));
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.set(0, mastH + 0.0085, -0.004);
  g.add(arrow);
  return g;
}

export function createPartMesh(def: PartDef): THREE.Group {
  let g: THREE.Group;
  switch (def.kind) {
    case 'frame': g = buildFrame(def); break;
    case 'motor': g = buildMotor(def); break;
    case 'prop': g = buildProp(def); break;
    case 'battery': g = buildBattery(def); break;
    case 'fc': g = buildFC(def); break;
    case 'esc': g = buildESC(def); break;
    case 'camera': g = buildCamera(def); break;
    case 'gps': g = buildGPS(def); break;
  }
  g.userData.defId = def.id;
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData.disc) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

export function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      // only dispose non-cached materials
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mm of mats) if (![...matCache.values()].includes(mm as THREE.MeshStandardMaterial)) mm.dispose();
    }
  });
}

// ---------------------------------------------------------------- performance model

/** Max thrust (N) of one motor + prop on a battery. */
export function motorThrust(motor: PartDef, prop: PartDef, battery: PartDef | null): number {
  const r = prop.size! / motor.idealProp!;
  const propFactor = r < 1 ? Math.pow(r, 2.2) : Math.min(1.35, Math.pow(r, 0.45));
  const cells = battery?.cells ?? 4;
  return motor.baseThrust! * propFactor * Math.pow(cells / 4, 1.6);
}

/** Electrical power coefficient: P(W) = coef * T(N)^1.5 */
export function powerCoef(motor: PartDef, prop: PartDef): number {
  const r = prop.size! / motor.idealProp!;
  return 9.4 * (10 / prop.size!) * (r > 1.2 ? 1.6 : 1);
}

export const ICONS: Record<PartKind, string> = {
  frame: '<path d="M5 5l14 14M19 5L5 19"/><circle cx="5" cy="5" r="2.2"/><circle cx="19" cy="5" r="2.2"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="19" r="2.2"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  motor: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 5v3M12 16v3M5 12h3M16 12h3"/>',
  prop: '<circle cx="12" cy="12" r="1.8"/><path d="M12 10c-1-5 1-8 3-8s1 5-1.5 8M12 14c1 5-1 8-3 8s-1-5 1.5-8"/>',
  esc: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M13 7l-3 5h4l-3 5"/>',
  fc: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  battery: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10v4M7 10v4M10 10v4M13 10v4"/>',
  camera: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3"/>',
  gps: '<path d="M12 21v-7"/><ellipse cx="12" cy="9" rx="7" ry="3"/><path d="M12 6V3"/>',
};
