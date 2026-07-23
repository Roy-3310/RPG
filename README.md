# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

礦坑獵魔者 — a self-contained side-scrolling action-RPG loot game built in vanilla HTML5/CSS3/ES6 with the Canvas 2D API. No build tooling, no package manager, no external frameworks/libraries. The original spec that drove this build is in `project.md` (Traditional Chinese) — read it if you need the full original feature list.

## Running the game

Because `assets.js` loads sprites via `new Image()` with URL-encoded paths (filenames contain spaces and Chinese characters), the game **must be served over HTTP**, not opened directly as a `file://` URL — some browsers block/misload local image fetches under `file://`. Serve the directory root and open `index.html`, e.g.:

```
python -m http.server 8642
# then open http://localhost:8642/index.html
```

There is no dev server, bundler, or watch task in this repo — any static file server works.

## Validating changes

There is no test suite, linter, or build step. The only automated check available is Node's syntax checker, run per-file:

```
node --check game.js
node --check player.js
# etc.
```

This only catches syntax errors, not logic bugs — after editing gameplay code, actually load the page in a browser and play through the affected mechanic (movement/combat/loot/UI) to confirm it behaves correctly.

## Script load order matters

All modules are plain `<script>` tags in `index.html` (no ES modules, no imports/exports) — everything is a global `class`/`const` attached to `window` implicitly by script load order:

```
physics.js → assets.js → audio.js → effects.js → collision.js → level.js → item.js → player.js → enemy.js → ui.js → game.js
```

Each file assumes everything before it in this list is already defined (e.g. `enemy.js` references `Collision`, `Physics`, `Effects`, `Assets`, `Animator`, `LootSystem`; `game.js` references nearly everything). If you add a new file or new cross-file class reference, add the `<script>` tag in the correct dependency position and keep this order in mind — there's no module resolution to save you from ordering mistakes.

## Architecture

Every system is a single `class` per file, most exposing only `static` methods/state (i.e. used as namespaces, e.g. `Physics`, `Collision`, `Effects`, `Assets`, `AudioSys`, `UI`, `LootSystem`), while a few are instantiated per-entity (`Player`, `Enemy` subclasses, `DropEntity`, `Camera`, `Input`).

- **`game.js`** — `Input` (keyboard state with held/pressed/released edges), `Camera` (smooth-follow with lookahead + world-bounds clamp), and `Game` (the state machine: `loading/title/playing/paused/inventory/dead/victory`, the `requestAnimationFrame` main loop, entity lists for enemies/drops, pickup handling, kill/loot settlement, zone transitions and checkpoints). `Game` is the composition root — it owns `level`, `player`, `camera`, `enemies[]`, `drops[]` and drives `update()`/`draw()` each frame. Instantiated once at `window.onload` as `window.game`.
- **`physics.js`** — `Physics`: pure static constants (gravity, accel, friction, jump tuning incl. coyote time / jump buffer / variable jump height) and stateless helper functions (`applyGravity`, `accelerate`, `applyFriction`, `lerp`, `clamp`, `rand`). No entity-specific logic.
- **`collision.js`** — `Collision`: AABB overlap tests and `moveAndCollide(entity, level, dt)`, the shared axis-separated tile-collision resolver used by both `Player` and `Enemy`. Also `ledgeAhead()` for enemy patrol AI (prevents walking off platform edges).
- **`level.js`** — `MapBuilder` (imperative grid-authoring API: `box`, `ground`, `plat`, `spawn`, `coinRow` — the level is hand-authored code, not a tilemap file) and `Level` (tile grid storage/query, autotiling render, parallax background layers, `Zone` difficulty regions separated by pits, monster/coin spawn points, checkpoints). The world is a single long hand-built map divided into 4 escalating zones ending in a boss lair.
- **`item.js`** — `Equipment` (weapon/armor instances with rarity-scaled stats), `DropEntity` (physical loot/coin/potion entity that falls and can be picked up), `LootSystem` (static: rarity roll + drop table per enemy). Rarity tiers, base item types, and legendary name/affix tables are module-level consts (`RARITY`, `WEAPON_BASES`, `ARMOR_BASES`, `LEGEND_NAMES`, `PREFIXES`, `LEGEND_BONUSES`).
- **`player.js`** — `Player`: movement/jump (coyote time, jump buffering, variable jump height, one-way platform drop-through), 3-hit combo melee (lunge + hitstop + crit, defined in `Player.COMBO`), stats/leveling/gold, damage/i-frames/knockback, death/respawn, inventory (`Player.INV_SIZE` slots) and equip logic.
- **`enemy.js`** — `Enemy` base class plus subclasses per monster type (`RobotEnemy`, `OrcEnemy` → `EliteOrc`/`BossOrc`, `SkeletonEnemy`, `GoblinEnemy`, `MushroomEnemy`, `FlyingEyeEnemy`), each with its own patrol/aggro/attack AI built on `Collision`/`Physics`. `EnemyFactory.create(spawn)` maps a level spawn-point `type` string to a concrete enemy instance — add new monster types here.
- **`assets.js`** — `ASSET_MANIFEST` (path table into `遊戲素材/`, the bundled third-party art asset packs), `Assets` (async image loader + runtime color-tinting to derive elite/boss sprite variants from a single source sheet via `source-atop` compositing), `SPRITE_DEFS` (per-character animation frame metadata: scale, pivot/foot alignment, per-anim frame count/fps/loop), `Animator` (drives per-entity animation playback from a `SPRITE_DEFS` entry).
- **`audio.js`** — `AudioSys`: all sound is synthesized at runtime via the Web Audio API (oscillator `tone()` / filtered `noise()`) — there are no audio asset files. Must be lazily inited on a user gesture (`AudioSys.init()` is called from the first keydown) due to browser autoplay policy.
- **`effects.js`** — `Effects`: static particle/float-text/slash-arc/hitstop/camera-shake system, driven by `update(dt)`/`draw(ctx)` calls from the main loop.
- **`ui.js`** — `UI`: all DOM/HUD manipulation (HP/XP bars, gold, equip slots, inventory grid, tooltips, toasts, zone banners, overlays). This is the only file that touches the DOM outside `index.html`/`game.js` canvas setup — gameplay code signals UI via `UI.toast()`, `UI.zoneBanner()`, etc. rather than manipulating the DOM directly.

## Adding content

- **New monster**: add a class in `enemy.js` extending `Enemy` (or an existing subclass), register its `type` string in `EnemyFactory.create`, add a spawn entry via `MapBuilder.spawn()` in `level.js`, and add its sprite/animation entry to `SPRITE_DEFS` in `assets.js` (asset files must already exist under `遊戲素材/`).
- **New item/rarity tier**: extend the `RARITY`/`WEAPON_BASES`/`ARMOR_BASES`/`LEGEND_*` tables in `item.js`; `Equipment` and `LootSystem` derive stats/behavior from these tables rather than hardcoding per-item logic.
- **New level geometry/zone**: edit the `MapBuilder` call sequence in `level.js` (`ground`, `plat`, `box`, `spawn`, `coinRow`) and the `Level.ZONE_LAYERS`/zone metadata.
