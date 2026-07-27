import * as THREE from 'three';
import { CarView, carIdFromHit } from '../game/CarView';
import { RouteView } from '../game/RouteView';
import { SlotView } from '../game/SlotView';
import { Stage } from '../game/Stage';
import { COLOR_KEYS, colorHex } from '../shared/colors';
import { DEFAULT_LIVES, SPHERE_R } from '../shared/constants';
import { generateLevel, makeCarAt } from '../shared/generator';
import { analyzeLevel } from '../shared/solver';
import { lonLatToV3, slerp, SpherePath, v3ToLonLat, type V3 } from '../shared/spherical';
import type { LevelData } from '../shared/types';
import { saveCustomLevel } from '../ui/storage';

type Tool = 'move' | 'add' | 'delete';

interface EditorCar {
  path: SpherePath;
  view: CarView;
  route: RouteView;
  slot: SlotView;
}

export interface EditorCallbacks {
  onExit: () => void;
  onTestPlay: (level: LevelData) => void;
}

export interface EditorOptions {
  initial?: LevelData;
}

const HANDLE_LIFT = 0.34;

export class EditorApp {
  private readonly stage: Stage;
  private readonly root: HTMLDivElement;

  private level: LevelData;
  private tool: Tool = 'move';
  private selectedId: string | null = null;
  private dragHandle: number | null = null;

  private readonly cars = new Map<string, EditorCar>();
  private handles: THREE.Mesh[] = [];
  private readonly handleGeo = new THREE.SphereGeometry(0.13, 16, 12);
  private readonly handleMats: Record<'start' | 'mid' | 'end', THREE.MeshBasicMaterial>;

  private nameInput!: HTMLInputElement;
  private livesInput!: HTMLInputElement;
  private countInput!: HTMLInputElement;
  private statusLeft!: HTMLSpanElement;
  private statusRight!: HTMLSpanElement;
  private toolButtons = {} as Record<Tool, HTMLButtonElement>;
  private modalEl: HTMLDivElement | null = null;
  private flashTimer = 0;

