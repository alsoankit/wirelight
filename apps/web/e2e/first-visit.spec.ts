import { expect, type Page, test } from "@playwright/test";

// The first visit, as a new player, on the production build (gameplay/onboarding.md): the landing,
// the descent, the gift of sight, the path, the tour, the Prologue won by pressing Send, then on into
// Floor 1 and its first room won by walking to lantern's room and reading its plate. A reload then
// goes on from there: Continue opens the next room on the path (ONB-20).

/** Takes whatever waits on screen: spoken lines, discovery cards. */
async function tidy(page: Page) {
  for (let i = 0; i < 12; i++) {
    if (await page.locator(".lines").isVisible()) await page.locator(".lines button").click();
    else if (await page.locator(".discovery").isVisible())
      await page.locator(".discovery .panel-actions button:not(.quiet)").click();
    else return;
  }
}

test("a first visit reaches Floor 1 and wins its first room", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // CI has no GPU: software drawing is slow, so it plays on the simplest graphics (the tier the game's
  // own auto quality would settle on there), drawn at 40% of the screen's resolution (time grows with
  // the pixels), at most 6 frames a second (each drawn frame takes about half a second there, and
  // clicks wait for a button to hold still over two frames). The game logic under test is the same.
  await page.goto(process.env.CI ? "/?tier=simple&scale=0.4&fps=6" : "/");
  await page
    .getByRole("button", { name: /Enter the palace/ })
    .first()
    .click();

  // The gift of sight: the moss spirit's lines, until the path choice comes. Not "while a line shows":
  // between one line and the next nothing shows for a moment, and a slow machine can land in that gap.
  await expect(page.locator(".lines")).toBeVisible({ timeout: 60_000 });
  const path = page.locator(".path-options button").first();
  await expect(async () => {
    if (await page.locator(".lines").isVisible()) await page.locator(".lines button").click();
    await expect(path).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 120_000 });

  // The path, then the tour.
  await path.click();
  for (let i = 0; i < 5; i++) await page.locator(".tour-card .panel-actions button:not(.quiet)").click();
  await tidy(page);

  // The Prologue: Send, and the answer comes back.
  await page.locator(".send").click();
  await expect(page.locator(".debrief")).toBeVisible({ timeout: 90_000 });
  await page.locator(".debrief .panel-actions button").last().click();

  // 1.1: walk to lantern's room and read its plate.
  await expect(page.locator(".room-title")).toHaveText("Two Rooms, One Cable");
  await tidy(page);
  await page.getByRole("button", { name: /lantern's room/ }).click();
  await tidy(page);
  await page.locator("button.plate").first().click();
  await expect(page.locator(".debrief")).toBeVisible({ timeout: 90_000 });

  // Back later: the game goes on with the next room, with nothing from the first visit again.
  await page.reload();
  await page
    .getByRole("button", { name: /Continue/ })
    .first()
    .click();
  await expect(page.locator(".room-title")).toHaveText("The Loose Cable", { timeout: 60_000 });
  await expect(page.locator(".path-choice, .tour-card")).toHaveCount(0);

  expect(errors).toEqual([]);
});
