import * as THREE from 'three';
import { CAR_H, CAR_LEN, CAR_LIFT, CAR_W, SPHERE_R } from '../shared/constants';
import type { V3 } from '../shared/spherical';

const GLASS_HEX = 0x2b3040;
const TYRE_HEX = 0x2f3446;

/**
 * A chunky toy car. Local axes: +X right, +Y up, +Z forward.
 *
 * Every car owns its own materials — the pop animation mutates opacity, and a
 * shared material would smear that across every other car of the same colour.
 */
export class CarView {
  readonly group = new THREE.Group();
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];

  constructor(hex: number, carId: string) {
    this.group.userData.carId = carId;

    const bodyMat = this.mat(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.45, metalness: 0.05 }));
    const glassMat = this.mat(new THREE.MeshStandardMaterial({ color: GLASS_HEX, roughness: 0.25, metalness: 0.1 }));
    const tyreMat = this.mat(new THREE.MeshStandardMaterial({ color: TYRE_HEX, roughness: 0.85 }));
    const lampMat = this.mat(
      new THREE.MeshStandardMaterial({ color: 0xfff4cf, emissive: 0xffe9a8, emissiveIntensity: 0.9, roughness: 0.3 })
    );
    const tailMat = this.mat(
      new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0xff2b2b, emissiveIntensity: 0.6, roughness: 0.3 })
    );

    // Body
    this.add(new THREE.BoxGeometry(CAR_W, CAR_H, CAR_LEN), bodyMat, [0, 0, 0]);
    // Window band, then roof on top of it
    this.add(new THREE.BoxGeometry(CAR_W * 0.86, 0.16, CAR_LEN * 0.46), glassMat, [0, CAR_H / 2 + 0.08, -0.05]);
    this.add(new THREE.BoxGeometry(CAR_W * 0.82, 0.12, CAR_LEN * 0.44), bodyMat, [0, CAR_H / 2 + 0.22, -0.05]);

    // Wheels — one geometry reused, disposed once
    const wheelGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.13, 14);
    this.geos.push(wheelGeo);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const w = new THREE.Mesh(wheelGeo, tyreMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(sx * (CAR_W / 2 + 0.01), -CAR_H / 2 + 0.03, sz * CAR_LEN * 0.3);
        this.group.add(w);
      }
    }

    // Lamps
    const lampGeo = new THREE.SphereGeometry(0.06, 10, 8);
    this.geos.push(lampGeo);
    for (const sx of [-1, 1]) {
      const head = new THREE.Mesh(lampGeo, lampMat);
      head.position.set(sx * CAR_W * 0.28, 0.02, CAR_LEN / 2 - 0.02);
      this.group.add(head);

      const tail = new THREE.Mesh(lampGeo, tailMat);
      tail.scale.set(0.8, 0.8, 0.8);
      tail.position.set(sx * CAR_W * 0.28, 0.04, -CAR_LEN / 2 + 0.02);
      this.group.add(tail);
    }
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.mats.push(m);
    return m;
  }

  private add(geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number]) {
    this.geos.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    this.group.add(mesh);
  }

  /** Place the car on the surface at `up`, facing along `forward`. */
  setOnSurface(up: V3, forward: V3) {
    const n = new THREE.Vector3(up[0], up[1], up[2]).normalize();
    const f = new THREE.Vector3(forward[0], forward[1], forward[2]);
    f.addScaledVector(n, -f.dot(n));
    if (f.lengthSq() < 1e-10) f.set(0, 1, 0).addScaledVector(n, -n.y);
    f.normalize();

    // right = up × forward keeps (right, up, forward) right-handed
    const r = new THREE.Vector3().crossVectors(n, f).normalize();
    this.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, n, f));
    this.group.position.copy(n).multiplyScalar(SPHERE_R + CAR_LIFT);
  }

  setScale(s: number) {
    this.group.scale.setScalar(s);
  }

  setOpacity(o: number) {
    // Flipping `transparent` changes the shader program key, so it needs an
    // explicit recompile — without this the fade-out simply doesn't render.
    const wantsTransparent = o < 1;
    for (const m of this.mats) {
      if (m.transparent !== wantsTransparent) {
        m.transparent = wantsTransparent;
        m.needsUpdate = true;
      }
      m.opacity = o;
    }
  }

  dispose() {
    this.group.parent?.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.geos.length = 0;
    this.mats.length = 0;
  }
}

/** Walk up from a raycast hit to the car group that owns it. */
export function carIdFromHit(obj: THREE.Object3D | null): string | null {
  let o: THREE.Object3D | null = obj;
  while (o) {
    const id = o.userData?.carId;
    if (typeof id === 'string') return id;
    o = o.parent;
  }
  return null;
}
