import { COLLIDE_R, SOLVER_MARGIN, SPHERE_R } from './constants';
import { dist, SpherePath, type V3 } from './spherical';
import type { LevelData } from './types';

/**
 * Greedy ordering is a *complete* solver for this mechanic: parking a car only
 * ever removes an obstacle, never adds one, so if any car is currently unblocked
 * then sending it can never be a mistake. If greedy gets stuck, no order works.
 */
export interface SolveResult {
  /** A safe sequential order, or null if the board is deadlocked. */
  order: string[] | null;
  /** Dependency depth — how many waves of "everything currently free" it takes. */
  rounds: number;
  /** How many cars are blocked before the player touches anything. */
  blockedAtStart: number;
  /** True if two cars are placed on top of each other at level start. */
  overlappingStarts: boolean;
  /** For each car id, the ids of cars currently sitting on its route. */
  blockers: Map<string, string[]>;
}

/** Centre-to-centre world distance at which two cars are considered touching. */
export const COLLIDE_DIST = 2 * COLLIDE_R;

const SAFE_DIST = COLLIDE_DIST + SOLVER_MARGIN;

export function analyzeLevel(level: LevelData): SolveResult {
  const ids = level.cars.map((c) => c.id);
  const paths = new Map<string, SpherePath>();
  const starts = new Map<string, V3>();

  for (const car of level.cars) {
    const p = new SpherePath(car.path);
    paths.set(car.id, p);
    starts.set(car.id, p.start);
  }

  const blocks = (moverId: string, parkedId: string): boolean => {
    const p = paths.get(moverId)!;
    const s = starts.get(parkedId)!;
    return p.minChordTo(s) * SPHERE_R < SAFE_DIST;
  };

  const blockers = new Map<string, string[]>();
  for (const id of ids) {
    blockers.set(
      id,
      ids.filter((other) => other !== id && blocks(id, other))
    );
  }

  let overlappingStarts = false;
  for (let i = 0; i < ids.length && !overlappingStarts; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (dist(starts.get(ids[i])!, starts.get(ids[j])!) * SPHERE_R < COLLIDE_DIST) {
        overlappingStarts = true;
        break;
      }
    }
  }

  const blockedAtStart = ids.filter((id) => blockers.get(id)!.length > 0).length;

  const alive = new Set(ids);
  const order: string[] = [];
  let rounds = 0;

  while (alive.size > 0) {
    const free = [...alive].filter((id) => blockers.get(id)!.every((b) => !alive.has(b)));
    if (free.length === 0) {
      return { order: null, rounds, blockedAtStart, overlappingStarts, blockers };
    }
    for (const id of free) alive.delete(id);
    order.push(...free);
    rounds++;
  }

  return { order, rounds, blockedAtStart, overlappingStarts, blockers };
}
