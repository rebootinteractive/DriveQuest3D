/**
 * Pure spherical geometry — no Three.js. Everything here works on unit vectors,
 * so it can be compiled and exercised standalone (see scripts note in the repo
 * README) as well as inside the bundle.
 */

export type V3 = [number, number, number];

/** A point on the sphere, stored as [longitude, latitude] in degrees. */
export type LonLat = [number, number];

const DEG = Math.PI / 180;

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: V3) => Math.sqrt(dot(a, a));
export const dist = (a: V3, b: V3) => len(sub(a, b));

export function norm(a: V3): V3 {
  const l = len(a);
  return l < 1e-12 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l];
}

/** Great-circle angle between two unit vectors, in radians. */
export function angleBetween(a: V3, b: V3): number {
  return Math.acos(clamp(dot(a, b), -1, 1));
}

/** Spherical linear interpolation between two unit vectors. */
export function slerp(a: V3, b: V3, t: number): V3 {
  const w = angleBetween(a, b);
  if (w < 1e-6) return norm(add(scale(a, 1 - t), scale(b, t)));
  const s = Math.sin(w);
  return add(scale(a, Math.sin((1 - t) * w) / s), scale(b, Math.sin(t * w) / s));
}

/** Rotate `v` around unit `axis` by `angle` radians (Rodrigues). */
export function rotateAbout(v: V3, axis: V3, angle: number): V3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

/** Any unit vector perpendicular to `n`. */
export function anyPerp(n: V3): V3 {
  const seed: V3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return norm(cross(n, seed));
}

export function lonLatToV3(ll: LonLat): V3 {
  const a = ll[0] * DEG;
  const b = ll[1] * DEG;
  const cb = Math.cos(b);
  return [cb * Math.sin(a), Math.sin(b), cb * Math.cos(a)];
}

export function v3ToLonLat(v: V3): LonLat {
  const n = norm(v);
  const lat = Math.asin(clamp(n[1], -1, 1)) / DEG;
  const lon = Math.atan2(n[0], n[2]) / DEG;
  return [round3(lon), round3(lat)];
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Centripetal Catmull-Rom through four points. Endpoints of the overall path are
 * extended by reflection rather than duplication, which keeps the parametrisation
 * non-degenerate for two-point paths.
 */
function catmullRom(p0: V3, p1: V3, p2: V3, p3: V3, u: number): V3 {
  const alpha = 0.5;
  const t0 = 0;
  const t1 = t0 + Math.pow(Math.max(dist(p0, p1), 1e-4), alpha);
  const t2 = t1 + Math.pow(Math.max(dist(p1, p2), 1e-4), alpha);
  const t3 = t2 + Math.pow(Math.max(dist(p2, p3), 1e-4), alpha);
  const t = t1 + (t2 - t1) * u;

  const A1 = add(scale(p0, (t1 - t) / (t1 - t0)), scale(p1, (t - t0) / (t1 - t0)));
  const A2 = add(scale(p1, (t2 - t) / (t2 - t1)), scale(p2, (t - t1) / (t2 - t1)));
  const A3 = add(scale(p2, (t3 - t) / (t3 - t2)), scale(p3, (t - t2) / (t3 - t2)));
  const B1 = add(scale(A1, (t2 - t) / (t2 - t0)), scale(A2, (t - t0) / (t2 - t0)));
  const B2 = add(scale(A2, (t3 - t) / (t3 - t1)), scale(A3, (t - t1) / (t3 - t1)));
  return add(scale(B1, (t2 - t) / (t2 - t1)), scale(B2, (t - t1) / (t2 - t1)));
}

const reflect = (a: V3, b: V3): V3 => sub(scale(a, 2), b);

/**
 * A smooth curve that lies on the unit sphere: a Catmull-Rom spline through the
 * control points, with every sample projected back onto the surface.
 *
 * Arc lengths are stored as angles (unit-sphere distance). Multiply by the world
 * sphere radius to get world distance.
 */
export class SpherePath {
  readonly pts: V3[];
  readonly cum: number[];
  readonly total: number;

  constructor(readonly controls: LonLat[], perSegment = 18) {
    const c = controls.map(lonLatToV3);

    if (c.length === 0) {
      this.pts = [[0, 1, 0]];
    } else if (c.length === 1) {
      this.pts = [c[0]];
    } else {
      const pts: V3[] = [];
      for (let i = 0; i < c.length - 1; i++) {
        const p1 = c[i];
        const p2 = c[i + 1];
        const p0 = i > 0 ? c[i - 1] : reflect(p1, p2);
        const p3 = i + 2 < c.length ? c[i + 2] : reflect(p2, p1);
        for (let k = 0; k < perSegment; k++) {
          pts.push(norm(catmullRom(p0, p1, p2, p3, k / perSegment)));
        }
      }
      pts.push(norm(c[c.length - 1]));
      this.pts = pts;
    }

    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      this.cum.push(this.cum[i - 1] + angleBetween(this.pts[i - 1], this.pts[i]));
    }
    this.total = this.cum[this.cum.length - 1];
  }

  /** Position at arc distance `s` (in radians along the surface). */
  pointAt(s: number): V3 {
    if (this.pts.length === 1 || this.total <= 1e-9) return this.pts[0];
    const q = clamp(s, 0, this.total);

    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= q) lo = mid;
      else hi = mid;
    }
    const span = this.cum[hi] - this.cum[lo];
    const t = span < 1e-9 ? 0 : (q - this.cum[lo]) / span;
    return slerp(this.pts[lo], this.pts[hi], t);
  }

  /** Unit tangent (pointing forward along the path) at arc distance `s`. */
  tangentAt(s: number): V3 {
    const n = this.pointAt(s);
    if (this.total <= 1e-9) return anyPerp(n);
    const e = Math.max(this.total * 0.002, 1e-3);
    const a = this.pointAt(clamp(s - e, 0, this.total));
    const b = this.pointAt(clamp(s + e, 0, this.total));
    let d = sub(b, a);
    d = sub(d, scale(n, dot(d, n)));
    return len(d) < 1e-9 ? anyPerp(n) : norm(d);
  }

  get start(): V3 {
    return this.pts[0];
  }

  get end(): V3 {
    return this.pts[this.pts.length - 1];
  }

  /** Smallest chord distance from any sampled point on this path to `p`. */
  minChordTo(p: V3): number {
    let best = Infinity;
    for (const q of this.pts) {
      const d = dist(q, p);
      if (d < best) best = d;
    }
    return best;
  }
}