  constructor(parent: HTMLElement, opts: EditorOptions, private cb: EditorCallbacks) {
    this.level = opts.initial
      ? structuredClone(opts.initial)
      : generateLevel(6, { name: 'New Planet', lives: DEFAULT_LIVES });

    this.stage = new Stage(parent);
    this.handleMats = {
      start: new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }),
      mid: new THREE.MeshBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true }),
      end: new THREE.MeshBasicMaterial({ color: 0x58e1c4, depthTest: false, transparent: true }),
    };

    this.root = document.createElement('div');
    this.root.className = 'overlay';
    parent.appendChild(this.root);
    this.buildUi();

    this.rebuildAll();
    this.stage.lookAtCluster([...this.cars.values()].map((c) => c.path.start));

    this.stage.onTap((ndc) => this.handleTap(ndc));

    const el = this.stage.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);

    this.stage.start((dt) => {
      for (const c of this.cars.values()) c.slot.update(dt);
    });
  }

  // ------------------------------------------------------------------------ UI

  private buildUi() {
    const toolbar = document.createElement('div');
    toolbar.className = 'editor-toolbar';

    const mkTool = (tool: Tool, label: string) => {
      const b = document.createElement('button');
      b.className = 'tool-btn';
      b.textContent = label;
      b.addEventListener('click', () => this.setTool(tool));
      this.toolButtons[tool] = b;
      toolbar.appendChild(b);
    };
    mkTool('move', '↖ Move');
    mkTool('add', '+ Car');
    mkTool('delete', '🗑 Delete');

    toolbar.appendChild(this.mkButton('+ Bend', () => this.addBend()));
    toolbar.appendChild(this.mkButton('− Bend', () => this.removeBend()));

    const spacer = document.createElement('div');
    spacer.className = 'tool-spacer';
    toolbar.appendChild(spacer);

    toolbar.appendChild(this.mkButton('← Menu', () => this.cb.onExit()));
    this.root.appendChild(toolbar);

    const status = document.createElement('div');
    status.className = 'editor-status';
    this.statusLeft = document.createElement('span');
    this.statusRight = document.createElement('span');
    status.appendChild(this.statusLeft);
    status.appendChild(this.statusRight);
    this.root.appendChild(status);

    const bottom = document.createElement('div');
    bottom.className = 'editor-bottom';

    this.nameInput = this.mkField(bottom, 'Name', this.level.name, 'text', 'wide');
    this.nameInput.addEventListener('input', () => {
      this.level.name = this.nameInput.value;
    });

    this.livesInput = this.mkField(bottom, 'Lives', String(this.level.lives), 'number');
    this.livesInput.addEventListener('input', () => {
      const v = parseInt(this.livesInput.value, 10);
      this.level.lives = Number.isFinite(v) ? Math.max(1, Math.min(9, v)) : DEFAULT_LIVES;
      this.refreshStatus();
    });

    this.countInput = this.mkField(bottom, 'Cars', String(this.level.cars.length), 'number');

    bottom.appendChild(this.mkButton('⟳ Generate', () => this.regenerate(), 'btn ghost small'));
    bottom.appendChild(this.mkButton('▶ Test', () => this.cb.onTestPlay(this.snapshot()), 'btn small'));
    bottom.appendChild(this.mkButton('Copy JSON', () => this.showJson(), 'btn ghost small'));
    bottom.appendChild(this.mkButton('↓ Download', () => this.downloadJson(), 'btn ghost small'));
    bottom.appendChild(this.mkButton('Save', () => this.save(), 'btn ghost small'));

    this.root.appendChild(bottom);
    this.setTool('move');
  }

  private mkButton(label: string, onClick: () => void, cls = 'tool-btn'): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  private mkField(
    parent: HTMLElement,
    label: string,
    value: string,
    type: string,
    extra = ''
  ): HTMLInputElement {
    const wrap = document.createElement('label');
    wrap.className = 'editor-field';
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    if (extra) input.className = extra;
    wrap.appendChild(span);
    wrap.appendChild(input);
    parent.appendChild(wrap);
    return input;
  }

  private setTool(tool: Tool) {
    this.tool = tool;
    for (const key of Object.keys(this.toolButtons) as Tool[]) {
      this.toolButtons[key].classList.toggle('active', key === tool);
    }
    if (tool !== 'move') this.select(null);
    this.refreshStatus();
  }

  private flash(msg: string) {
    clearTimeout(this.flashTimer);
    this.statusLeft.textContent = msg;
    this.flashTimer = window.setTimeout(() => this.refreshStatus(), 2600);
  }

  private refreshStatus() {
    clearTimeout(this.flashTimer);

    const hints: Record<Tool, string> = {
      move: this.selectedId
        ? 'Drag the dots: white = car, yellow = bend, mint = parking bay.'
        : 'Tap a car to select it, then drag its dots.',
      add: 'Tap the planet to drop a new car there.',
      delete: 'Tap a car to remove it.',
    };
    this.statusLeft.textContent = hints[this.tool];

    const res = analyzeLevel(this.snapshot());
    if (res.overlappingStarts) {
      this.statusRight.className = 'status-bad';
      this.statusRight.textContent = '⚠ Two cars overlap';
    } else if (!res.order) {
      this.statusRight.className = 'status-bad';
      this.statusRight.textContent = '⚠ Deadlock — unwinnable';
    } else {
      this.statusRight.className = 'status-ok';
      this.statusRight.textContent = `✓ Solvable · ${res.rounds} wave${res.rounds === 1 ? '' : 's'} · ${res.blockedAtStart} blocked`;
    }
  }

  // -------------------------------------------------------------------- scene

  private rebuildAll() {
    for (const car of this.cars.values()) {
      car.view.dispose();
      car.route.dispose();
      car.slot.dispose();
    }
    this.cars.clear();
    for (const spec of this.level.cars) this.buildCar(spec.id);
    this.rebuildHandles();
    this.countInput.value = String(this.level.cars.length);
    this.refreshStatus();
  }

  private buildCar(id: string) {
    const spec = this.level.cars.find((c) => c.id === id);
    if (!spec) return;

    const path = new SpherePath(spec.path);
    const hex = colorHex(spec.color);

    const view = new CarView(hex, spec.id);
    view.setOnSurface(path.start, path.tangentAt(0));
    this.stage.scene.add(view.group);

    const route = new RouteView(path, hex);
    this.stage.scene.add(route.object);

    const slot = new SlotView(path.end, path.tangentAt(path.total), hex);
    this.stage.scene.add(slot.mesh);

    this.cars.set(id, { path, view, route, slot });
  }

  private rebuildCar(id: string) {
    const existing = this.cars.get(id);
    if (existing) {
      existing.view.dispose();
      existing.route.dispose();
      existing.slot.dispose();
      this.cars.delete(id);
    }
    this.buildCar(id);
  }

  private rebuildHandles() {
    for (const h of this.handles) {
      h.parent?.remove(h);
    }
    this.handles = [];
    if (!this.selectedId) return;

    const spec = this.level.cars.find((c) => c.id === this.selectedId);
    if (!spec) return;

    spec.path.forEach((ll, i) => {
      const kind = i === 0 ? 'start' : i === spec.path.length - 1 ? 'end' : 'mid';
      const mesh = new THREE.Mesh(this.handleGeo, this.handleMats[kind]);
      const p = lonLatToV3(ll);
      mesh.position.set(p[0], p[1], p[2]).multiplyScalar(SPHERE_R + HANDLE_LIFT);
      mesh.renderOrder = 999;
      mesh.userData.handleIndex = i;
      this.stage.scene.add(mesh);
      this.handles.push(mesh);
    });
  }

  private select(id: string | null) {
    this.selectedId = id;
    for (const [cid, car] of this.cars) {
      car.route.setOpacity(id && cid !== id ? 0.3 : 0.85);
    }
    this.rebuildHandles();
    this.refreshStatus();
  }

  // -------------------------------------------------------------------- input

  private onPointerDown = (e: PointerEvent) => {
    if (this.tool !== 'move' || !this.selectedId || this.handles.length === 0) return;
    const ndc = this.stage.toNdc(e.clientX, e.clientY);
    const hit = this.stage.intersect(ndc, this.handles)[0];
    if (!hit) return;

    this.dragHandle = hit.object.userData.handleIndex as number;
    this.stage.setRotationEnabled(false);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.dragHandle === null || !this.selectedId) return;
    const surface = this.stage.pickSurface(this.stage.toNdc(e.clientX, e.clientY));
    if (!surface) return;

    const spec = this.level.cars.find((c) => c.id === this.selectedId);
    if (!spec) return;

    spec.path[this.dragHandle] = v3ToLonLat(surface);
    this.rebuildCar(spec.id);

    const handle = this.handles[this.dragHandle];
    if (handle) handle.position.set(surface[0], surface[1], surface[2]).multiplyScalar(SPHERE_R + HANDLE_LIFT);
  };

  private onPointerUp = () => {
    if (this.dragHandle === null) return;
    this.dragHandle = null;
    this.stage.setRotationEnabled(true);
    this.refreshStatus();
  };

  private handleTap(ndc: THREE.Vector2) {
    // A tap that lands on a drag handle is a no-op — it belongs to the drag flow.
    if (this.handles.length > 0 && this.stage.intersect(ndc, this.handles).length > 0) return;

    const carGroups = [...this.cars.values()].map((c) => c.view.group);
    const carId = carIdFromHit(this.stage.intersect(ndc, carGroups)[0]?.object ?? null);

    if (this.tool === 'move') {
      this.select(carId);
      return;
    }

    if (this.tool === 'delete') {
      if (!carId) return;
      this.level.cars = this.level.cars.filter((c) => c.id !== carId);
      if (this.selectedId === carId) this.selectedId = null;
      this.rebuildAll();
      this.flash('Car removed.');
      return;
    }

    // add
    const surface = this.stage.pickSurface(ndc);
    if (!surface) return;
    this.addCarAt(surface);
  }

  private addCarAt(surface: V3) {
    const used = new Set(this.level.cars.map((c) => c.id));
    let n = this.level.cars.length + 1;
    while (used.has(`c${n}`)) n++;

    const colorIndex = this.level.cars.length % COLOR_KEYS.length;
    this.level.cars.push(makeCarAt(surface, colorIndex, `c${n}`));
    this.rebuildAll();
    this.flash('Car added — switch to Move to shape its route.');
  }

  private addBend() {
    const spec = this.level.cars.find((c) => c.id === this.selectedId);
    if (!spec) return this.flash('Select a car first.');
    if (spec.path.length >= 6) return this.flash('That route already has plenty of bends.');

    // Split the longest control-to-control span.
    let bestI = 0;
    let bestD = -1;
    for (let i = 0; i < spec.path.length - 1; i++) {
      const a = lonLatToV3(spec.path[i]);
      const b = lonLatToV3(spec.path[i + 1]);
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (d > bestD) {
        bestD = d;
        bestI = i;
      }
    }
    const mid = slerp(lonLatToV3(spec.path[bestI]), lonLatToV3(spec.path[bestI + 1]), 0.5);
    spec.path.splice(bestI + 1, 0, v3ToLonLat(mid));

    this.rebuildCar(spec.id);
    this.rebuildHandles();
    this.refreshStatus();
  }

  private removeBend() {
    const spec = this.level.cars.find((c) => c.id === this.selectedId);
    if (!spec) return this.flash('Select a car first.');
    if (spec.path.length <= 2) return this.flash('A route needs a start and an end.');

    spec.path.splice(1, 1);
    this.rebuildCar(spec.id);
    this.rebuildHandles();
    this.refreshStatus();
  }

  private regenerate() {
    const wanted = parseInt(this.countInput.value, 10);
    const count = Number.isFinite(wanted) ? Math.max(1, Math.min(24, wanted)) : 6;
    const fresh = generateLevel(count, {
      id: this.level.id,
      name: this.level.name,
      lives: this.level.lives,
    });
    this.level.cars = fresh.cars;
    this.selectedId = null;
    this.rebuildAll();
    this.flash(`Generated ${count} car${count === 1 ? '' : 's'}. Tweak away.`);
  }

  // ------------------------------------------------------------------ persist

  private snapshot(): LevelData {
    return {
      id: this.level.id,
      name: this.nameInput?.value || this.level.name || 'Untitled Planet',
      lives: this.level.lives,
      cars: structuredClone(this.level.cars),
    };
  }

  private save() {
    const lv = this.snapshot();
    saveCustomLevel(lv);
    this.flash(`Saved "${lv.name}" to this browser.`);
  }

  private showJson() {
    const json = JSON.stringify(this.snapshot(), null, 2);

    const modal = document.createElement('div');
    modal.className = 'modal';
    const card = document.createElement('div');
    card.className = 'modal-card';

    const h = document.createElement('h2');
    h.textContent = 'Level JSON';
    card.appendChild(h);

    const area = document.createElement('textarea');
    area.className = 'json';
    area.value = json;
    card.appendChild(area);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    actions.style.marginTop = '12px';

    const copy = document.createElement('button');
    copy.className = 'btn';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => {
      area.select();
      navigator.clipboard?.writeText(json).catch(() => document.execCommand('copy'));
      copy.textContent = 'Copied!';
    });
    actions.appendChild(copy);

    const close = document.createElement('button');
    close.className = 'btn ghost';
    close.textContent = 'Close';
    close.addEventListener('click', () => {
      modal.remove();
      this.modalEl = null;
    });
    actions.appendChild(close);

    card.appendChild(actions);
    modal.appendChild(card);
    this.root.appendChild(modal);
    this.modalEl = modal;
  }

  private downloadJson() {
    const lv = this.snapshot();
    const json = JSON.stringify(lv, null, 2);
    const slug =
      (lv.name || lv.id || 'level')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'level';

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.flash('Downloaded — drop into src/levels/contributed/ to ship it.');
  }

  dispose() {
    clearTimeout(this.flashTimer);

    const el = this.stage.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);

    this.stage.dispose();

    for (const car of this.cars.values()) {
      car.view.dispose();
      car.route.dispose();
      car.slot.dispose();
    }
    this.cars.clear();

    for (const h of this.handles) h.parent?.remove(h);
    this.handles = [];
    this.handleGeo.dispose();
    for (const m of Object.values(this.handleMats)) m.dispose();

    this.modalEl?.remove();
    this.modalEl = null;
    this.root.remove();
  }
}
