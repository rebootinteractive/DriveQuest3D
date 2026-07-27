import { COLOR_KEYS } from './colors';
import { DEFAULT_LIVES } from './constants';
import { analyzeLevel } from './solver';
import {
  add,
  anyPerp,
  cross,
  norm,
  rotateAbout,
  scale,
  v3ToLonLat,
  type LonLat,
  type V3,
} from './spherical';
import type { CarSpec, LevelData } from './types';

export type Rng = () => number;

export interface GenerateOptions {
  id?: string;
  name?: string;
  lives?: number;
  rng?: Rng;
}

/** Deterministic RNG, so a seed reproduces a level exactly. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomUnit(rng: Rng): V3 {
  const z = rng() * 2 - 1;
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(a), z, r * Math.sin(a)];
}

/**
 * How much of the planet a level occupies. Small levels stay on one face so the
 * player can take them in at a glance; big ones wrap further round the back.
 */
export function capAngleFor(n: number): number {
  return Math.min(Math.PI, 0.6 + 0.15 * n);
}

/**
 * Evenly-ish spread points inside a randomly-oriented spherical cap
 * (equal-area in the along-axis coordinate, golden-angle in longitude).
 */
function fibonacciPoints(n: number, rng: Rng): V3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const phase = rng() * Math.PI * 2;
  const axis = randomUnit(rng);
  const e1 = anyPerp(axis);
  const e2 = cross(axis, e1);
  const yMin = Math.cos(capAngleFor(n));

  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 1 : yMin + (1 - yMin) * (1 - (2 * i + 1) / (2 * n));
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i + phase;
    pts.push(
      norm(
        add(add(scale(axis, y), scale(e1, r * Math.cos(th))), scale(e2, r * Math.sin(th)))
      )
    );
  }
  return pts;
}

/** A unit tangent at `p`, in a random direction. */
function randomTangent(p: V3, rng: Rng): V3 {
  const seed = randomUnit(rng);
  const t = norm(cross(p, cross(seed, p)));
  return t;
}

function buildPath(start: V3, rng: Rng, arcMin: number, arcMax: number): LonLat[] {
  const t = randomTangent(start, rng);
  const axis = norm(cross(start, t));
  const arc = arcMin + rng() * (arcMax - arcMin);
  const dest = rotateAbout(start, axis, arc);

  /** Push a point on the great circle off it by `b` radians. */
  const bend = (frac: number, b: number): V3 => {
    const onCircle = rotateAbout(start, axis, arc * frac);
    return norm(add(scale(onCircle, Math.cos(b)), scale(axis, Math.sin(b))));
  };

  const sign = rng() < 0.5 ? -1 : 1;
  const sCurve = arc > 0.95 && rng() < 0.35;

  const mids: V3[] = sCurve
    ? [
        bend(0.33, sign * (0.08 + rng() * 0.22)),
        bend(0.67, -sign * (0.08 + rng() * 0.22)),
      ]
    : [bend(0.5, sign * (0.07 + rng() * 0.3))];

  return [start, ...mids, dest].map(v3ToLonLat);
}

function attempt(count: number, arcMax: number, rng: Rng, id: string, name: string, lives: number): LevelData {
  const starts = fibonacciPoints(count, rng);
  const cars: CarSpec[] = starts.map((raw, i) => {
    // A little jitter so the layout doesn't read as a lattice.
    const start = rotateAbout(raw, randomTangent(raw, rng), (rng() - 0.5) * 0.22);
    return {
      id: `c${i + 1}`,
      color: COLOR_KEYS[i % COLOR_KEYS.length],
      path: buildPath(start, rng, Math.min(0.45, arcMax * 0.6), arcMax),
    };
  });
  return { id, name, lives, cars };
}

/**
 * Generate a level that is guaranteed solvable by ordering, preferring layouts
 * with a real dependency chain (so it plays as a puzzle, not a tapping exercise).
 */
export function generateLevel(count: number, opts: GenerateOptions = {}): LevelData {
  const rng = opts.rng ?? Math.random;
  const id = opts.id ?? `custom-${Math.floor((rng() * 1e9) % 1e9).toString(36)}`;
  const name = opts.name ?? `Generated ${count}`;
  const lives = opts.lives ?? DEFAULT_LIVES;
  const n = Math.max(1, Math.min(24, Math.round(count)));

  const wantRounds = Math.min(3, Math.max(2, Math.ceil(n / 3)));
  const wantBlocked = Math.max(1, Math.floor(n / 3));

  let best: LevelData | null = null;
  let bestScore = -1;

  for (let i = 0; i < 120; i++) {
    // Later attempts use shorter routes, which are far likelier to be solvable.
    const arcMax = 1.5 - (i / 120) * 0.9;
    const lv = attempt(n, arcMax, rng, id, name, lives);
    const res = analyzeLevel(lv);
    if (!res.order || res.overlappingStarts) continue;

    const score = res.rounds * 100 + res.blockedAtStart;
    if (score > bestScore) {
      bestScore = score;
      best = lv;
    }
    if (n < 3 || (res.rounds >= wantRounds && res.blockedAtStart >= wantBlocked)) break;
  }

  // Fall back to very short, well-separated routes — trivially solvable.
  return best ?? attempt(n, 0.4, rng, id, name, lives);
}

/** A single extra car placed at `p`, used by the editor's "add" tool. */
export function makeCarAt(p: V3, colorIndex: number, id: string, rng: Rng = Math.random): CarSpec {
  return {
    id,
    color: COLOR_KEYS[colorIndex % COLOR_KEYS.length],
    path: buildPath(norm(p), rng, 0.5, 0.85),
  };
}
