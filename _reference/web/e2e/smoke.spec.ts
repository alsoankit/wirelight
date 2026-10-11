import { expect, type Page, test } from "@playwright/test";

/** From the title screen straight into the Observatory, accepting the Seer's gift on the way. */
async function enter(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip intro" }).click();
  await page.getByRole("button", { name: "Accept the sight" }).click();
}

/** ARCH-14 smoke: load, play the Prologue, reach room 0.1, win it, see the console echo. */
test("a fresh visitor plays from the first screen through 0.1's door opening", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Wirelight" })).toBeVisible();
  await page.getByRole("button", { name: "Skip intro" }).click();
  // Skip intro never skips the Seer's gift for a new player.
  await expect(page.getByRole("dialog", { name: "The Seer's sight" })).toBeVisible();
  await page.getByRole("button", { name: "Accept the sight" }).click();
  await expect(page.getByRole("heading", { name: "The First Message" })).toBeVisible();

  // Pressing Send opens the Glass so you watch the message travel.
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Scrying Glass" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Debrief" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "First Light" })).toBeVisible();
  await expect(page).toHaveURL(/\/floor\/0\/room\/f0\.r1-first-light$/);

  // Read the neighbor's plate.
  await page.getByRole("button", { name: "Walk through door eth0" }).click();
  await page.getByRole("button", { name: "Into lantern's room" }).click();
  await page.getByRole("button", { name: "Plate of door eth0" }).click();
  await expect(page.getByText("02:00:00:00:00:07")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("1");
  await page.keyboard.press("ArrowRight");

  // Send from the workbench; the console echoes the real command.
  await page.getByRole("button", { name: "Workbench" }).click();
  await page.getByRole("textbox").first().fill("02:00:00:00:00:07");
  await page.getByRole("button", { name: "Seal and send" }).click();
  // The bench collapses on send so the journey is visible (D17).
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // ...and keeps what you wrote.
  await page.getByRole("button", { name: "Workbench" }).click();
  await expect(page.getByRole("textbox").first()).toHaveValue("02:00:00:00:00:07");
  await page.keyboard.press("Escape");
  await page.keyboard.press("`");
  await expect(page.locator(".xterm-rows")).toContainText("lab send-frame --to 02:00:00:00:00:07");

  await expect(page.getByRole("dialog", { name: "Debrief" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("dialog", { name: "Debrief" })).toContainText("MAC address");
  expect(errors).toEqual([]);
});

test("deep links skip the title and go to the furthest available room", async ({ page }) => {
  await page.goto("/floor/0/room/f0.r1-first-light");
  await expect(page.getByRole("heading", { name: "Wirelight" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "The First Message" })).toBeVisible();
});

test("the tour, 'Don't show this again', and the Seer's gift are each remembered", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the dungeon" }).click();
  const tour = page.getByRole("dialog", { name: "Before you go in" });
  await expect(tour).toContainText("Welcome to Wirelight");
  for (let i = 0; i < 4; i++) await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toContainText("The menu");
  await tour.getByLabel("Don't show this again").check();
  // The last card can open the full Field Guide; the Seer's gift still comes first.
  await tour.getByRole("button", { name: "View full Field Guide" }).click();
  await page.getByRole("button", { name: "Accept the sight" }).click();
  await expect(page.getByRole("navigation", { name: "Menu" })).toContainText("Welcome to the dungeon");
  await page.keyboard.press("Escape");

  // Second visit: the title is still the front door, but nothing else stands in the way.
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the dungeon" }).click();
  await expect(page.getByRole("heading", { name: "The First Message" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the menu opens with M: Field Guide first, then the dungeon", async ({ page }) => {
  await enter(page);
  await page.keyboard.press("m");
  const menu = page.getByRole("navigation", { name: "Menu" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button").first()).toContainText("Field Guide");
  await expect(menu).toContainText("The First Message");
  await expect(menu).toContainText("Floor 0 · The Wire");
  // Topics about objects wait for the room where you meet them (P-9).
  await menu.getByRole("button", { name: /^Field Guide/ }).click();
  await expect(menu).toContainText("The Scrying Glass");
  await expect(menu).not.toContainText("Doors and plates");
  // Topics come with a picture drawn from the game's own art.
  await menu.getByRole("button", { name: /^How a room is laid out/ }).click();
  await expect(menu.getByRole("img", { name: "A sample room" })).toBeVisible();
  await expect(menu).toContainText("A plate beside every door");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});
