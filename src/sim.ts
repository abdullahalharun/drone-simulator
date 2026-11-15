import * as THREE from 'three';

export type FlightMode = 'angle' | 'althold' | 'gps';

export interface MotorCfg {
  slot: string;
  label: string;
  pos: THREE.Vector3; // thrust point, frame-local
  spin: 1 | -1; // +1 = prop spins CW seen from above
  maxThrust: number; // N
  propOk: boolean; // prop direction matches motor rotation
  propSize: number;
  powerCoef: number;
  yawCoef: number; // reaction torque per newton of thrust (m)
}

export interface DroneConfig {
  mass: number;
  cog: THREE.Vector3; // frame-local
  inertia: THREE.Vector3; // diagonal, about CoG
  motors: MotorCfg[];
  clearance: number;
  capacityWh: number;
  cells: number;
  hasCamera: boolean;
  cameraPos: THREE.Vector3 | null;
  hasGPS: boolean;
  radius: number; // collision radius
  sizeScale: number;
  feet: THREE.Vector3[]; // contact points, frame-local
}

export interface ControlInput {
  thr: number; // -1..1 climb-rate stick (alt-hold / gps modes)
  thr01: number; // 0..1 absolute throttle (angle mode)
  yaw: number; // -1..1, + = yaw right
  pitch: number; // -1..1, + = forward
  roll: number; // -1..1, + = right
}

const G = 9.81;
const DT = 1 / 400;
const MAX_TILT = THREE.MathUtils.degToRad(35);
const KP = 260, KI = 140, KD = 30, KY = 9;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _f = new THREE.Vector3();
const _tau = new THREE.Vector3();
const _e = new THREE.Euler();
const _qd = new THREE.Quaternion();
const _qe = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);

export class DroneSim {
  pos = new THREE.Vector3(); // CoG, world
  vel = new THREE.Vector3();
  q = new THREE.Quaternion();
  omega = new THREE.Vector3(); // body rates
  thrust: number[];
  integ = new THREE.Vector3();
  battery = 1;
  armed = false;
  crashed = false;
  crashReason = '';
  onGround = true;
  mode: FlightMode = 'althold';
  power = 0;
  private acc = 0;
  private tipTime = 0;

  constructor(public cfg: DroneConfig) {
    this.thrust = cfg.motors.map(() => 0);
  }

  reset(spawn: THREE.Vector3, yaw = 0) {
    this.q.setFromAxisAngle(Y, yaw);
    this.pos.copy(spawn).add(new THREE.Vector3(0, this.cfg.clearance + 0.002, 0)).add(this.cfg.cog.clone().applyQuaternion(this.q));
    this.vel.set(0, 0, 0);
    this.omega.set(0, 0, 0);
    this.integ.set(0, 0, 0);
    this.thrust.fill(0);
    this.battery = 1;
    this.armed = false;
    this.crashed = false;
    this.crashReason = '';
    this.onGround = true;
    this.tipTime = 0;
  }

