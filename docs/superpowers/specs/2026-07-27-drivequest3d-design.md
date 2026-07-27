# DriveQuest3D — Approved Design (2026-07-27)

The design summary the designer approved before any code was written.

## What you see

A pastel planet floating in the middle of a phone screen, with a handful of chunky
toy cars sitting on its surface — deliberately oversized, so it reads as giant cars
on a tiny world. Each car has a colored curve drawn across the sphere showing its
route, ending at a rectangle slot in that same color. Car color tells you which slot
is its home.

## What you do

One finger drags to spin the planet, pinch to zoom. Tap a car and it drives itself
along its curve to its rectangle. You can tap several cars in quick succession and
have them all driving at once — faster, but riskier, because you're no longer
controlling who arrives where and when.

## The puzzle

Cars are parked on top of each other's routes. So the level is really "who moves
first." A car that reaches its slot pops away and frees that space, which unlocks the
next move. Rush it and two cars meet mid-route.

## Crashing

Two cars collide → both reverse back to their starting spots and the player loses one
life. Lives are a per-level setting, defaulting to 3. Out of lives, the level resets.

Cars that are reversing are immune to further collisions (and don't cause them). This
is deliberate: it keeps the board from deadlocking on a pile-up and keeps the failure
cost predictable at exactly one life per crash.

## Winning

Every car parked. Celebration modal, then Next Level.

## The menu

Opens to a level list of tappable cards, plus an Editor button.

## The editor

Punch in a number of cars and it generates a full level — cars, curved routes,
rectangles, all placed on the sphere. Then hand-tune everything: drag cars to new
spots (including right onto someone else's route, to plant a blocker), drag
rectangles, bend the routes by their control points, and add or delete individual
cars. Set the level's life count. Download it as a file, drop it into
`src/levels/contributed/`, and it joins the level list permanently.

The editor continuously reports whether the level is **solvable by ordering** and how
many rounds the solution takes — so the designer never ships a deadlocked board.

## Ships in v1

The game, the editor, and 3 starter levels — the first one nearly free so the idea
lands, the third one a proper knot.

## Explicitly not in v1

Sound, scoring/stars, any Earth texture or landmasses, level unlock gating (all levels
playable from the start so the designer can test freely).

## Notes on the model

- A level's solvability is **static** — cars never permanently change position, so a
  board that can't be ordered can never be won. The generator only emits solvable
  boards and the editor warns live when hand-edits break solvability.
- Greedy ordering is a *complete* solver here: parking a car only ever removes an
  obstacle, so if any car is currently unblocked, moving it can never be a mistake.
