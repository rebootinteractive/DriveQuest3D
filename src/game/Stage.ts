import * as THREE from 'three';
import { ATMOSPHERE_HEX, PLANET_HEX } from '../shared/colors';
import { SPHERE_R } from '../shared/constants';
import { norm, type V3 } from '../shared/spherical';

/** Velocity retained per 1/60s after release. Lower = stops sooner. */
const FRICTION = 0.945;
/** Below this the coast is over. */
const MIN_SPIN = 0.02;
const MAX_SPIN = 7;
/** A flick older than this isn't a flick — the finger had already settled. */
const FLICK_WINDOW_MS = 90;

const PHI_EPS = 0.06;

/**
 * Everything both the game and the editor need: renderer, camera, the planet, a
 * tap-vs-drag discriminator, and an inertial trackball.
 *
 * The camera orbits rather than the scene rotating, so every surface vector in the
 * scene stays in planet-local space and raycast hits need no transform.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly planet: THREE.Mesh;

  private readonly ro: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private readonly owned: Array<{ dispose(): void }> = [];

  // Orbit state
  private theta = 0;
  private phi = Math.PI / 2;
  private radius = 12;
  private spinTheta = 0;
  private spinPhi = 0;
  private rotationEnabled = true;

  // Pointer state
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private lastMoveAt = 0;
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

    this.radius = this.fitDistance();
    this.lookFrom([0, 0.35, 1]);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });

    this.ro = new ResizeObserver(() => this.handleResize());
    this.ro.observe(parent);
  }

  // ---------------------------------------------------------------- scene bits

  private addLights() {
    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x5b4c39, 0.8));

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
    const mat = new THREE.MeshStandardMaterial({ color: PLANET_HEX, roughness: 0.95, metalness: 0 });
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
    return SPHERE_R / Math.sin((Math.min(fovV, fovH) / 2) * 0.92);
  }

  private minRadius() {
    return SPHERE_R * 1.35;
  }

  private maxRadius() {
    return this.fitDistance() * 1.3;
  }

  /**
   * Radians of rotation per pixel of drag, such that the point under the finger
   * stays under the finger. Naturally gets finer as you zoom in.
   */
  private radPerPixel(): number {
    const h = Math.max(this.parent.clientHeight, 1);
    const toSurface = Math.max(this.radius - SPHERE_R, 0.5);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    return (2 * toSurface * tanHalf) / (SPHERE_R * h);
  }

  private applyCamera() {
    this.phi = THREE.MathUtils.clamp(this.phi, PHI_EPS, Math.PI - PHI_EPS);
    this.radius = THREE.MathUtils.clamp(this.radius, this.minRadius(), this.maxRadius());

    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.radius * sp * Math.sin(this.theta),
      this.radius * Math.cos(this.phi),
      this.radius * sp * Math.cos(this.theta)
    );
    this.camera.lookAt(0, 0, 0);
  }

  /** Point the camera at the planet from the given direction. */
  lookFrom(dir: V3) {
    const d = norm(dir);
    this.phi = Math.acos(THREE.MathUtils.clamp(d[1], -1, 1));
    this.theta = Math.atan2(d[0], d[2]);
    this.spinTheta = 0;
    this.spinPhi = 0;
    this.applyCamera();
  }

  /** Frame the side of the planet where the given surface points are clustered. */
  lookAtCluster(points: V3[]) {
    if (points.length === 0) return this.lookFrom([0, 0.35, 1]);
    const sum = points.reduce<V3>((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
    const l = Math.hypot(sum[0], sum[1], sum[2]);
    this.lookFrom(l < 1e-4 ? [0, 0.35, 1] : [sum[0] / l, sum[1] / l, sum[2] / l]);
  }

  /** Editor turns this off while dragging a route handle. */
  setRotationEnabled(enabled: boolean) {
    this.rotationEnabled = enabled;
    if (!enabled) {
      this.spinTheta = 0;
      this.spinPhi = 0;
    }
  }

  // -------------------------------------------------------------------- input

  private rotateBy(dxPx: number, dyPx: number) {
    const k = this.radPerPixel();
    // Horizontal drag sweeps a smaller circle near the poles; compensate so the
    // grab stays 1:1 wherever you happen to be looking.
    this.theta -= (dxPx * k) / Math.max(Math.sin(this.phi), 0.3);
    this.phi -= dyPx * k;
    this.applyCamera();
  }

  private midpoint(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const p of this.pointers.values()) {
      x += p.x;
      y += p.y;
    }
    const n = Math.max(this.pointers.size, 1);
    return { x: x / n, y: y / n };
  }

  private spread(): number {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  private onPointerDown = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Grabbing the planet stops it dead — the same way a spinning picker wheel does.
    this.spinTheta = 0;
    this.spinPhi = 0;
    this.lastMoveAt = performance.now();

    if (this.pointers.size > 1) {
      this.multiTouched = true;
      this.downAt = null;
      this.pinchDist = this.spread();
      return;
    }
    this.multiTouched = false;
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onPointerMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;

    if (this.pointers.size >= 2) {
      const midBefore = this.midpoint();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const midAfter = this.midpoint();
      const spreadAfter = this.spread();

      if (this.rotationEnabled) {
        if (this.pinchDist > 0 && spreadAfter > 0) {
          this.radius *= this.pinchDist / spreadAfter;
        }
        this.rotateBy(midAfter.x - midBefore.x, midAfter.y - midBefore.y);
      }
      this.pinchDist = spreadAfter;
      return;
    }

    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!this.rotationEnabled) return;

    const now = performance.now();
    const dt = Math.max((now - this.lastMoveAt) / 1000, 1 / 240);
    this.lastMoveAt = now;

    const k = this.radPerPixel();
    const dTheta = -(dx * k) / Math.max(Math.sin(this.phi), 0.3);
    const dPhi = -dy * k;

    this.rotateBy(dx, dy);

    // Smoothed so one jittery sample can't launch the planet.
    this.spinTheta = this.spinTheta * 0.4 + (dTheta / dt) * 0.6;
    this.spinPhi = this.spinPhi * 0.4 + (dPhi / dt) * 0.6;
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.renderer.domElement.releasePointerCapture?.(e.pointerId);

    if (this.pointers.size < 2) this.pinchDist = 0;

    // If the finger had already come to rest, releasing shouldn't fling anything.
    if (performance.now() - this.lastMoveAt > FLICK_WINDOW_MS) {
      this.spinTheta = 0;
      this.spinPhi = 0;
    }
    this.spinTheta = THREE.MathUtils.clamp(this.spinTheta, -MAX_SPIN, MAX_SPIN);
    this.spinPhi = THREE.MathUtils.clamp(this.spinPhi, -MAX_SPIN, MAX_SPIN);

    const down = this.downAt;
    this.downAt = null;
    if (!down || this.multiTouched || !this.tapCb || e.type === 'pointercancel') return;

    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved > 10 || performance.now() - down.t > 500) return;

    // A tap is not a flick.
    this.spinTheta = 0;
    this.spinPhi = 0;
    this.tapCb(this.toNdc(e.clientX, e.clientY));
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.rotationEnabled) return;
    e.preventDefault();
    this.radius *= Math.exp(e.deltaY * 0.0012);
    this.applyCamera();
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

  intersect(ndc: THREE.Vector2, objects: THREE.Object3D[]): THREE.Intersection[] {
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  /** Where the pointer lands on the planet, as a unit vector, or null if it misses. */
  pickSurface(ndc: THREE.Vector2): V3 | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.planet, false)[0];
    if (!hit) return null;
    return norm([hit.point.x, hit.point.y, hit.point.z]);
  }

  // -------------------------------------------------------------------- loop

  private coast(dt: number) {
    if (this.pointers.size > 0) return;
    if (Math.abs(this.spinTheta) < MIN_SPIN && Math.abs(this.spinPhi) < MIN_SPIN) {
      this.spinTheta = 0;
      this.spinPhi = 0;
      return;
    }

    this.theta += this.spinTheta * dt;
    this.phi += this.spinPhi * dt;

    // Bleeding off vertical spin at the poles avoids a jarring hard stop.
    const before = this.phi;
    this.applyCamera();
    if (this.phi !== before) this.spinPhi = 0;

    const decay = Math.pow(FRICTION, dt * 60);
    this.spinTheta *= decay;
    this.spinPhi *= decay;
  }

  start(onFrame: (dt: number) => void) {
    this.frameCb = onFrame;
    this.lastTime = performance.now();
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;
      this.frameCb?.(dt);
      this.coast(dt);
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
    this.applyCamera();
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    this.frameCb = null;
    this.tapCb = null;

    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    el.removeEventListener('wheel', this.onWheel);

    this.ro.disconnect();
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
    this.renderer.dispose();
    el.remove();
  }
}
