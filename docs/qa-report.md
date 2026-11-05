# QA pass: play-throughs and bug fixes

Branch `qa/playthrough-fixes`, from `prototype/prerendered-rooms` at 19280bd, later rebased onto it after the
cleanup pass (#1) was merged. Every fix is its own commit, and each commit passed `pnpm check`, `pnpm test`
and `pnpm rooms:validate` (by exit code) before it was made. The runs below were made before that rebase;
the commit hashes are the rebased ones, which carry the same changes.

| | Before | After |
|---|---|---|
| `pnpm test` | 1530 | 1545 |
| `pnpm rooms:validate` | 852 | 852 |
| `pnpm check` warnings | 30 | 30 |

"Before" is `prototype/prerendered-rooms` with the cleanup pass merged; when this pass began (19280bd) the
counts were 1524, 849 and 31, and this branch alone took them to 1539, 849 and 31.

## What I ran

The machine: 4 cores, 15 GB, no GPU, so every browser drew in software (SwiftShader).

- **Setup.** `pnpm install`, `pnpm build`, then `pnpm e2e`. This container doesn't allow `playwright install`, and
  its preinstalled Chromium is Chrome 153 (Playwright's revision 1243), while the project pins Playwright 1.64.0
  (revision 1248). `/opt/google/chrome/chrome` points at that Chromium, so the e2e ran with `PW_CHANNEL=chrome`.
  - `CI=1 PW_CHANNEL=chrome pnpm e2e` (no GPU flags, as on CI): **passed**, 1 test in 1.0 min, and again at
    `194610d`, the last code change (1.1 min).
  - `PW_CHANNEL=chrome pnpm e2e` (the local mode, with the GPU flags): the first visit played through, but the
    test failed on 27 page errors "Instance dropped in popErrorScope". See "Environment notes" below.
- **The four region play-throughs** (`tools/shots/play/regionN.mjs`) against the dev server (`vite` in
  `apps/web`, as `pnpm dev` runs it, on 127.0.0.1:5173). For the play scripts here, `PLAYWRIGHT_BROWSERS_PATH`
  pointed at a scratch folder in which revision 1248 linked to the installed 1243 (no download, nothing
  committed): the "Playwright's own Chromium" path of the new launch options.
  **Final runs, at `3811263`: every room won, no page errors.** Region 1 won all 10 rooms, Region 2 all 9
  (with 4's secret, the Peacekeeper), Region 3 all 11, Region 4 all 11. Regions 1 and 2, which hold the
  doors bug 12 is about, won every room again at `194610d`, the last code change. Before that:
  - Region 1 stopped at 2.2 on its first run (bug 1), then at 2.4 (bug 2), then at 2.4 again on the
    script's 5 s wait for the terminal (`b1e8ddc`). One run was lost to a page reload (below). It won
    all 10 rooms at `cf21eb0`, and again at `3811263`.
  - Region 2 stopped once at 4.3, Region 3 once at 5.2; both passed on the next run (see "Flaky or slow").
  - Region 4 stopped at its first doorway, in 8.1 (bugs 10 and 11, and `3811263`).
- **The game's own playthrough** (`/play?room=prologue&autoplay=1&until=game&speed=16&pace=0.6`), watched in
  Playwright for page errors and console errors until the ending. The first run (at `3811263`) logged
  React's "Maximum update depth exceeded" once, in 4.1 (bug 12), and the container restarted during
  room 19. **The final run, at `194610d`**, went in two parts, as a job here may run for two hours: the
  Prologue to 6.B (28 of the 44 rooms, with the secrets, in 112 minutes, no errors), then 6.B to the
  ending and the last secret (17 rooms, 65 minutes; the ending plays after 9.B, then 9's secret). **No page
  errors, no console errors, and every room won by its own solution** (the playthrough writes a note for
  any room its solution leaves unwon: none).
- **Every room on its own** (`/play?room=<id>&onboarded=1` for all 44 rooms, at `194610d`): **every room
  loaded with no page errors and no console errors.** In each, once loaded: the menu (M) and each of its
  four tabs, the Map (G), the terminal (`) with its "Commands to remember" wherever the room has a
  terminal (from 2.4: nothing to remember in 2.4, which teaches the first command, then one to three),
  and Reset room. All of it worked in every room. Four menu checks failed, slowly, not broken: in 5.1,
  7.1 and 7's secret the menu took about 12 s to appear (the town rooms draw slowest here, before
  Automatic quality has stepped down, and the check allowed 5 s; a probe showed it opening and closing),
  and in 2.4 the gift's lines took the stage 20 s into the room and closed the menu, as they're meant to
  ("The gift takes the stage: whatever panel was open closes").
- **The interface**: the menu (M: Guide, Memory, The palace, Settings), the Map (G, both views, a replay), the
  terminal (`, its "Commands to remember", a command), Reset room after catching a copy, a reload in the middle
  of a room, and a link to a room (`/play/<room>`) followed by a reload, on a production build. **All 24
  checks passed at `194610d`, with no errors**: the menu's tabs and a Guide topic, the palace tab marking
  the room, both views of the Map, the terminal with its reminders and a command, a replay ended by Escape
  (and G opening the Map afterwards), Captures emptied by Reset room, and a reload in 5.2 coming back to
  5.2. On the production build, a link to 1.1 (`/play/f1.two-rooms`), then on to the Prologue from the
  palace tab, then a reload: the address read `/play?…&room=p.first-message` and the landing offered
  "Continue: Wake Up and Say Hello", with no page errors. Earlier runs of these checks found bugs 3, 4, 5
  and 7, and the link check found bug 8.

A note on running them: Vite reloads the page when a file it serves changes, so editing code while a
play-through runs against the same dev server restarts the room under the script (a rerun of Region 1 lost
the Prologue this way, and its result was discarded). The runs above used a separate git worktree, checked
out at the commit under test, with its own dev server; edits went to another.

## Bugs found and fixed

Each with how it showed, the cause, and the commit that fixes it, with its test where one fits. Bugs 2,
3, 5, 7 and 11 live in React components, xterm or the 3D canvas, which the web app's tests (Node, no DOM)
can't reach; the browser checks above cover them instead.

1. **A tip vanished as soon as it came up** (2.2, `f2.wrong-name`). Region 1's first run stopped there: the
   tip about catching (F2-MEM-02) kept mounting and unmounting, and its button was gone before it
   could be clicked (30 s of "element is not attached"). Its rule is momentary (`moving > 0`: a message on a
   cable), and `TipMoments` worked out the due memory afresh on every render, so the line lived only while
   a message crossed. Fix: `memoryNow` keeps a memory that has come up until it has been seen (or another
   plays, or the room is won). `5e5f3d9`, test in `moments.test.ts`.
2. **The terminal never appeared after the gift** (2.4, `f2.lights-out`). Region 1's third run stopped there.
   `Console` was `React.lazy` under `Suspense`; on a slow machine the room re-renders many times a second,
   and React 19 never got round to retrying the suspended boundary, so its empty fallback stayed. Fix: the
   terminal's module is loaded by an effect and the terminal renders once it's there. `f948da2`.
3. **The backtick couldn't close the terminal.** ` opens and closes it (UI-06), but once the terminal had the
   keyboard, xterm typed the ` into the command line and the page never saw it. Fix: xterm hands that key to
   the page. `545f3d0`.
4. **Reset room left old catches in Captures.** After catching a copy and pressing Reset room, the
   network was back as it was but Captures still listed the catch: the store refreshed its list only after a
   catch. Fix: it refreshes after a reset too. `feea54c`, test in `store.test.ts` (new).
5. **A replay outlived the Map.** A replay opened on the Map stayed on after the Map was closed with Escape
   or G (or by the debrief), so the next G, even in the next room, opened the old replay instead of the Map.
   Fix: closing the Map ends the replay. `044952d`.
6. **A room started with the last room's lost-message marks and replay.** Door names repeat between rooms
   (`observatory:eth0` is in most of them), so a mark left in one room showed on a door of the next. Fix:
   loading a room clears marks and the replay. `5b410b5`, test in `store.test.ts`.
7. **Automatic graphics quality didn't take over again.** In Settings, choosing a fixed quality and then
   Automatic left the fixed one in place until a reload. Fix: choosing Automatic hands quality back to the
   game at once (unless `?tier=` pins it). `47e954a`.
8. **A link to a room came back after moving on.** Opened from a link (`/play/<room>`, 0044), the game kept
   that path in the address while the player moved on; only `?room=` changed. A reload then put the linked
   room in the landing's "continue", not the room the player was in (ONB-20). Fix: the address becomes
   `/play?room=<room>` once another room loads, keeping its other options. `cf21eb0`, test in
   `address.test.ts` (new).
9. **Looking around brought hints early.** The hint ladder counts attempts, "a command that changes something,
   or a send" (HELP-09), and skips commands that only look. Its list of those missed forms the shell accepts:
   `bridge link show` (which the Peacekeeper's tip asks for), `ip a`, `ip r`, `ip route get`, `ip help`,
   `ip link help`, a bare `ip`, `bridge` or `lab`, `bridge fdb show dev …`, `lab scanner compare`, `sysctl -a`.
   Each counted as an attempt, and every two made a hint ready. It also took `sysctl key=value`, which writes,
   for a look. Fix: `readOnly` reads a line as the shell does (iproute2's short words, set before show,
   `sudo`, `| grep`). `94766fc`, test in `hints.test.ts` (new).
10. **Automatic quality never stepped down on a machine that draws slowly.** Region 4 stopped at its
    first doorway (8.1), where this machine drew 1.4 to 1.6 frames a second and stayed on the starting
    quality for good. The judge skipped every frame longer than half a second as a hitch, so when every
    frame was that long, nothing was ever judged. Fix: a long frame is a hitch only after quicker ones;
    long frames that keep coming are judged as slow. The judge moved to `render/qualityJudge.ts` as it was,
    apart from that rule, so it can be tested. In 8.1 it now reaches Simple within about 25 s, and (with
    11) the room draws at 3.4 frames a second instead of 1.5. `fc48a22`, test in `qualityJudge.test.ts`
    (new).
11. **Simple quality drew at full resolution.** Found while checking 10: stepping from Low to Simple put
    the canvas back to the screen's full resolution, though both tiers draw at 0.75 of it. The resolution
    was set from inside the canvas only when the scale changed, and the canvas resets its own resolution
    from its props each time it renders again (react-three-fiber's `configure`), which a new tier makes it
    do. The same happened with `?scale=` whenever the canvas rendered again. Fix: the canvas gets the
    resolution as its own prop. `e0cecc2`. There is no unit test: the web app's tests run without a DOM or
    a renderer. Checked in the browser: in 8.1 the renderer keeps a pixel ratio of 0.75 through Medium,
    Low and Simple (it went back to 1 at Simple before).
12. **A door's pile of lost messages swapped on every tick when more than ten fell** (4.1, 2.2, at 4× and
    faster). The first autoplay logged React's "Maximum update depth exceeded" in 4.1, just after the
    winning command, and played on. The scraps on the floor where messages died (`LostPile` in
    `Doorway.tsx`) keep the latest ten, but remembered only the ten they kept. The store's list of marks is
    new on every tick, so with more than ten marks at one door, the ones left out came back as new on every
    tick: the pile swapped between two sets of ten (unmounting and mounting their scraps) and set state each
    time. In the simulator, 4.1's `hall:eth1` gets about 30 marks in the store's 10 s at 16×, and 2.2's
    `kitchen:eth0` about 40. Fix: the pile remembers every mark it has taken while the store still holds
    it. `194610d`, test in `lostPile.test.ts` (new). That this was the warning's cause is
    likely, not proven: the warning came once, and before the fix neither 4.1 alone nor Region 2 from 3.1
    brought it back (React warns after 50 commits in a row whose effects set state, which depends on
    timing). The final autoplay played 4.1 without it.

Besides those, three changes to the play-through scripts: they take `$CHROME` or Playwright's own Chromium
(`bb946e6`, step 2 of the brief); Region 1 waits up to 30 s for the terminal, whose code now loads when
it's first needed (about 4.4 s from the dev server here; `b1e8ddc`); and Region 4 gives each doorway click
15 s instead of 4, as one took 7.8 s here at under two frames a second (the door works; `3811263`).

## Flaky or slow, not bugs

- **Region 3, 5.2 (one run).** The script's `tidy` went to click a discovery card's button just as the
  room's command memory came up. The card waits under it (one thing at a time, by design), and the click
  waited its 30 s for a button that was hidden. The next run passed. A race in the script, not the game.
- **Region 2, 4.3 (one run, before bugs 10 and 11 were fixed).** After the spare cable is plugged in, the
  script waits for 3 s of network time; it took more than its 2 minutes. With the fixes, the same 3 s took
  about 17 s here, and the next run passed. See the note on storms under Open questions.
- **Slow here, scripts given more time:** 2.4's terminal (about 4.4 s to load from the dev server;
  `b1e8ddc`) and Region 4's doorway clicks (7.8 s at 1.5 frames a second; `3811263`).
- **Runs lost to the setup, not the game.** A Region 1 run, when Vite reloaded the page as I edited a file
  it served (the reason for the separate worktree). Regions 2 to 4 of one run, when the dev server reached
  this session's two-hour limit for background jobs (after that, each job started its own server). And
  the first autoplay, when the container restarted while a second browser ran a reproduction beside it
  (after that, one browser at a time).

## Environment notes

- **Drawing in software is slow, and the scripts' clicks show it.** A click takes as long as a few frames:
  about 4 s in most rooms here, 6 to 7 s in the town rooms (Floors 5 to 7), and 8 s in 8.1 before bug 10
  was fixed. In the first seconds of a room, before Automatic quality has stepped down, the menu took
  up to 12 s to appear. None of that is the game misbehaving; on a GPU it's instant.
- **WebGPU in software.** With the GPU flags (`--enable-unsafe-webgpu`, Vulkan) on a machine with no GPU,
  Chrome runs WebGPU on SwiftShader. Then three.js 0.186.1 leaves rejections unhandled when the GPU device goes
  away while pipelines compile (`WebGPUPipelineUtils.js`: `device.popErrorScope().then(...)` has no `catch`),
  and the e2e test counts them as page errors ("Instance dropped in popErrorScope", on the reload). A run on
  the dev server in the same mode also ended in a flood of `createBuffer ... too large for the implementation
  when mappedAtCreation == true` after a reload. Neither happens without the GPU flags (WebGL2), and I couldn't
  check a real GPU here. Not changed.

## Open questions (not changed)

Things that look like design questions, or that weren't mine to change in a bug pass.

- **Does Reset room restart the hint clock?** `startedAt` is documented as "when the room was loaded or
  reset" (`engine/store.ts`), but Reset room doesn't move it. So after a reset, hints keep counting from
  the first load, and so do the tips and discovery cards that start over "on a new visit".
  Either the comment or `reset()` is wrong; which one is a design call.
- **Lost-message marks after Reset room** stay until they fade (`MARK_MS`, 10 s), on a network that's
  back as it was. Loading a room now clears them (bug 6); reset was left as it is.
- **Do failed commands count as attempts?** A command that fails still counts towards the next hint when
  it tried to change something (`ip link st eth0 up`), as before; only commands that look are left out
  now (bug 9). HELP-09 doesn't say.
- **Storm rooms on slow machines.** In 4.3, with the spare plugged in and time at 16×, network time ran at
  about 0.18 of real time on this machine (the clock's floor in a crowd is a quarter of the speed, 4×
  here). The clock waits for the simulator's last step before asking for the next, and here the
  simulator and software drawing share four cores. A room still finishes, slowly; on such a machine a
  storm can look frozen.
- **Command reminders know only some of `ip`'s short words** (`reminders.ts`: `a`, `r`, `l`, `n` and the
  full words, `ro`). The shell takes any start of a word (`ip ad`, `ip li`, `ip ne`), and those uses don't
  count towards learning the command. Minor.
- **The menu's Keyring tab** has its text (`voice.menu.tabs.keys`) but isn't among the menu's tabs.
- **`packages/content/src/floors.ts` marks Floors 3 to 9 `planned: true`**, though they're built;
  nothing reads the flag.
- **Three secret rooms have no play-through script** (2's `f2.secret-48-bits`, 7's `f7.secret-binary`, 9's
  `f9.secret-home-router`). The game's own autoplay plays them (see "What I ran").
- **Leftovers in `tools/shots/play`**: four stray screenshots committed as `undefined-*.png`
  (`memories.mjs` once ran without a folder; it now uses the system's temp folder), and Regions 2 to 4
  still save debugging screenshots under a temporary folder from someone's own machine (harmless:
  Playwright creates it).
