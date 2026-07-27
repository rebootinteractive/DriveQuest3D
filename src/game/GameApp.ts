import * as THREE from 'three';
import { colorHex } from '../shared/colors';
import { DRIVE_SPEED, RETURN_SPEED, SPHERE_R } from '../shared/constants';
import { COLLIDE_DIST } from '../shared/solver';
import { dist, SpherePath, type V3 } from '../shared/spherical';
import type { LevelData } from '../shared/types';
import { CarView, carIdFromHit } from './CarView';
import { Hud } from './Hud';
import { RouteView } from './RouteView';
import { SlotView } from './SlotView';
import { Stage } from './Stage';

type CarState = 'idle' | 'driving' | 'returning' | 'parking' | 'gone';

const PARK_DURATION = 0.36;

interface Car {
  id: string;
  path: SpherePath;
  view: CarView;
  route: RouteView;
  slot: SlotView;
  state: CarState;
  /** Arc position along the route, in radians of surface travel. */
  s: number;
  surface: V3;
  parkT: number;
  bump: number;
}

export interface GameCallbacks {
  onBack: () => void;
  onRestart: () => void;
  onNext: (() => void) | null;
}

export interface GameOptions {
  level: LevelData;
  /** Label for the HUD's back button — differs when arriving from the editor. */
  backLabel?: string;
}

export class GameApp {
  private readonly stage: Stage;
  private readonly hud: Hud;
  private readonly cars: Car[] = [];
  private readonly maxLives: number;
  private lives: number;
  private finished = false;

  constructor(parent: HTMLElement, opts: GameOptions, cb: GameCallbacks) {
    const level = opts.level;
    this.maxLives = Math.max(1, level.lives || 3);
    this.lives = this.maxLives;

    this.stage = new Stage(parent);
    this.hud = new Hud(
      parent,
      { onBack: cb.onBack, onRestart: cb.onRestart, onNext: cb.onNext },
      { backLabel: opts.backLabel ?? '← Levels' }
    );

    for (const spec of level.cars) {
      const path = new SpherePath(spec.path);
      const hex = colorHex(spec.color);

      const view = new CarView(hex, spec.id);
      view.setOnSurface(path.start, path.tangentAt(0));
      this.stage.scene.add(view.group);

      const route = new RouteView(path, hex);
      this.stage.scene.add(route.object);

      const slot = new SlotView(path.end, path.tangentAt(path.total), hex);
      this.stage.scene.add(slot.mesh);

      this.cars.push({
        id: spec.id,
        path,
        view,
        route,
        slot,
        state: 'idle',
        s: 0,
        surface: path.start,
        parkT: 0,
        bump: 0,
      });
    }

    this.stage.lookAtCluster(this.cars.map((c) => c.path.start));
    this.hud.setLives(this.lives, this.maxLives);
    this.hud.setProgress(0, this.cars.length);

    this.stage.onTap((ndc) => this.handleTap(ndc));
    this.stage.start((dt) => this.update(dt));
  }

  // --------------------------------------------------------------------- input

  private handleTap(ndc: THREE.Vector2) {
    if (this.finished) return;

    const tappable = this.cars.filter((c) => c.state === 'idle').map((c) => c.view.group);
    if (tappable.length === 0) return;

    const hit = this.stage.intersect(ndc, tappable)[0];
    const id = carIdFromHit(hit?.object ?? null);
    if (!id) return;

    const car = this.cars.find((c) => c.id === id);
    if (!car || car.state !== 'idle') return;

    car.state = 'driving';
    this.hud.dismissHint();
  }

  // ---------------------------------------------------------------------- loop

  private update(dt: number) {
    for (const car of this.cars) {
      if (car.state === 'gone') continue;
      this.advance(car, dt);
    }

    this.resolveCollisions();

    for (const car of this.cars) {
      if (car.state !== 'gone') car.slot.update(dt);
    }

    this.checkOutcome();
  }

