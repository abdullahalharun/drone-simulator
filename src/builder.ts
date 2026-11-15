import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  CATALOG, CORNERS, PartDef, SlotDef, createPartMesh, disposeObject, frameLayout, getDef, makeLabel,
} from './parts';

export interface Placed {
  def: PartDef;
  slot: SlotDef;
  mesh: THREE.Group;
  railT: number;
}

interface DragState {
  def: PartDef;
  mesh: THREE.Group;
  snap: SlotDef | null;
  railT: number;
  overCanvas: boolean;
}

const FRAME_SLOT: SlotDef = { id: 'frame', accepts: 'frame', label: 'Workbench', pos: new THREE.Vector3(0, 0, 0) };
const SNAP_PX = 70;

export class Builder {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  /** All installed parts live here, positioned in frame-local space. */
  readonly droneRoot = new THREE.Group();
  readonly placed = new Map<string, Placed>();
  slots: SlotDef[] = [FRAME_SLOT];
  selected: Placed | null = null;

  /** light = true when only numbers changed (e.g. battery slider) */
  onChange: (light?: boolean) => void = () => {};
  onToast: (msg: string) => void = () => {};

  private helpers = new THREE.Group();
  private markers = new Map<string, THREE.Mesh>();
  private spinLabels = new THREE.Group();
  private selBox: THREE.BoxHelper | null = null;
  private drag: DragState | null = null;
  private pending: { p: Placed | null; x: number; y: number } | null = null;
  private raycaster = new THREE.Raycaster();
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1);
  private time = 0;

  constructor(private container: HTMLElement, private canvas: HTMLCanvasElement) {
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
    this.camera.position.set(0.38, 0.32, 0.48);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.04, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.15;
    this.controls.maxDistance = 2.2;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.buildEnvironment();
    this.scene.add(this.droneRoot, this.helpers);
    this.helpers.add(this.spinLabels);
    this.rebuildSlots();

    container.addEventListener('pointerdown', (e) => this.onPointerDown(e), true);
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
  }

  // ------------------------------------------------------------ scene

  private buildEnvironment() {
    const s = this.scene;
    s.background = new THREE.Color(0x161c27);
    s.fog = new THREE.Fog(0x161c27, 2.5, 6);

    s.add(new THREE.HemisphereLight(0xbcd4ff, 0x2a2018, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(0.6, 1.4, 0.8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -0.5;
    sc.right = sc.top = 0.5;
    sc.near = 0.1;
    sc.far = 4;
    key.shadow.bias = -0.0004;
    s.add(key);
    const rim = new THREE.DirectionalLight(0x7aa7ff, 0.8);
    rim.position.set(-1, 0.6, -0.8);
    s.add(rim);

    // cutting mat
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#1f4d3c';
    ctx.fillRect(0, 0, 1024, 1024);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 1024; i += 1024 / 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 1024); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(1024, i); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 1024; i += 1024 / 8) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 1024); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(1024, i); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,220,120,0.35)';
    ctx.beginPath(); ctx.arc(512, 512, 180, 0, Math.PI * 2); ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.01, 1.0), [
      new THREE.MeshStandardMaterial({ color: 0x173a2d }), new THREE.MeshStandardMaterial({ color: 0x173a2d }),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x173a2d }),
      new THREE.MeshStandardMaterial({ color: 0x173a2d }), new THREE.MeshStandardMaterial({ color: 0x173a2d }),
    ]);
    mat.position.y = -0.005; // mat top surface is y = 0
    mat.receiveShadow = true;
    s.add(mat);
    const table = new THREE.Mesh(new THREE.BoxGeometry(3, 0.06, 2), new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.8 }));
    table.position.y = -0.04;
    table.receiveShadow = true;
    s.add(table);
  }

  /** world Y of the bench surface */
  benchY = 0;

  // ------------------------------------------------------------ slots

  get frame(): Placed | undefined {
    return this.placed.get('frame');
  }

  private rebuildSlots() {
    const f = this.frame;
    this.slots = f ? [FRAME_SLOT, ...frameLayout(f.def).slots] : [FRAME_SLOT];
    this.droneRoot.position.y = this.benchY + (f?.def.clearance ?? 0);
    // frame the camera to the drone size
    const s = f ? f.def.armLength! / 0.125 : 1;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, 0.67 * Math.pow(s, 0.9));

    for (const m of this.markers.values()) {
      this.helpers.remove(m);
      m.geometry.dispose();
    }
    this.markers.clear();
    while (this.spinLabels.children.length) {
      const c = this.spinLabels.children[0] as THREE.Sprite;
      this.spinLabels.remove(c);
      c.material.map?.dispose();
      c.material.dispose();
    }

    for (const slot of this.slots) {
      let geo: THREE.BufferGeometry;
      if (slot.rail) {
        const len = slot.rail[0].distanceTo(slot.rail[1]);
        geo = new THREE.BoxGeometry(0.03, 0.002, len + 0.03);
      } else {
        const r = { frame: 0.13, motor: 0.02, prop: 0.035, esc: 0.025, fc: 0.025, battery: 0.03, camera: 0.016, gps: 0.016 }[slot.accepts];
        geo = new THREE.TorusGeometry(r, r * 0.08 + 0.001, 8, 40);
        geo.rotateX(Math.PI / 2);
      }
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x46e0ff, transparent: true, opacity: 0.6, depthTest: false }));
      m.renderOrder = 10;
      m.visible = false;
      const p = slot.rail ? slot.rail[0].clone().lerp(slot.rail[1], 0.5) : slot.pos.clone();
      m.position.copy(this.droneRoot.localToWorld(p.clone()));
      this.helpers.add(m);
      this.markers.set(slot.id, m);
    }

    if (f) {
      const lay = frameLayout(f.def);
      const d = f.def.armLength! * Math.SQRT1_2;
      for (const c of CORNERS) {
        const label = makeLabel(c.spin === 'CW' ? '↻ CW' : '↺ CCW', c.spin === 'CW' ? '#ff9a44' : '#4fdcff', 0.05 * Math.sqrt(lay.s));
        label.position.copy(this.droneRoot.localToWorld(new THREE.Vector3(c.x * d, lay.propY + 0.05, c.z * d)));
        this.spinLabels.add(label);
      }
    }
  }

  slotLocalPos(slot: SlotDef, t: number): THREE.Vector3 {
    return slot.rail ? slot.rail[0].clone().lerp(slot.rail[1], t) : slot.pos.clone();
  }

  private slotWorldPos(slot: SlotDef, t: number): THREE.Vector3 {
    this.droneRoot.updateMatrixWorld();
    return this.droneRoot.localToWorld(this.slotLocalPos(slot, t));
  }

  isAvailable(slot: SlotDef, def: PartDef): boolean {
    return slot.accepts === def.kind && !this.placed.has(slot.id) && (!slot.parent || this.placed.has(slot.parent));
  }

  // ------------------------------------------------------------ placing

  place(def: PartDef, slot: SlotDef, t = 0.5): Placed {
    const mesh = createPartMesh(def);
    mesh.position.copy(this.slotLocalPos(slot, t));
    mesh.userData.slotId = slot.id;
    this.droneRoot.add(mesh);
    const p: Placed = { def, slot, mesh, railT: t };
    this.placed.set(slot.id, p);
    if (def.kind === 'frame') this.rebuildSlots();
    return p;
  }

  remove(slotId: string, notify = true) {
    const p = this.placed.get(slotId);
    if (!p) return;
    if (slotId === 'frame') {
      for (const id of [...this.placed.keys()]) if (id !== 'frame') this.remove(id, false);
    }
    for (const s of this.slots) if (s.parent === slotId) this.remove(s.id, false);
    this.droneRoot.remove(p.mesh);
    disposeObject(p.mesh);
    this.placed.delete(slotId);
    if (this.selected === p) this.select(null);
    if (slotId === 'frame') this.rebuildSlots();
    if (notify) this.onChange();
  }

  clear() {
    this.remove('frame');
    this.onChange();
  }

  /** Click-to-install: put the part into the best free slot. */
  autoPlace(def: PartDef): boolean {
    if (def.kind === 'frame' && this.frame) {
      this.onToast('A frame is already installed — remove it first (select it → Remove).');
      return false;
    }
    let candidates = this.slots.filter((s) => this.isAvailable(s, def));
    if (def.kind === 'prop') {
      const matching = candidates.filter((s) => s.spin === def.dir);
      if (matching.length) candidates = matching;
    }
    const slot = candidates[0];
    if (!slot) {
      const why = !this.frame
        ? 'Install a frame first.'
        : def.kind === 'prop' && !CORNERS.some((c) => this.placed.has('motor-' + c.id))
          ? 'Mount motors before propellers.'
          : def.kind === 'fc' && !this.placed.has('esc')
            ? 'Install the ESC first — the flight controller stacks on top of it.'
            : `No free slot for this ${def.kind}.`;
      this.onToast(why);
      return false;
    }
    const t = slot.rail ? -slot.rail[0].z / (slot.rail[1].z - slot.rail[0].z) : 0.5;
    this.select(this.place(def, slot, t));
    this.onChange();
    return true;
  }

  setRailT(slotId: string, t: number) {
    const p = this.placed.get(slotId);
    if (!p || !p.slot.rail) return;
    p.railT = t;
    p.mesh.position.copy(this.slotLocalPos(p.slot, t));
    this.selBox?.update();
    this.onChange(true);
  }

  flipProp(slotId: string) {
    const p = this.placed.get(slotId);
    if (!p || p.def.kind !== 'prop') return;
    const other = CATALOG.find((d) => d.kind === 'prop' && d.size === p.def.size && d.dir !== p.def.dir)!;
    const slot = p.slot;
    this.remove(slotId, false);
    this.select(this.place(other, slot));
    this.onChange();
  }

  autoBuild(preset: 'racer' | 'explorer') {
    this.remove('frame', false);
    const racer = preset === 'racer';
    this.place(getDef(racer ? 'frame-250' : 'frame-450'), FRAME_SLOT);
    const find = (id: string) => this.slots.find((s) => s.id === id)!;
    for (const c of CORNERS) {
      this.place(getDef(racer ? 'motor-2306' : 'motor-2212'), find('motor-' + c.id));
      const size = racer ? 5 : 10;
      this.place(getDef(`prop-${size}-${c.spin.toLowerCase()}`), find('prop-' + c.id));
    }
    this.place(getDef('esc-4in1'), find('esc'));
    this.place(getDef('fc-f4'), find('fc'));
    const bs = find('battery');
    const t = -bs.rail![0].z / (bs.rail![1].z - bs.rail![0].z);
    this.place(getDef(racer ? 'bat-4s-1500' : 'bat-4s-5000'), bs, t);
    if (racer) this.place(getDef('cam-fpv'), find('camera'));
    else {
      this.place(getDef('gps-m10'), find('gps'));
      this.place(getDef('cam-fpv'), find('camera'));
    }
    this.select(null);
    this.onChange();
  }

  select(p: Placed | null) {
    this.selected = p;
    if (this.selBox) {
      this.helpers.remove(this.selBox);
      this.selBox.geometry.dispose();
      this.selBox = null;
    }
    if (p) {
      this.selBox = new THREE.BoxHelper(p.mesh, 0xffd84a);
      (this.selBox.material as THREE.LineBasicMaterial).depthTest = false;
      this.selBox.renderOrder = 15;
      this.helpers.add(this.selBox);
    }
  }

  // ------------------------------------------------------------ drag & drop

  get dragging(): boolean {
    return !!this.drag;
  }

  /** Begin dragging a fresh part (from the parts bin, or one lifted off the drone). */
  startDrag(def: PartDef, e: PointerEvent) {
    const mesh = createPartMesh(def);
    this.scene.add(mesh);
    this.drag = { def, mesh, snap: null, railT: 0.5, overCanvas: false };
    this.controls.enabled = false;
    document.body.classList.add('dragging');
    this.updateDrag(e);
  }

  private ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private isOverCanvas(e: PointerEvent): boolean {
    const r = this.canvas.getBoundingClientRect();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    return inside && (el === this.canvas || !!el?.closest('#viewport'));
  }

  private toScreen(v: THREE.Vector3): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    const p = v.clone().project(this.camera);
    return new THREE.Vector2(((p.x + 1) / 2) * r.width + r.left, ((1 - p.y) / 2) * r.height + r.top);
  }

  private updateDrag(e: PointerEvent) {
    const d = this.drag!;
    d.overCanvas = this.isOverCanvas(e);
    d.mesh.visible = d.overCanvas;
    d.snap = null;
    if (d.overCanvas) {
      const m = new THREE.Vector2(e.clientX, e.clientY);
      let best = SNAP_PX;
      for (const slot of this.slots) {
        if (!this.isAvailable(slot, d.def)) continue;
        if (slot.rail) {
          const a = this.toScreen(this.slotWorldPos(slot, 0));
          const b = this.toScreen(this.slotWorldPos(slot, 1));
          const ab = b.clone().sub(a);
          const t = THREE.MathUtils.clamp(m.clone().sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
          const dist = a.clone().addScaledVector(ab, t).distanceTo(m);
          if (dist < best) { best = dist; d.snap = slot; d.railT = t; }
        } else {
          const dist = this.toScreen(this.slotWorldPos(slot, 0.5)).distanceTo(m);
          if (dist < best) { best = dist; d.snap = slot; }
        }
      }
      if (d.snap) {
        d.mesh.position.copy(this.slotWorldPos(d.snap, d.railT));
      } else {
        this.raycaster.setFromCamera(this.ndc(e), this.camera);
        const hit = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.dragPlane, hit)) d.mesh.position.copy(hit);
      }
    }
    this.updateMarkers();
  }

  private updateMarkers() {
    for (const slot of this.slots) {
      const m = this.markers.get(slot.id)!;
      const d = this.drag;
      m.visible = !!d && this.isAvailable(slot, d.def);
      const mat = m.material as THREE.MeshBasicMaterial;
      const snapped = d?.snap === slot;
      mat.color.set(snapped ? 0x5dff8f : 0x46e0ff);
      m.scale.setScalar(snapped ? 1.25 : 1);
    }
  }

  private pick(e: PointerEvent): Placed | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hits = this.raycaster.intersectObjects(this.droneRoot.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.slotId === undefined) o = o.parent;
      if (!o) continue;
      const p = this.placed.get(o.userData.slotId);
      // prefer smaller parts over the frame if both are hit
      if (p && p.def.kind === 'frame') {
        const other = hits.find((hh) => {
          let q: THREE.Object3D | null = hh.object;
          while (q && q.userData.slotId === undefined) q = q.parent;
          return q && q.userData.slotId !== 'frame';
        });
        if (other) continue;
      }
      if (p) return p;
    }
    return null;
  }

  private onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || e.target !== this.canvas || this.drag) return;
    const p = this.pick(e);
    this.pending = { p, x: e.clientX, y: e.clientY };
    if (p) this.controls.enabled = false;
  }

  private onPointerMove(e: PointerEvent) {
    if (this.drag) {
      this.updateDrag(e);
      return;
    }
    const pd = this.pending;
    if (pd?.p && Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 5) {
      this.pending = null;
      const p = pd.p;
      if (p.def.kind === 'frame' && this.placed.size > 1) {
        this.onToast('Take the other parts off before moving the frame.');
        return;
      }
      if (p.def.kind === 'motor' && this.placed.has(p.slot.id.replace('motor', 'prop'))) {
        this.onToast('Propeller removed from that motor — reinstall it after moving.');
      }
      const def = p.def;
      this.remove(p.slot.id);
      this.startDrag(def, e);
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (this.drag) {
      const d = this.drag;
      this.updateDrag(e);
      this.scene.remove(d.mesh);
      disposeObject(d.mesh);
      this.drag = null;
      document.body.classList.remove('dragging');
      if (d.snap && d.overCanvas) {
        this.select(this.place(d.def, d.snap, d.railT));
      } else if (d.overCanvas) {
        this.onToast(this.dropHint(d.def));
      }
      this.updateMarkers();
      this.controls.enabled = true;
      this.onChange();
      return;
    }
    const pd = this.pending;
    this.pending = null;
    this.controls.enabled = true;
    if (pd && Math.hypot(e.clientX - pd.x, e.clientY - pd.y) <= 5) {
      this.select(pd.p);
      this.onChange();
    }
  }

  private dropHint(def: PartDef): string {
    if (def.kind !== 'frame' && !this.frame) return 'Install a frame first — drop it on the workbench.';
    if (def.kind === 'prop' && !CORNERS.some((c) => this.placed.has('motor-' + c.id) && !this.placed.has('prop-' + c.id)))
      return 'Propellers go on top of a motor. Mount a motor first.';
    if (def.kind === 'fc' && !this.placed.has('esc')) return 'The flight controller stacks on the ESC. Install the ESC first.';
    if (this.slots.every((s) => !this.isAvailable(s, def))) return `No free slot for this ${def.kind}.`;
    return 'Drop it onto a glowing slot to install it.';
  }

  update(dt: number) {
    this.time += dt;
    this.controls.update();
    this.selBox?.update();
    const pulse = 0.45 + 0.3 * Math.sin(this.time * 6);
    for (const m of this.markers.values()) {
      if (m.visible) (m.material as THREE.MeshBasicMaterial).opacity = pulse + (m.scale.x > 1 ? 0.3 : 0);
    }
  }
}
