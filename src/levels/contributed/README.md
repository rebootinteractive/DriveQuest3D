# Contributed Levels

Levels designed in the in-game editor land here.

Workflow:

1. Open the level editor in the deployed game and design a level.
2. Hit **↓ Download** — you get a `.json` file.
3. Drop the file into this folder (`src/levels/contributed/`).
4. Commit and push — the site redeploys automatically and the level shows up
   in the main menu for everyone.

No code changes needed; every `.json` in this folder is auto-discovered at
build time.

## Level shape

```jsonc
{
  "id": "custom-abc123",   // unique across all levels
  "name": "Ring Road",
  "lives": 3,              // crashes allowed before the level resets
  "cars": [
    {
      "id": "c1",
      "color": "red",      // red yellow mint blue purple orange pink lime
      // [longitude, latitude] in degrees. First entry is where the car starts,
      // last is its parking bay; anything in between bends the route.
      "path": [[12.5, 8.0], [30.1, 22.4], [55.0, 18.2]]
    }
  ]
}
```

The editor's status bar tells you whether a level is **solvable by ordering**
before you ship it — a level flagged `⚠ Deadlock` can never be won, because cars
never permanently move out of each other's way.
