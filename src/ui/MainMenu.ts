import { ALL_LEVELS } from '../levels';
import { analyzeLevel } from '../shared/solver';
import type { LevelData } from '../shared/types';
import { deleteCustomLevel, loadCustomLevels } from './storage';

export interface MenuCallbacks {
  onPlay: (level: LevelData) => void;
  onOpenEditor: (forLevel?: LevelData) => void;
}

export class MainMenu {
  private root: HTMLDivElement;

  constructor(private parent: HTMLElement, private cb: MenuCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'menu';
    this.parent.appendChild(this.root);
    this.render();
  }

  private render() {
    this.root.innerHTML = '';

    const title = document.createElement('h1');
    title.className = 'menu-title';
    title.textContent = 'DriveQuest3D';
    this.root.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'menu-sub';
    sub.textContent = 'Giant toy cars, one tiny planet. Send each one home without a pile-up.';
    this.root.appendChild(sub);

    const label = document.createElement('div');
    label.className = 'menu-section-label';
    label.textContent = 'Levels';
    this.root.appendChild(label);

    const list = document.createElement('div');
    list.className = 'level-list';
    for (const lvl of ALL_LEVELS) list.appendChild(this.renderCard(lvl, false));
    this.root.appendChild(list);

    const customs = loadCustomLevels();
    const customLabel = document.createElement('div');
    customLabel.className = 'menu-section-label';
    customLabel.textContent = `Your Levels${customs.length ? ` (${customs.length})` : ''}`;
    this.root.appendChild(customLabel);

    const customList = document.createElement('div');
    customList.className = 'level-list';
    if (customs.length === 0) {
      const empty = document.createElement('div');
      empty.style.color = '#8b91a6';
      empty.style.fontSize = '13px';
      empty.style.padding = '6px 4px';
      empty.textContent = 'No custom levels yet — create one in the editor.';
      customList.appendChild(empty);
    } else {
      for (const lvl of customs) customList.appendChild(this.renderCard(lvl, true));
    }
    this.root.appendChild(customList);

    const footer = document.createElement('div');
    footer.className = 'menu-footer';
    const newBtn = document.createElement('button');
    newBtn.className = 'btn';
    newBtn.style.width = '100%';
    newBtn.textContent = '+ Create New Level';
    newBtn.addEventListener('click', () => this.cb.onOpenEditor());
    footer.appendChild(newBtn);
    this.root.appendChild(footer);
  }

  private renderCard(level: LevelData, isCustom: boolean): HTMLDivElement {
    const card = document.createElement('div');
    card.className = 'level-card';
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      this.cb.onPlay(level);
    });

    const left = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = level.name;

    const meta = document.createElement('div');
    meta.className = 'meta';
    const n = level.cars.length;
    const res = analyzeLevel(level);
    const depth = res.order ? `${res.rounds}-deep` : 'deadlocked';
    meta.textContent = `${n} car${n === 1 ? '' : 's'} · ${level.lives} ${level.lives === 1 ? 'life' : 'lives'} · ${depth}`;

    left.appendChild(name);
    left.appendChild(meta);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '8px';

    if (isCustom) {
      const editBtn = document.createElement('button');
      editBtn.className = 'btn ghost small';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cb.onOpenEditor(level);
      });
      right.appendChild(editBtn);

      const del = document.createElement('button');
      del.className = 'delete';
      del.textContent = '×';
      del.title = 'Delete';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${level.name}"?`)) {
          deleteCustomLevel(level.id);
          this.render();
        }
      });
      right.appendChild(del);
    } else {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'PLAY';
      right.appendChild(badge);
    }

    card.appendChild(left);
    card.appendChild(right);
    return card;
  }

  dispose() {
    this.root.remove();
  }
}