  /** World position of the frame origin (for rendering). */
  frameOrigin(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.cfg.cog).applyQuaternion(this.q).negate().add(this.pos);
  }

  get batteryFactor(): number {
    return 0.82 + 0.18 * this.battery;
  }

  get totalMax(): number {
    return this.cfg.motors.reduce((s, m) => s + m.maxThrust, 0) * this.batteryFactor;
  }

  get throttleFrac(): number {
    return this.thrust.reduce((a, b) => a + b, 0) / Math.max(1e-6, this.totalMax);
  }

  get heading(): number {
    return _e.setFromQuaternion(this.q, 'YXZ').y;
  }

  get altitude(): number {
    return this.frameOrigin(_v2).y - this.cfg.clearance;
  }

  get voltage(): number {
    const sag = this.throttleFrac * 0.35;
    return this.cfg.cells * (3.45 + 0.75 * this.battery - sag);
  }

  update(dt: number, input: ControlInput, colliders: THREE.Box3[]) {
    this.acc += Math.min(dt, 0.05);
    while (this.acc >= DT) {
      this.step(input, colliders);
      this.acc -= DT;
    }
  }

  crash(reason: string) {
    if (this.crashed) return;
    this.crashed = true;
    this.armed = false;
    this.crashReason = reason;
    this.omega.add(new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8));
  }

  private step(input: ControlInput, colliders: THREE.Box3[]) {
    const { cfg, q, vel, omega } = this;
    const I = cfg.inertia;
    const m = cfg.mass;
    const bf = this.batteryFactor;
    const up = _v.set(0, 1, 0).applyQuaternion(q);
    const cosT = up.y;
    const psi = _e.setFromQuaternion(q, 'YXZ').y;
    const totalMax = this.totalMax;
    const active = this.armed && !this.crashed && this.battery > 0;

    // ---- outer loop: desired attitude + collective
    let pitchCmd = -input.pitch * MAX_TILT;
    let rollCmd = -input.roll * MAX_TILT;
    if (this.mode === 'gps' && cfg.hasGPS) {
      const fx = -Math.sin(psi), fz = -Math.cos(psi);
      const rx = Math.cos(psi), rz = -Math.sin(psi);
      const vf = vel.x * fx + vel.z * fz;
      const vr = vel.x * rx + vel.z * rz;
      const af = 2.2 * (input.pitch * 9 - vf);
      const ar = 2.2 * (input.roll * 9 - vr);
      pitchCmd = -THREE.MathUtils.clamp(Math.atan(af / G), -MAX_TILT, MAX_TILT);
      rollCmd = -THREE.MathUtils.clamp(Math.atan(ar / G), -MAX_TILT, MAX_TILT);
    }

    let T: number;
    if (this.mode === 'angle') {
      T = input.thr01 * input.thr01 * totalMax; // quadratic throttle curve
    } else {
      const vzDes = input.thr * 4;
      const az = G + 5 * (vzDes - vel.y);
      T = THREE.MathUtils.clamp((m * az) / Math.max(cosT, 0.5), 0, totalMax);
      if (this.onGround && input.thr < 0.15) T = 0.04 * totalMax;
    }
    const flying = !(this.onGround && T < m * G * 0.6);

    // ---- inner loop: attitude PID (what the flight controller does)
    let tx = 0, ty = 0, tz = 0;
    if (active && flying) {
      _qd.setFromEuler(_e.set(pitchCmd, psi, rollCmd, 'YXZ'));
      _qe.copy(q).invert().multiply(_qd);
      if (_qe.w < 0) _qe.set(-_qe.x, -_qe.y, -_qe.z, -_qe.w);
      const ex = 2 * _qe.x, ez = 2 * _qe.z;
      this.integ.x = THREE.MathUtils.clamp(this.integ.x + ex * DT, -0.6, 0.6);
      this.integ.z = THREE.MathUtils.clamp(this.integ.z + ez * DT, -0.6, 0.6);
      tx = I.x * (KP * ex + KI * this.integ.x - KD * omega.x);
      tz = I.z * (KP * ez + KI * this.integ.z - KD * omega.z);
      ty = I.y * KY * (-input.yaw * 3.5 - omega.y);
    } else {
      this.integ.set(0, 0, 0);
    }

    // ---- mixer (uses geometric motor positions — the FC doesn't know the real CoG)
    const n = cfg.motors.length;
    let sx2 = 0, sz2 = 0, kAvg = 0;
    for (const mc of cfg.motors) { sx2 += mc.pos.x ** 2; sz2 += mc.pos.z ** 2; kAvg += mc.yawCoef / n; }
    const d = cfg.motors.map((mc) => (tx * -mc.pos.z) / sz2 + (tz * mc.pos.x) / sx2 + (ty * mc.spin) / (n * kAvg));
    const maxPer = Math.min(...cfg.motors.map((mc) => mc.maxThrust * bf));
    const dmin = Math.min(...d), dmax = Math.max(...d);
    let lo = -dmin, hi = maxPer - dmax;
    if (lo > hi) lo = hi = (lo + hi) / 2;
    const coll = THREE.MathUtils.clamp(T / n, lo, hi);

    // ---- motors (first-order spool-up lag)
    _f.set(0, 0, 0);
    _tau.set(0, 0, 0);
    let fy = 0;
    this.power = 3;
    for (let i = 0; i < n; i++) {
      const mc = cfg.motors[i];
      const cmd = active ? THREE.MathUtils.clamp(coll + d[i], 0, mc.maxThrust * bf) : 0;
      this.thrust[i] += (cmd - this.thrust[i]) * Math.min(1, DT / 0.02);
      const t = this.thrust[i];
      const f = t * (mc.propOk ? 1 : -0.4); // a reversed prop pushes air the wrong way
      fy += f;
      const rx = mc.pos.x - cfg.cog.x, rz = mc.pos.z - cfg.cog.z;
      _tau.x += -rz * f;
      _tau.z += rx * f;
      _tau.y += mc.spin * mc.yawCoef * t;
      this.power += mc.powerCoef * Math.pow(t, 1.5);
    }

    // ---- linear dynamics
    _f.set(0, fy, 0).applyQuaternion(q);
    const speed = vel.length();
    _f.addScaledVector(vel, -(0.04 * m + 0.012 * cfg.sizeScale * cfg.sizeScale * speed));
    _f.y -= m * G;
    vel.addScaledVector(_f, DT / m);
    this.pos.addScaledVector(vel, DT);

    // ---- angular dynamics (Euler's equations, diagonal inertia)
    const gx = omega.y * I.z * omega.z - omega.z * I.y * omega.y;
    const gy = omega.z * I.x * omega.x - omega.x * I.z * omega.z;
    const gz = omega.x * I.y * omega.y - omega.y * I.x * omega.x;
    const damp = 0.0008 * cfg.sizeScale;
    omega.x += ((_tau.x - gx - damp * omega.x) / I.x) * DT;
    omega.y += ((_tau.y - gy - damp * 4 * omega.y) / I.y) * DT;
    omega.z += ((_tau.z - gz - damp * omega.z) / I.z) * DT;
    _qt.set(omega.x, omega.y, omega.z, 0);
    _qd.copy(q).multiply(_qt);
    q.set(q.x + _qd.x * 0.5 * DT, q.y + _qd.y * 0.5 * DT, q.z + _qd.z * 0.5 * DT, q.w + _qd.w * 0.5 * DT).normalize();

    // ---- battery
    if (active) {
      this.battery = Math.max(0, this.battery - (this.power * DT) / 3600 / (cfg.capacityWh * 0.85));
    }

    // ---- ground contact
    let minY = Infinity;
    for (const ft of cfg.feet) {
      const y = _v2.copy(ft).sub(cfg.cog).applyQuaternion(q).add(this.pos).y;
      if (y < minY) minY = y;
    }
    if (minY < 0) {
      const impact = -vel.y;
      this.pos.y -= minY;
      if (!this.crashed && (impact > 4.5 || (cosT < 0.35 && speed > 0.5) || cosT < 0)) {
        this.crash(impact > 4.5 ? `Hard landing (${impact.toFixed(1)} m/s)` : 'Flipped over');
      }
      this.tipTime = cosT < 0.6 ? this.tipTime + DT : 0;
      if (!this.crashed && this.tipTime > 0.6) this.crash('Tipped over');
      if (vel.y < 0) vel.y = this.crashed ? -vel.y * 0.2 : 0;
      const fr = Math.exp(-(this.crashed ? 3 : 6) * DT);
      vel.x *= fr;
      vel.z *= fr;
      this.onGround = true;
      const sitting = !active || fy < m * G * 0.9;
      if (sitting && !this.crashed) {
        _qd.setFromAxisAngle(Y, psi);
        q.slerp(_qd, Math.min(1, 8 * DT));
        omega.multiplyScalar(Math.exp(-12 * DT));
      } else if (this.crashed) {
        omega.multiplyScalar(Math.exp(-4 * DT));
      }
    } else {
      this.onGround = false;
    }

    // ---- obstacles
    const rad = cfg.radius;
    for (const b of colliders) {
      if (b.distanceToPoint(this.pos) > rad) continue;
      const closest = b.clampPoint(this.pos, _v2);
      const dist = closest.distanceTo(this.pos);
      const nrm = dist > 1e-6 ? _v.copy(this.pos).sub(closest).divideScalar(dist) : _v.set(0, 1, 0);
      const vn = vel.dot(nrm);
      if (vn < -3.2) this.crash('Hit an obstacle');
      this.pos.copy(closest).addScaledVector(nrm, rad);
      if (vn < 0) vel.addScaledVector(nrm, -vn * 1.3);
    }
  }
}
