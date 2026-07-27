import * as THREE from 'three';
import { CAR_LEN, CAR_W, SLOT_LIFT, SPHERE_R } from '../shared/constants';
import type { V3 } from '../shared/spherical';

const SLOT_W = CAR_W * 1.55;
const SLOT_H = CAR_LEN * 1.35;

let sharedTexture: THREE.Texture | null = null;

/**
 * A parking-bay decal. Drawn white so the material colour tints it; the texture is
 * read-only and shared for the page session (safe — nothing mutates it).
 */
function bayTexture(): THREE.Texture {
  if (sharedTexture) return sharedTexture;

  const w = 128;
  const h = 192;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;

  const pad = 12;
  const r = 22;
  const x0 = pad;
  const y0 = pad;
  const x1 = w - pad;
  const y1 = h - pad;

  g.beginPath();
  g.moveTo(x0 + r, y0);
  g.lineTo(x1 - r, y0);
  g.quadraticCurveTo(x1, y0, x1, y0 + r);
  g.lineTo(x1, y1 - r);
  g.quadraticCurveTo(x1, y1, x1 - r, y1);
  g.lineTo(x0 + r, y1);
  g.quadraticCurveTo(x0, y1, x0, y1 - r);
  g.lineTo(x0, y0 + r);
  g.quadraticCurveTo(x0, y0, x0 + r, y0);
  g.closePath();

  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.fill();

  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 9;
  g.setLineDash([22, 14]);
  g.stroke();

  // A chevron near the top edge so the bay reads as "nose in this way".
  g.setLineDash([]);
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(w * 0.32, h * 0.26);
  g.lineTo(w * 0.5, h * 0.15);
  g.lineTo(w * 0.68, h * 0.26);
  g.stroke();

  sharedTexture = new THREE.CanvasTexture(c);
  sharedTexture.colorSpace = THREE.SRGBColorSpace;
  return sharedTexture;
}

/**
 * The destination rectangle. Built as a curved patch that actually follows the
 * sphere, so it never clips through the surface or floats off it.
 */
export class SlotView {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.PlaneGeometry;
  private readonly mat: THREE.MeshBasicMaterial;
  private pulse = Math.random() * Math.PI * 2;

  constructor(up: V3, forward: V3, hex: number) {
    this.geo = new THREE.PlaneGeometry(SLOT_W, SLOT_H, 6, 10);

    const n = new THREE.Vector3(up[0], up[1], up[2]).normalize();
    const f = new THREE.Vector3(forward[0], forward[1], forward[2]);
    f.addScaledVector(n, -f.dot(n));
    if (f.lengthSq() < 1e-10) f.set(0, 1, 0).addScaledVector(n, -n.y);
    f.normalize();
    const r = new THREE.Vector3().crossVectors(n, f).normalize();

    // Project the flat patch onto the sphere so it hugs the curvature.
    const pos = this.geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.copy(n)
        .addScaledVector(r, pos.getX(i) / SPHERE_R)
        .addScaledVector(f, pos.getY(i) / SPHERE_R)
        .normalize()
        .multiplyScalar(SPHERE_R + SLOT_LIFT);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();

    this.mat = new THREE.MeshBasicMaterial({
      map: bayTexture(),
      color: hex,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geo, this.mat);
  }

  update(dt: number) {
    this.pulse += dt * 2.2;
    this.mat.opacity = 0.72 + Math.sin(this.pulse) * 0.18;
  }

  setOpacity(o: number) {
    this.mat.opacity = o;
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}
