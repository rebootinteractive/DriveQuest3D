import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ATMOSPHERE_HEX, PLANET_HEX } from '../shared/colors';
import { SPHERE_R } from '../shared/constants';
import { norm, type V3 } from '../shared/spherical';

/**
 * Everything both the game and the editor need: renderer, camera, orbit controls,
 * the planet itself, and a tap-vs-drag discriminator on top of OrbitControls.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly planet: THREE.Mesh;

  private readonly ro: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private readonly owned: Array<{ dispose(): void }> = [];
  private readonly activePointers = new Set<number>();
  private downAt: { x: number; y: number; t: number } | null = null;
  private multiTouched = false;

  private rafId = 0;
  private lastTime = 0;
  private frameCb: ((dt: number) => void) | null = null;
  private tapCb: ((ndc: THREE.Vector2) => void) | null = null;

  constructor(private parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(parent.clientWidth, parent.clientHeight, false);
    parent.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x121523);

    this.camera = new THREE.PerspectiveCamera(
      45,
      Math.max(parent.clientWidth, 1) / Math.max(parent.clientHeight, 1),
      0.5,
      200
    );

    this.addLights();
    this.addStars();
    this.planet = this.addPlanet();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 0.85;
    this.controls.target.set(0, 0, 0);
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

    this.applyCameraLimits();
    this.lookFrom([0, 0.35, 1]);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.handlePointerDown);
    el.addEventListener('pointerup', this.handlePointerUp);
    el.addEventListener('pointercancel', this.handlePointerCancel);

    this.ro = new ResizeObserver(() => this.handleResize());
    this.ro.observe(parent);
  }

  // ---------------------------------------------------------------- scene bits

  private addLights() {
    const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x5b4c39, 0.8);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff3e0, 1.25);
    key.position.set(6, 7, 5);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x9fc4ff, 0.35);
    fill.position.set(-7, -3, -5);
    this.scene.add(fill);
  }

  private addStars() {
    const count = 320;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const z = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      const d = 70 + Math.random() * 40;
      pos[i * 3] = r * Math.cos(a) * d;
      pos[i * 3 + 1] = z * d;
      pos[i * 3 + 2] = r * Math.sin(a) * d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.55,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.scene.add(new THREE.Points(geo, mat));
    this.owned.push(geo, mat);
  }

  private addPlanet(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(SPHERE_R, 96, 64);
    const mat = new THREE.MeshStandardMaterial({
      color: PLANET_HEX,
      roughness: 0.95,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);
    this.owned.push(geo, mat);

    const glowGeo = new THREE.SphereGeometry(SPHERE_R * 1.07, 48, 32);
    const glowMat = new THREE.MeshBasicMaterial({
      color: ATMOSPHERE_HEX,
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(glowGeo, glowMat));
    this.owned.push(glowGeo, glowMat);

    return mesh;
  }

  // ------------------------------------------------------------------- camera

  /** Distance at which the planet comfortably fills the narrower screen axis. */
  private fitDistance(): number {
    const fovV = THREE.MathUtils.degToRad(this.camera.fov);
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * this.camera.aspect);
    const half = Math.min(fovV, fovH) / 2;
    return SPHERE_R / Math.sin(half * 0.92);
  }

  private applyCameraLimits() {
    const fit = this.fitDistance();
    this.controls.minDistance = SPHERE_R * 1.35;
    this.controls.maxDistance = fit * 1.3;
  }

  /** Point the camera at the planet from the given direction, at the fit distance. */
  lookFrom(dir: V3) {
    const d = norm(dir);
    const dist = this.fitDistance();
    this.camera.position.set(d[0] * dist, d[1] * dist, d[2] * dist);
    this.camera.lookAt(0, 0, 0);
    this.controls.update();
  }

  /** Frame the side of the planet where the given surface points are clustered. */
  lookAtCluster(points: V3[]) {
    if (points.length === 0) return this.lookFrom([0, 0.35, 1]);
    const sum = points.reduce<V3>((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
    const l = Math.hypot(sum[0], sum[1], sum[2]);
    this.lookFrom(l < 1e-4 ? [0, 0.35, 1] : [sum[0] / l, sum[1] / l, sum[2] / l]);
  }

  // -------------------------------------------------------------------- input

  private handlePointerDown = (e: PointerEvent) => {
    this.activePointers.add(e.pointerId);
    if (this.activePointers.size > 1) {
      this.multiTouched = true;
      this.downAt = null;
      return;
    }
    this.multiTouched = false;
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private handlePointerUp = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    const down = this.downAt;
    this.downAt = null;
    if (!down || this.multiTouched || !this.tapCb) return;

    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved > 10 || performance.now() - down.t > 500) return;
    this.tapCb(this.toNdc(e.clientX, e.clientY));
  };

  private handlePointerCancel = (e: PointerEvent) => {
    this.activePointers.delete(e.pointerId);
    this.downAt = null;
  };

  onTap(cb: (ndc: THREE.Vector2) => void) {
    this.tapCb = cb;
  }

  toNdc(clientX: number, clientY: number): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1
    );
  }

  /** First hit against the given objects (recursive), nearest first. */
  intersect(ndc: THREE.Vector2, objects: THREE.Object3D[]): THREE.Intersection[] {
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  /** Where the pointer lands on the planet, as a unit vector, or null if it misses. */
  pickSurface(ndc: THREE.Vector2): V3 | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.planet, false)[0];
    if (!hit) return null;
    const p = hit.point;
    return norm([p.x, p.y, p.z]);
  }

  // -------------------------------------------------------------------- loop

  start(onFrame: (dt: number) => void) {
    this.frameCb = onFrame;
    this.lastTime = performance.now();
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;
      this.frameCb?.(dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private handleResize() {
    const w = this.parent.clientWidth;
    const h = this.parent.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyCameraLimits();
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    this.frameCb = null;
    this.tapCb = null;

    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.handlePointerDown);
    el.removeEventListener('pointerup', this.handlePointerUp);
    el.removeEventListener('pointercancel', this.handlePointerCancel);

    this.ro.disconnect();
    this.controls.dispose();
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
    this.renderer.dispose();
    el.remove();
  }
}
