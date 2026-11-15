import * as THREE from 'three';
import { makeLabel } from './parts';

export interface Gate {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  radius: number;
  ring: THREE.Mesh;
  label: THREE.Sprite;
}

export interface World {
  scene: THREE.Scene;
  colliders: THREE.Box3[];
  gates: Gate[];
  sun: THREE.DirectionalLight;
  spawn: THREE.Vector3;
  pilot: THREE.Vector3;
  setNextGate(i: number): void;
}

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function groundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#5d8a3e';
  ctx.fillRect(0, 0, 512, 512);
  const r = rng(7);
  for (let i = 0; i < 9000; i++) {
    const g = 110 + r() * 60;
    ctx.fillStyle = `rgba(${g * 0.55},${g},${g * 0.35},${0.25 + r() * 0.3})`;
    ctx.fillRect(r() * 512, r() * 512, 2 + r() * 3, 2 + r() * 3);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function padTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3a3f47';
  ctx.beginPath(); ctx.arc(256, 256, 254, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f4d03f';
  ctx.lineWidth = 18;
  ctx.beginPath(); ctx.arc(256, 256, 215, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 260px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('H', 256, 270);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createWorld(): World {
  const scene = new THREE.Scene();
  const colliders: THREE.Box3[] = [];
  const skyColor = new THREE.Color(0xa9d2f5);
  scene.fog = new THREE.Fog(skyColor, 70, 320);

  // sky dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color(0x3d7fd6) }, bottom: { value: skyColor } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h,0.7)), 1.0); }',
    }),
  );
  scene.add(sky);
  sky.onBeforeRender = (_r, _s, cam) => sky.position.copy(cam.position);

  scene.add(new THREE.HemisphereLight(0xdcecff, 0x4a5a32, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -25;
  sc.right = sc.top = 25;
  sc.near = 1;
  sc.far = 120;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const spawn = new THREE.Vector3(0, 0, 0);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48), new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.9 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.004;
  pad.receiveShadow = true;
  scene.add(pad);

  // pilot tent + flag near the pad
  const pilot = new THREE.Vector3(0, 1.7, 5);
  const tent = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.4, 4), new THREE.MeshStandardMaterial({ color: 0xe76f51, roughness: 0.8 }));
  tent.position.set(-4, 0.7, 7);
  tent.rotation.y = Math.PI / 4;
  tent.castShadow = true;
  scene.add(tent);
  colliders.push(new THREE.Box3().setFromObject(tent));

  const r = rng(42);
  const solid = (mesh: THREE.Mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
  };

  // buildings / hangars on the edges
  const bColors = [0xd9d4c7, 0xb8c4cf, 0xc9b49a, 0x9fb1a5];
  const buildings: [number, number, number, number, number][] = [
    [-30, 14, 12, 8, 10], [34, 18, 10, 14, 8], [-42, -46, 14, 18, 12], [40, -62, 9, 22, 9], [6, 34, 18, 6, 10],
  ];
  for (const [x, z, w, h, dpt] of buildings) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dpt), new THREE.MeshStandardMaterial({ color: bColors[Math.floor(r() * 4)], roughness: 0.85 }));
    b.position.set(x, h / 2, z);
    solid(b);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.4, dpt + 0.4), new THREE.MeshStandardMaterial({ color: 0x5b5f66 }));
    roof.position.set(x, h + 0.2, z);
    roof.castShadow = true;
    scene.add(roof);
  }

  // gates around an oval course
  const gates: Gate[] = [];
  const center = new THREE.Vector3(-26, 0, -20); // pad sits on the oval's tangent, gate 1 straight ahead
  const N = 8;
  const heights = [2.5, 3.5, 5, 3, 2.2, 4, 6, 3];
  const ringMat = () => new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0x331100, roughness: 0.4 });
  for (let i = 0; i < N; i++) {
    const a = -(i / N) * Math.PI * 2;
    const pos = new THREE.Vector3(center.x + Math.cos(a) * 26, heights[i], center.z + Math.sin(a) * 19);
    const tangent = new THREE.Vector3(Math.sin(a) * 26, 0, -Math.cos(a) * 19).normalize();
    const radius = 1.7;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.12, 12, 48), ringMat());
    ring.position.copy(pos);
    ring.lookAt(pos.clone().add(tangent));
    ring.castShadow = true;
    scene.add(ring);
    const poleH = pos.y - radius;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, poleH, 10), new THREE.MeshStandardMaterial({ color: 0x444a52 }));
    pole.position.set(pos.x, poleH / 2, pos.z);
    solid(pole);
    const label = makeLabel(String(i + 1), '#ffffff', 1.4);
    label.position.copy(pos).add(new THREE.Vector3(0, radius + 0.8, 0));
    scene.add(label);
    gates.push({ center: pos, normal: tangent, radius, ring, label });
  }

  // trees, avoiding pad, course and buildings
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 });
  const leafMats = [0x2f6b2f, 0x3c7d32, 0x285c2c].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  let placed = 0;
  while (placed < 70) {
    const x = (r() - 0.5) * 220;
    const z = (r() - 0.5) * 220 - 20;
    if (Math.hypot(x, z) < 14) continue;
    const ex = (x - center.x) / 26, ez = (z - center.z) / 19;
    const e = Math.hypot(ex, ez);
    if (e > 0.7 && e < 1.35) continue;
    if (buildings.some(([bx, bz, w, , d]) => Math.abs(x - bx) < w / 2 + 3 && Math.abs(z - bz) < d / 2 + 3)) continue;
    const h = 4 + r() * 6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, h * 0.4, 8), trunkMat);
    trunk.position.set(x, h * 0.2, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(h * 0.28, h * 0.75, 9), leafMats[placed % 3]);
    leaves.position.set(x, h * 0.4 + h * 0.36, z);
    leaves.castShadow = true;
    scene.add(leaves);
    // collider: trunk + inner canopy
    colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.3, 0, z - 0.3), new THREE.Vector3(x + 0.3, h * 0.4, z + 0.3)));
    const cw = h * 0.16;
    colliders.push(new THREE.Box3(new THREE.Vector3(x - cw, h * 0.4, z - cw), new THREE.Vector3(x + cw, h * 0.95, z + cw)));
    placed++;
  }

  const setNextGate = (idx: number) => {
    gates.forEach((g, i) => {
      const m = g.ring.material as THREE.MeshStandardMaterial;
      const next = i === idx;
      m.color.set(next ? 0x34e07a : 0xff7a1a);
      m.emissive.set(next ? 0x0f5a2a : 0x331100);
      g.label.visible = next;
    });
  };
  setNextGate(0);

  return { scene, colliders, gates, sun, spawn, pilot, setNextGate };
}
