// Shared helpers for the play scripts: a browser like a player's, rooms opened with onboarding
// already seen, overlays (cards, memories, lines) taken as they come, and a win check.
import { chromium } from "playwright-core";

/**
 * Which browser plays: $CHROME if it's set (a Chrome of your own, drawing on the GPU with WebGPU),
 * else Playwright's own Chromium (`pnpm --filter @wirelight/web exec playwright install chromium`).
 * That one usually has no GPU to use, so it gets none of the GPU flags: it draws in software, and the
 * game falls back to WebGL2 by itself.
 */
export function browserOptions() {
  const chrome = process.env.CHROME;
  if (!chrome) return {};
  return {
    executablePath: chrome,
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
  };
}

export async function launch() {
  const browser = await chromium.launch(browserOptions());
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return { browser, page, errors };
}

/**
 * Takes whatever is waiting on screen: spoken lines (memories, arrivals, boss introductions),
 * discovery cards. A memory's action prompt never blocks a click.
 */
export async function tidy(p) {
  const visible = (selector) =>
    p
      .locator(selector)
      .first()
      .isVisible()
      .catch(() => false);
  for (let k = 0; k < 12; k++) {
    if (await visible(".memory")) await p.click(".memory .memory-head .quiet");
    else if (await visible(".lines")) await p.click(".lines:visible button");
    else if (await visible(".map")) await p.click(".map:visible .quiet");
    else if (await visible(".path-choice")) await p.click(".path-choice:visible [data-suggested='yes']");
    // A room's command memory (CMD-02…11): read through to its end.
    else if (await visible(".cmd-memory")) await p.click(".cmd-memory:visible .panel-actions button");
    else if (await visible(".discovery")) await p.click(".discovery:visible .panel-actions button:not(.quiet)");
    else return;
    await p.waitForTimeout(120);
  }
}

export async function open(p, base, room, ready = ".plate") {
  // Production always starts at the landing. A room link uses `/play/<room>` and its main button;
  // the old query-string shortcut works only on the dev server.
  await p.goto(`${base.replace(/\/$/, "")}/${room}`);
  const skip = p.getByRole("button", { name: /Skip intro/ });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  // Attached, not visible: the room's labels step aside while something holds the centre (a memory).
  await p.waitForSelector(ready, { state: "attached", timeout: 20000 });
  await p.waitForTimeout(2000);
  await tidy(p);
  // A command memory plays once the room has settled (CommandMemory.tsx): take it too.
  if (await p.waitForSelector(".cmd-memory", { timeout: 4000 }).catch(() => null)) await tidy(p);
}

export async function won(p, name) {
  // Production builds omit the dev-only store hook. The last boss opens its floor memory over the debrief.
  const ok = await p
    .waitForFunction(
      () => {
        const visible = (selector) => {
          const element = document.querySelector(selector);
          return !!element && element.getClientRects().length > 0;
        };
        return visible(".debrief") || visible(".memory");
      },
      null,
      { timeout: 120000 },
    )
    .then(() => true)
    .catch(() => false);
  console.log(name, ok ? "won" : "NOT WON");
  return ok;
}

export async function type(p, line) {
  await tidy(p);
  if (!(await p.$(".console"))) {
    await p.keyboard.press("`");
    await p.waitForSelector(".console .console-term", { timeout: 10000 });
  }
  if (await p.$('.console[data-open="no"]')) {
    await p.click(".console-bar");
    await p.waitForTimeout(350);
  }
  await p.click(".console-term");
  await p.keyboard.type(line);
  await p.keyboard.press("Enter");
  await p.waitForTimeout(400);
  await waitPrompt(p);
}

/**
 * Waits until the console's last line is a bare prompt again: a command that keeps running (ping,
 * dhclient, tcpdump) holds the prompt until it ends, and messages crossing are shown slowed (CORE-14).
 */
export async function waitPrompt(p, timeout = 180000) {
  await p.waitForFunction(
    () => {
      const rows = [...document.querySelectorAll(".xterm-rows > div")].map((d) => d.textContent ?? "");
      const last = rows.filter((t) => t.trim()).at(-1) ?? "";
      return /:~# *$/.test(last);
    },
    null,
    { timeout },
  );
}

export async function bench(p, to, door) {
  await tidy(p);
  await p.click("text=Frame builder");
  await p.waitForTimeout(300);
  await p.fill(".panel input >> nth=0", to);
  if (door) await p.selectOption(".panel select", door);
  await p.click("text=Send once");
  await p.waitForTimeout(600);
}

export async function card(p, to, n = 0) {
  await tidy(p);
  await p.getByRole("button", { name: "Frame builder" }).click();
  await p.waitForTimeout(300);
  await p.fill(".frame-builder-panel input >> nth=0", to);
  await p.getByRole("button", { name: "Keep sending" }).click();
  await p.waitForTimeout(500);
}

export async function plateSwitch(p, nth = 0) {
  await tidy(p);
  await p.click(`.plate-open >> nth=${nth}`);
  await p.waitForTimeout(400);
  await p.click(".panel-actions button:first-child");
  await p.waitForTimeout(700);
}

/** Slides the console down (a player does, to reach things it covers). */
/** After a doorway click: waits until the player stands in `to`'s room (the glide along the corridor
 * and the arrival veil are over, 0081). */
export async function arrived(p, to) {
  await p.waitForFunction((d) => document.querySelector(".mini-map-here")?.textContent?.includes(d) ?? false, to, {
    timeout: 20000,
    polling: 100,
  });
  await p.waitForTimeout(900);
}

export async function closeConsole(p) {
  if (await p.$('.console[data-open="yes"]')) {
    await p.click(".console-bar");
    await p.waitForTimeout(300);
  }
}
