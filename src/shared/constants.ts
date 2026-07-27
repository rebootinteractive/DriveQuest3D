/** World radius of the planet. Cars are sized against this to sell the scale gag. */
export const SPHERE_R = 3.2;

export const CAR_LEN = 1.15;
export const CAR_W = 0.66;
export const CAR_H = 0.34;
/** How far the car's origin sits above the surface so its wheels touch down. */
export const CAR_LIFT = 0.27;

/**
 * Cars collide as circles on the surface. Slightly tighter than half the car
 * length so bumper-to-bumper near-misses read as near-misses.
 */
export const COLLIDE_R = 0.4;

/**
 * World units per second along the surface. Fast enough that a send feels
 * decisive; a frame at the 50ms dt cap still only advances ~0.17 units against a
 * 0.8-unit collision distance, so nothing can tunnel through a blocker.
 */
export const DRIVE_SPEED = 3.4;
export const RETURN_SPEED = 7;

export const ROUTE_LIFT = 0.05;
export const SLOT_LIFT = 0.02;

export const DEFAULT_LIVES = 3;

/**
 * Extra margin the solver adds on top of the real collision distance, so a level
 * reported "solvable" is never a hair's-breadth squeeze in practice.
 */
export const SOLVER_MARGIN = 0.06;
