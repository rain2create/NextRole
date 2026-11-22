import { expect, test } from "@playwright/test";

test("appearance persists across refresh and pages, with keyboard dismissal", async ({ page, baseURL }) => {
  test.skip(!baseURL, "Needs the isolated UI server.");
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/app");
  await page.getByLabel("外观设置").click();
  await page.getByRole("radio", { name: /雾紫云朵/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-style", "lilac");
  await page.getByRole("switch", { name: "柔态动效" }).uncheck();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("外观设置")).toBeFocused();
  await expect(page.locator(".appearance-menu")).not.toHaveAttribute("open");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-style", "lilac");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "申请管理" }).click();
  await expect(page).toHaveURL(/\/app\/tracking(?:\?|$)/);
  await page.getByLabel("外观设置").click();
  await expect(page.getByRole("radio", { name: /雾紫云朵/ })).toBeChecked();
  await expect(page.getByRole("switch", { name: "柔态动效" })).not.toBeChecked();
  await page.getByRole("radio", { name: /清透留白/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-style", "clear");
  await page.getByRole("heading", { name: "申请管理", exact: true }).click();
  await expect(page.locator(".appearance-menu")).not.toHaveAttribute("open");
  expect(errors).toEqual([]);
});

test("background brush leaves a relaxing surface fold, never draws over controls, and honours reduced motion", async ({ page, baseURL }) => {
  test.skip(!baseURL, "Needs the isolated UI server.");
  await page.goto("/app");
  const canvas = page.locator(".ambient-surface");
  await expect(canvas).toHaveAttribute("data-reactive", "true");
  const paint = () => canvas.evaluate(el => {
    const canvas = el as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let amount = 0;
    for (let i = 3; i < pixels.length; i += 4) amount += pixels[i];
    return amount;
  });
  await page.mouse.move(25, 180);
  await page.mouse.move(25, 450, { steps: 20 });
  await expect.poll(paint).toBeGreaterThan(0);
  // The field remains fixed in the page; there is no following cursor decoration.
  await expect(canvas).toHaveCSS("transform", "none");
  await expect(page.locator(".cursor-glow")).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-state", "idle", { timeout: 6000 });
  expect(await paint()).toBe(0);
  const field = await page.getByLabel("目标岗位", { exact: true }).boundingBox();
  await page.mouse.move(field!.x + 15, field!.y + 15);
  await page.mouse.move(field!.x + 120, field!.y + 15, { steps: 10 });
  expect(await paint()).toBe(0);
  await page.getByLabel("目标岗位", { exact: true }).fill("算法工程师");
  await expect(page.getByLabel("目标岗位", { exact: true })).toHaveValue("算法工程师");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(canvas).toHaveAttribute("data-reactive", "false");
  await expect(canvas).toBeHidden();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(canvas).toHaveAttribute("data-reactive", "true");
  await page.getByLabel("外观设置").click();
  await page.getByRole("switch", { name: "柔态动效" }).uncheck();
  await expect(canvas).toHaveAttribute("data-reactive", "false");
  expect(await paint()).toBe(0);
  await expect(page.locator(".journey-emblem")).toHaveCSS("animation-name", "none");
});

test("hero cards float and orbits turn, pausing offscreen and with reduced motion", async ({ page, baseURL }) => {
  test.skip(!baseURL, "Needs the isolated UI server.");
  await page.goto("/app");
  const art = page.locator(".journey-art"), emblem = page.locator(".journey-emblem"), orbit = page.locator(".journey-orbit-one");
  await expect(art).toHaveAttribute("data-paused", "false");
  const initial = await emblem.evaluate(el => getComputedStyle(el).translate);
  await expect.poll(() => emblem.evaluate(el => getComputedStyle(el).translate)).not.toBe(initial);
  const angle = await orbit.evaluate(el => getComputedStyle(el).rotate);
  await expect.poll(() => orbit.evaluate(el => getComputedStyle(el).rotate)).not.toBe(angle);
  await page.locator("#history").scrollIntoViewIfNeeded();
  await expect(art).toHaveAttribute("data-paused", "true");
  await expect(emblem).toHaveCSS("animation-play-state", "paused");
  await page.locator(".workspace-heading").scrollIntoViewIfNeeded();
  await expect(art).toHaveAttribute("data-paused", "false");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(emblem).toHaveCSS("animation-name", "none");
  await expect(orbit).toHaveCSS("animation-name", "none");
});

test("touch devices have a static backdrop and can select all styles without overflow", async ({ browser, baseURL }) => {
  test.skip(!baseURL, "Needs the isolated UI server.");
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.goto("/app");
    await expect(page.locator(".ambient-surface")).toHaveAttribute("data-reactive", "false");
    await page.getByLabel("外观设置").click();
    for (const name of [/雾紫云朵/, /清透留白/, /薄荷轻柔/]) {
      await page.getByRole("radio", { name }).check();
      await expect(page.getByRole("radio", { name })).toBeChecked();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  } finally { await context.close(); }
});

test("invalid or blocked local storage does not break style selection", async ({ page, baseURL }) => {
  test.skip(!baseURL, "Needs the isolated UI server.");
  await page.addInitScript(() => localStorage.setItem("nextrole-appearance", "{broken json"));
  await page.goto("/app");
  await expect(page.locator("html")).toHaveAttribute("data-style", "mint");
  await page.evaluate(() => {
    Storage.prototype.getItem = () => { throw new Error("Storage blocked"); };
    Storage.prototype.setItem = () => { throw new Error("Storage blocked"); };
  });
  await page.getByLabel("外观设置").click();
  await page.getByRole("radio", { name: /雾紫云朵/ }).check();
  await expect(page.locator("html")).toHaveAttribute("data-style", "lilac");
});