  private advance(car: Car, dt: number) {
    if (car.state === 'driving') {
      car.s += (DRIVE_SPEED / SPHERE_R) * dt;
      if (car.s >= car.path.total) {
        car.s = car.path.total;
        car.state = 'parking';
        car.parkT = 0;
        this.hud.setProgress(this.parkedCount(), this.cars.length);
      }
    } else if (car.state === 'returning') {
      car.s -= (RETURN_SPEED / SPHERE_R) * dt;
      if (car.s <= 0) {
        car.s = 0;
        car.state = 'idle';
      }
    }

    car.surface = car.path.pointAt(car.s);

    if (car.state === 'parking') {
      car.parkT += dt;
      const t = Math.min(car.parkT / PARK_DURATION, 1);
      // Pop up, then shrink away.
      const scale = t < 0.35 ? 1 + (t / 0.35) * 0.3 : 1.3 * (1 - (t - 0.35) / 0.65);
      car.view.setScale(Math.max(scale, 0));
      car.view.setOpacity(t < 0.35 ? 1 : Math.max(0, 1 - (t - 0.35) / 0.65));
      car.route.setOpacity(Math.max(0, 0.85 * (1 - t)));
      car.slot.setOpacity(Math.max(0, 0.9 * (1 - t)));
      car.view.setOnSurface(car.surface, car.path.tangentAt(car.s));

      if (t >= 1) {
        car.state = 'gone';
        car.view.dispose();
        car.route.dispose();
        car.slot.dispose();
        this.hud.setProgress(this.parkedCount(), this.cars.length);
      }
      return;
    }

    if (car.bump > 0) {
      car.bump = Math.max(0, car.bump - dt);
      car.view.setScale(1 + Math.sin(car.bump * 46) * 0.07);
    } else {
      car.view.setScale(1);
    }

    car.view.setOnSurface(car.surface, car.path.tangentAt(car.s));
  }

  /**
   * Cars that are reversing are immune, both as victim and as obstacle. That keeps
   * pile-ups from cascading and pins the cost of a mistake at exactly one life.
   */
  private resolveCollisions() {
    if (this.finished) return;

    const moving = this.cars.filter((c) => c.state === 'driving');
    if (moving.length === 0) return;

    const obstacles = this.cars.filter((c) => c.state === 'driving' || c.state === 'idle');
    const bounced = new Set<string>();
    let crashes = 0;

    for (const a of moving) {
      if (bounced.has(a.id)) continue;
      for (const b of obstacles) {
        if (b.id === a.id || bounced.has(b.id)) continue;
        if (dist(a.surface, b.surface) * SPHERE_R >= COLLIDE_DIST) continue;

        crashes++;
        bounced.add(a.id);
        if (b.state === 'driving') bounced.add(b.id);
        else b.bump = 0.35;
        break;
      }
    }

    if (crashes === 0) return;

    for (const id of bounced) {
      const car = this.cars.find((c) => c.id === id);
      if (car && car.state === 'driving') car.state = 'returning';
    }

    this.lives = Math.max(0, this.lives - crashes);
    this.hud.setLives(this.lives, this.maxLives);
    this.hud.flashDamage();
  }

  private parkedCount() {
    return this.cars.filter((c) => c.state === 'gone' || c.state === 'parking').length;
  }

  private checkOutcome() {
    if (this.finished) return;

    if (this.cars.length > 0 && this.cars.every((c) => c.state === 'gone')) {
      this.finished = true;
      const l = this.lives;
      this.hud.showEnd(
        'win',
        'Planet Cleared!',
        `Every car home with ${l} ${l === 1 ? 'life' : 'lives'} to spare.`
      );
      return;
    }

    if (this.lives <= 0) {
      this.finished = true;
      this.hud.showEnd('lose', 'Out of Lives', 'Too many pile-ups. Pick a safer order and try again.');
    }
  }

  dispose() {
    this.stage.dispose();
    for (const car of this.cars) {
      if (car.state === 'gone') continue;
      car.view.dispose();
      car.route.dispose();
      car.slot.dispose();
    }
    this.cars.length = 0;
    this.hud.dispose();
  }
}
