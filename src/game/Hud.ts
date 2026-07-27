export interface HudCallbacks {
  onBack: () => void;
  onRestart: () => void;
  onNext: (() => void) | null;
}

export interface HudOptions {
  backLabel: string;
}

export class Hud {
  private readonly root: HTMLDivElement;
  private readonly heartsEl: HTMLDivElement;
  private readonly progressEl: HTMLDivElement;
  private readonly hintEl: HTMLDivElement;
  private modalEl: HTMLDivElement | null = null;
  private hintTimer = 0;

  constructor(parent: HTMLElement, private cb: HudCallbacks, opts: HudOptions) {
    this.root = document.createElement('div');
    this.root.className = 'overlay';

    const top = document.createElement('div');
    top.className = 'hud-top';

    this.heartsEl = document.createElement('div');
    this.heartsEl.className = 'hearts';
    top.appendChild(this.heartsEl);

    this.progressEl = document.createElement('div');
    this.progressEl.className = 'hud-counter';
    top.appendChild(this.progressEl);

    this.root.appendChild(top);

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'hint';
    this.hintEl.textContent = 'Tap a car to send it home · drag to spin · pinch to zoom';
    this.root.appendChild(this.hintEl);

    const bottom = document.createElement('div');
    bottom.className = 'hud-bottom';

    const back = document.createElement('button');
    back.className = 'btn ghost small';
    back.textContent = opts.backLabel;
    back.addEventListener('click', () => this.cb.onBack());
    bottom.appendChild(back);

    const restart = document.createElement('button');
    restart.className = 'btn ghost small';
    restart.textContent = '↻ Restart';
    restart.addEventListener('click', () => this.cb.onRestart());
    bottom.appendChild(restart);

    this.root.appendChild(bottom);
    parent.appendChild(this.root);

    this.hintTimer = window.setTimeout(() => this.hintEl.classList.add('gone'), 4200);
  }

  setLives(current: number, max: number) {
    this.heartsEl.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const h = document.createElement('span');
      h.className = i < current ? 'heart' : 'heart lost';
      h.textContent = '♥';
      this.heartsEl.appendChild(h);
    }
  }

  /** Brief flash when a life is lost. */
  flashDamage() {
    this.heartsEl.classList.remove('shake');
    // Force a reflow so the animation restarts even on back-to-back crashes.
    void this.heartsEl.offsetWidth;
    this.heartsEl.classList.add('shake');
  }

  setProgress(parked: number, total: number) {
    this.progressEl.innerHTML = `<strong>${parked}</strong> / ${total} home`;
  }

  dismissHint() {
    this.hintEl.classList.add('gone');
  }

  showEnd(kind: 'win' | 'lose', title: string, message: string) {
    this.modalEl?.remove();

    const modal = document.createElement('div');
    modal.className = 'modal';

    const card = document.createElement('div');
    card.className = `modal-card endgame ${kind}`;

    const h = document.createElement('h1');
    h.textContent = title;
    card.appendChild(h);

    const p = document.createElement('p');
    p.textContent = message;
    card.appendChild(p);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const menu = document.createElement('button');
    menu.className = 'btn ghost';
    menu.textContent = 'Menu';
    menu.addEventListener('click', () => this.cb.onBack());
    actions.appendChild(menu);

    const again = document.createElement('button');
    again.className = 'btn ghost';
    again.textContent = kind === 'win' ? 'Replay' : 'Retry';
    again.addEventListener('click', () => this.cb.onRestart());
    actions.appendChild(again);

    if (kind === 'win' && this.cb.onNext) {
      const next = document.createElement('button');
      next.className = 'btn';
      next.textContent = 'Next →';
      next.addEventListener('click', () => this.cb.onNext?.());
      actions.appendChild(next);
    }

    card.appendChild(actions);
    modal.appendChild(card);
    this.root.appendChild(modal);
    this.modalEl = modal;
  }

  dispose() {
    clearTimeout(this.hintTimer);
    this.modalEl?.remove();
    this.modalEl = null;
    this.root.remove();
  }
}
