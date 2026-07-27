import { EditorApp } from './editor/EditorApp';
import { GameApp } from './game/GameApp';
import { ALL_LEVELS } from './levels';
import type { LevelData } from './shared/types';
import { MainMenu } from './ui/MainMenu';

const app = document.getElementById('app')!;
let current: { dispose(): void } | undefined;

function clearApp() {
  current?.dispose();
  current = undefined;
}

function showMenu() {
  clearApp();
  current = new MainMenu(app, {
    onPlay: (level) => showGame(level),
    onOpenEditor: (level) => showEditor(level),
  });
}

function showGame(level: LevelData, returnToEditor?: LevelData) {
  clearApp();

  // "Next" only makes sense when playing the built-in run, not when testing an edit.
  const idx = ALL_LEVELS.findIndex((l) => l.id === level.id);
  const next = !returnToEditor && idx >= 0 && idx + 1 < ALL_LEVELS.length ? ALL_LEVELS[idx + 1] : null;

  current = new GameApp(
    app,
    { level, backLabel: returnToEditor ? '← Editor' : '← Levels' },
    {
      onBack: () => (returnToEditor ? showEditor(returnToEditor) : showMenu()),
      onRestart: () => showGame(level, returnToEditor),
      onNext: next ? () => showGame(next) : null,
    }
  );
}

function showEditor(initial?: LevelData) {
  clearApp();
  current = new EditorApp(
    app,
    { initial },
    {
      onExit: () => showMenu(),
      onTestPlay: (lv) => showGame(lv, lv),
    }
  );
}

showMenu();
