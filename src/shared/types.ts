import type { LonLat } from './spherical';

export interface CarSpec {
  id: string;
  /** A key from CAR_COLORS. The destination slot is drawn in the same colour. */
  color: string;
  /**
   * Spline control points on the sphere, at least two.
   * `path[0]` is where the car starts; the last entry is its destination slot.
   */
  path: LonLat[];
}

export interface LevelData {
  id: string;
  name: string;
  lives: number;
  cars: CarSpec[];
}

export function carCount(level: LevelData): number {
  return level.cars.length;
}
