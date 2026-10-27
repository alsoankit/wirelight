# Wirelight

**A browser game that teaches how computer networks really work, for complete beginners.**

The world is a ruined palace on a hill, the Palace of a Thousand Doors, with a network running through its walls: the Deep Network. **Machines are rooms, network doors (interfaces) are doors, and cables are corridors.** Long ago its peoples left, the knowledge of how it works was forgotten, and the lights went out. You are a newcomer who found the outer gate at the edge of the forest. You enter there and climb inward and upward, the oldest parts first, restoring the palace room by room by doing the network's own job with real Linux networking commands. Every room you fix comes back to life: light, colour and life spread out from the very thing you repaired.

## What it wants to achieve
- **Anyone can learn networking from zero.** One new idea per room, at most two new words, and nothing used before it's taught. Harder ideas get more rooms, not denser ones.
- **You learn by doing the network's job.** You address letters, plug cables, sort messages and watch what happens. Failure is free, visible and explained: no lives, timers, points or leaderboards.
- **Real tools, real output.** The commands (`ip`, `ping`, `bridge`, `tcpdump`, `dhclient`…) behave like real Linux, checked against golden output captured from real Linux. Game-only helpers live under `lab …` and are clearly marked.
- **You see what's invisible.** Every message is a small light you can watch travel the cables, catch, slow down and replay. One event trace drives everything you see.
- **Beautiful, quiet and kind.** Gentle ruins that are eerie but never scary, graceful guardians, light balanced for the eyes.
- **Playable by anyone, anywhere.** It runs in the browser, it never depends on a server to be finished, and it supports reduced motion and a text-only mode where every spoken line is shown and nothing is voiced.

## The world (first release)
Four regions, ten floors and 40 rooms, plus a secret room in each region. Each region is a part of the palace, and its Guardian is one of the palace's statues:

| Region | Part of the palace | Floors | What you learn | Its Guardian |
|---|---|---|---|---|
| **1 · The Overgrown Halls**: moss, roots and rune-lit ruins | the outer gardens and the old wall | Prologue, The Wire, Names on the Wire | links, cables, interfaces, MAC addresses | the Gardener, a seated stone woman holding roses |
| **2 · The Sorting Works**: a clockmakers' works of brass and gears | the works inside the walls | The Switch, Memory and Loops | switches, learning, loops and spanning tree | the clockwork owl, cast in bronze |
| **3 · The Lantern Town**: a sleeping town of streets and house numbers | the town on the terraces | Addresses, Envelopes, Neighbourhoods | IP addresses, ARP, subnets | the Lamplighter, a robed stone figure with a lantern |
| **4 · The Cathedral of Crossings**: a gothic cathedral of great crossings | the cathedral on the high terrace | Crossings, The Journey | routers, routes, the journey of a packet | the stone warden, a winged stone angel |

Four more regions are planned, climbing on to the crown at the top of the hill: ports and connections, names (DNS), the web, and the edges of the network.

**How a room plays:** arrive and read the mission; look around the room; act by clicking (each click runs a real command, shown in the console) or by typing once you've earned the console; watch the messages move; win, and the room restores; then a debrief explains what happened. After each floor's boss, its guardian's memory returns as a short, explorable story. Each room has a keeper, a hooded figure you can ask why it did what it did, and each region has a Guardian who answers questions. The Guardians are statues: they don't walk, but they glow when they speak and catch the light when their rooms come back.

The game opens with an approach through the forest to the outer gate, which opens. The world map is a 3D model of the palace on its hill, its parts lighting up as you restore them. A loading screen shows while a room loads. On a phone, the landing page shows a still of the world and a note to play on a computer, since the game needs typing and a larger screen.

## How it's built
| Part | What it does |
|---|---|
| `packages/sim` | A deterministic network simulator (links, bridges, ARP, IPv4, routing, spanning tree), Linux-faithful, with a seeded clock: no randomness, no wall time. |
| `packages/shell` | The command line: `ip link/addr/route/neigh`, `ping`, `bridge`, `tcpdump`, `dhclient`, `sysctl`, `lab …`, with output matching real Linux. |
| `packages/rooms` | Every room as data: topology, mission, win conditions, hints, plus a validator. |
| `packages/engine` | Runs the simulator in a Web Worker and turns its event trace into what the game shows. |
| `packages/content` | All player-facing text, in plain modern English, kept out of the code. |
| `apps/web` | The game: React, React Three Fiber on three.js (WebGPU with a WebGL2 fallback, node materials), Zustand, xterm.js, Vite. |
| `tools/` | Golden-output capture from real Linux, the difference test against real network namespaces, the Blender light bake, the model rework (`tools/rework`), the region emblems (`tools/art`), the asset and audio pipelines, and the play scripts that play every room in a real browser. |

