# Wirelight

**A browser game that teaches how computer networks really work, for complete beginners.**

You are a repair robot. You switch back on in an old palace whose machines stopped passing messages years ago, and your job is to get them talking again, one room at a time. In the palace, **every room is a machine, every door is a network interface, and every corridor is a cable.** You fix what's broken with the same commands people use on real Linux machines, and each room comes back to life as you do.

## What it wants to achieve
- **Anyone can learn networking from zero.** One new idea per room, at most two new words, and nothing used before it's taught. Harder ideas get more rooms, not denser ones.
- **Plain words first, real terms after.** A room explains an idea in everyday words; its debrief names the real term; later rooms use the term, with the plain words beside it at first. Commands you've learned stay beside the terminal until you've typed them in a few more rooms.
- **You learn by doing the network's job.** You plug cables, address messages, sort them by hand and watch what happens. Failure is free, visible and explained: no lives, timers, points or leaderboards.
- **Real tools, real output.** The commands (`ip`, `ping`, `bridge`, `tcpdump`, `dhclient`, `sysctl`…) behave like real Linux, checked against golden output captured from real Linux. Game-only helpers live under `lab …` and say so.
- **You see what's invisible.** Every message is a small light you can watch travel the cables, catch, slow down and replay. One event trace drives everything you see.
- **Simple to follow.** One voice (the robot's), plain modern English, nothing to collect. Hints are the robot's memory fragments; what you've learned is kept in its Memory.
- **Playable by anyone, anywhere.** It runs in the browser, never depends on a server to be finished, and supports reduced motion and a text-only mode where every spoken line is shown and nothing plays.

## The first release
Four regions, ten floors (counting the Prologue) and 40 rooms, plus a secret room in each region:

| Region | Part of the palace | Floors | What you learn |
|---|---|---|---|
| **1 · The Overgrown Halls** | the outer gardens | Prologue, Cables and Links, Frames and MAC Addresses | cables, links, interfaces, MAC addresses, broadcast |
| **2 · The Sorting Works** | the works inside the walls | Switches, Switch Tables and Loops | switches, the MAC table, loops and spanning tree |
| **3 · The Lantern Town** | the town on the terraces | IP Addresses, Packets and ARP, Subnets and DHCP | IP addresses, ping, packets, ARP, subnets, DHCP |
| **4 · The Cathedral of Crossings** | the cathedral on the high terrace | Routers, Routing Across Networks | routers, routes, the return path, TTL, routing loops |

More regions are planned, climbing on to the top of the hill: many routers and finding the path (`traceroute`), ports and connections, names (DNS) and the web, and the edges of the network.

**How a room plays:** read the mission (what's wrong, and what to achieve); look around; act by clicking (every click runs a real command, shown in the terminal) or by typing in the terminal once it's online; watch the messages move; and when the room works again, the debrief says what happened and names the new words. Each room has a keeper, the machine that handles its messages: ask it, and its log tells you exactly what it did. A machine's role (switch, router, DHCP server) joins its name once a room has taught it.

**The opening** is the robot switching on: a short boot screen, then the room it woke up in, then three tips.

## How it's built
| Part | What it does |
|---|---|
| `packages/sim` | A deterministic network simulator (links, bridges, ARP, IPv4, routing, spanning tree), Linux-faithful, with a seeded clock: no randomness, no wall time. |
| `packages/shell` | The command line: `ip link/addr/route/neigh`, `ping`, `bridge`, `tcpdump`, `dhclient`, `sysctl`, `lab …`, with output matching real Linux. |
| `packages/rooms` | Every room as data: topology, win conditions, hints, plus a validator. |
| `packages/engine` | Runs the simulator in a Web Worker and turns its event trace into what the game shows. |
| `packages/content` | All player-facing text, in plain modern English, kept out of the code. |
| `supabase/` | The optional sign-in's table for opt-in play logs, with its access rules (`migrations/`). |
| `apps/web` | The game: React, React Three Fiber on three.js (WebGPU with a WebGL2 fallback, node materials), Zustand, xterm.js, Vite. |
| `tools/` | Golden-output capture from real Linux, the difference test against real network namespaces, the Blender light bake, the model rework (`tools/rework`), room captures and browser play-throughs (`tools/shots`). |

The look is carved and painted: 3D scans and art kits, reworked in Blender by `tools/rework` (decimated, their fine detail baked into normal and ambient-occlusion maps, recoloured per region) and lit by light baked in Blender. Doors face the room at the other end of their cable, so both ends of a corridor match, and the way back opens on the near edge toward you.

## Assets
Only assets that allow commercial use and redistribution are used: CC0, CC BY, MIT, Apache-2.0 or OFL. Nothing share-alike or non-commercial. Every asset is credited, with links, in [`CREDITS.md`](CREDITS.md).

- **3D art:** Quaternius' modular ruins, nature, village, props and turret packs, and SigilsVault's Modular Cathedral Kit (all CC0), restyled per region; statues and decoration from museum and artist scans (CC0 and CC BY).
- **Sound:** Kenney's audio packs (CC0); other effects and ambience synthesised for Wirelight with FFmpeg.
- **Music:** ethereal ambient tracks by Tsorthan Grove (CC BY 4.0) and an ending by Eliot Corley (CC BY 3.0), from OpenGameArt.
- **Fonts:** Inter, JetBrains Mono and Cinzel (SIL Open Font License).
- **Libraries:** React, three.js, React Three Fiber, drei, Zustand, xterm.js, Comlink, Vite, Biome, Vitest, Playwright and others, each under its own MIT or Apache-2.0 licence.

## Running it
Needs Node 24+ and pnpm.

```
pnpm install
pnpm dev               # the game at http://localhost:5173
pnpm test              # simulator, shell, rooms, engine and web tests
pnpm check             # Biome and type checks
pnpm rooms:validate    # every room against the room rules
pnpm build             # production build
pnpm e2e               # browser test of a first visit
```

**Optional sign-in and play logs:** players can sign in from Settings with a link sent by email, and switch on sending their play logs (off unless they do). To build that in, copy `.env.example` to `.env` and fill in the Supabase project's public key; the table and its rules are in `supabase/migrations/0001_play_logs.sql`. Without a `.env` the game builds and plays exactly the same, and sends nothing anywhere.

Dev aids: `/play?room=<id>&onboarded=1` opens a room directly, and **Shift+D** opens the dev panel (jump to any room, auto-play it, try mistakes).

**Playthrough (dev only):** watch the game play itself, room after room. Start it from the dev panel, or open a link such as

```
http://localhost:5173/play?room=prologue&autoplay=1&until=game&speed=1&pace=1
```

`until` is `floor`, `region` or `game`; `speed` is `1`, `4` or `16`; `pace` (reading time) is `0.6`, `1` or `1.6`. **Shift+N** writes a note about what's on screen, and the notes download as Markdown, grouped by room.

**Play-through checks:** `node tools/shots/play/region1.mjs http://localhost:5173/play` (and `region2` to `region4`) plays every room of a region in Chrome, as a player would, and reports each win. Set `CHROME` to a Chrome binary to play on the GPU; without it, Playwright's own Chromium plays, drawing in software.

## Status
All 40 first-release rooms and the four secret rooms are playable from start to finish, with baked light, music, ambience and sound effects. Next: voices, and playtests with real beginners.

## How it was made
Wirelight is made by **Ankit Kumar**, who designed the game, wrote its design and directs every decision.
It was co-developed with **[Claude](https://www.anthropic.com/claude)**, Anthropic's AI model, which wrote much of the code, the simulator's tests against real Linux, and the build and bake tools, working from that design.

## Contributing
Bug reports and ideas are welcome as issues. If you'd like to send a change, open an issue first so we can agree on it; every pull request must pass `pnpm check`, `pnpm test` and `pnpm rooms:validate`. Room text follows the game's rules: plain modern English, one new idea per room, and nothing used before it's taught.

## Licence
Wirelight's own code, text, tools and the art and sounds made for it are released under the [MIT License](LICENSE), © 2026 Ankit Kumar.

Third-party assets (3D models, textures, sound packs, fonts, icons and music) are **not** covered by that licence: each keeps its own (CC0, CC BY, the Quaternius Asset License or OFL), listed with links in [`CREDITS.md`](CREDITS.md), with records in `assets-src/licenses/`. If you reuse them, get them from their authors and keep their credits.
