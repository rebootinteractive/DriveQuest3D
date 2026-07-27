import * as THREE from 'three';
import { ROUTE_LIFT, SPHERE_R } from '../shared/constants';
import type { SpherePath } from '../shared/spherical';

/** The coloured ribbon showing where a car is headed. */
export class RouteView {
  readonly object: THREE.Object3D;
  private readonly geo: THREE.BufferGeometry | null;
  private readonly mat: THREE.MeshBasicMaterial;

  constructor(path: SpherePath, hex: number, radius = 0.035) {
    this.mat = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    const pts = path.pts.map((p) =>
      new THREE.Vector3(p[0], p[1], p[2]).multiplyScalar(SPHERE_R + ROUTE_LIFT)
    );

    if (pts.length < 2) {
      this.geo = null;
      this.object = new THREE.Object3D();
      return;
    }

    const curve = new THREE.CatmullRomCurve3(pts);
    this.geo = new THREE.TubeGeometry(curve, Math.max(16, pts.length), radius, 6, false);
    this.object = new THREE.Mesh(this.geo, this.mat);
  }

  setOpacity(o: number) {
    this.mat.opacity = o;
  }

  dispose() {
    this.object.parent?.remove(this.object);
    this.geo?.dispose();
    this.mat.dispose();
  }
}