The look is carved and painted: real 3D scans and art kits, reworked in Blender by `tools/rework` (decimated, their fine detail baked into normal and ambient-occlusion maps, and coloured from each region's palette). Each region has a painted emblem, drawn by `tools/art/emblems.mjs`. The 3D rooms are built from these kits and lit by light baked in Blender (ruined and restored maps, blended as a room comes back to life). The game has no runtime shadows and stays within a fixed budget per room (under 150 draw calls and 100k triangles).

## Assets
Only assets that allow commercial use and redistribution are used: CC0, CC BY, MIT, Apache-2.0 or OFL. Nothing share-alike or non-commercial is used. Every asset is credited in [`CREDITS.md`](CREDITS.md) the day it's added, and its licence record is kept in `assets-src/licenses/`.

**In the game now**
- **3D art:** Quaternius' Ultimate Modular Ruins, Stylized Nature, Medieval Village, Fantasy Props and Turret packs, and SigilsVault's Modular Cathedral Kit (all CC0), restyled per region. Roots, gears, runes, stained glass and many props are made in code.
- **Statues and characters**, reworked in Blender (decimated, rebaked and recoloured):
  - the keeper and the Lamplighter: *Mourner from the Tomb of Philip the Bold* and *Mourner from Tomb of John the Fearless*, Cleveland Museum of Art (CC0);
  - the stone warden: *Grab Albrechtsdorfer* by noe-3d (CC0);
  - the Gardener: *Frauenfigur* by noe-3d (CC BY 4.0);
  - the clockwork owl: *Owl* by Maxmalow (CC BY 4.0);
  - the Lamplighter's lantern: *Lantern 01*, Poly Haven (CC0).

  Full credits, with links, are in [`CREDITS.md`](CREDITS.md).
- **Sound:** Kenney's Interface, UI, Impact and RPG audio packs (CC0); every other effect and ambience is synthesised for Wirelight with FFmpeg.
- **Fonts:** Inter, JetBrains Mono and Cinzel (SIL Open Font License).
- **Libraries:** React, three.js, React Three Fiber, drei, Zustand, xterm.js, Comlink, Vite, Biome, Vitest, Playwright and others, each under its own MIT or Apache-2.0 licence.

**Coming next:** more statues, cathedral vaults, ruins and town pieces for variety; music chosen per region from a licence-checked shortlist; voices.

## Running it
Needs Node 24+ and pnpm.

```
pnpm install
pnpm dev               # the game at http://localhost:5173
pnpm test              # simulator, shell, rooms, engine and web tests
pnpm check             # Biome and type checks
pnpm rooms:validate    # every room against the room rules
pnpm build             # production build
pnpm e2e               # browser tests
```

Dev aids: `?room=<id>` opens a room directly, and **Shift+D** opens the dev panel (jump to any room, auto-play it, try mistakes).

**Playthrough (dev only):** watch the game play itself, room after room, at a pace a person can follow: missions, solutions, debriefs, memories and the ending. Start it from the dev panel ("Play from here" or "Play from the start"), or open a link such as

```
http://localhost:5173/play?room=prologue&autoplay=1&until=game&speed=1&pace=1
```

`until` is `floor`, `region` or `game`; `speed` is `1`, `4` or `16`; `pace` (reading time) is `0.6`, `1` or `1.6`; add `&memories=0` or `&secrets=0` to leave those out. While it plays: Pause, Next room and Stop. **Shift+N** writes a note about what's on screen (the playthrough waits while you type), and the notes copy or download as Markdown, grouped by room.

## Status
All 40 first-release rooms and the four secret rooms are playable in 3D, with every region's art pass done, the keeper and the Guardians in place as statues, the opening approach, the 3D palace map and the loading screen. Still to come: music and voices, the public deploy and human playtests.

## Licence
Wirelight's own code and art: © Ankit Kumar, all rights reserved. Third-party assets keep their own licences, listed in [`CREDITS.md`](CREDITS.md).
