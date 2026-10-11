# _reference (temporary)

Working code from the earlier 2D build, kept only as a starting point for B1. None of it is compiled, linted or tested.

- `web/src/game/`: presentation clock (time dilation, slow-down while aiming), packets in motion from the trace, discovery-card and hint timing, IndexedDB saves, progress shape, and parts of the store (see the note at the top of `store.ts`).
- `web/src/console/Console.tsx`: the xterm.js console reading the trace (line editing, history, `↳` click echo, lab colour, subtitles).
- `web/src/intro/state.ts`: the intro state machine and what's been seen.
- `web/src/ui/keys.tsx`: `[[Esc]]` → key caps.
- `web/e2e/smoke.spec.ts`, `web/playwright.config.ts`: the end-to-end flow (selectors change with the new UI).
- `web/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `favicon.svg`: the old web app's setup.

Move what's useful into `apps/web` during B1, then **delete this folder**.
