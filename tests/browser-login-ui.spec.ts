import { expect, test } from "@playwright/test";

test("manual login guides the close/check handoff and does not start an application", async ({ page, baseURL }) => {
  test.skip(!baseURL, "Needs the isolated UI server.");
  let status = { open: false, linkedin: false, manualOpen: false, manualPending: false };
  const actions: string[] = [];
  let applications = 0;
  page.on("request", request => { if (request.url().endsWith("/api/applications") && request.method() === "POST") applications++; });
  await page.route("**/api/browser", async route => {
    if (route.request().method() === "POST") {
      const action = route.request().postDataJSON().action;
      actions.push(action);
      if (action === "linkedin-login") status = { open: false, linkedin: false, manualOpen: true, manualPending: true };
      if (action === "check-login") status = { open: true, linkedin: true, manualOpen: false, manualPending: false };
    }
    await route.fulfill({ json: status });
  });
  await page.goto("/app");
  await page.getByRole("button", { name: "连接 LinkedIn", exact: true }).click();
  const panel = page.locator("#browser-login");
  await panel.getByRole("button", { name: "打开登录窗口", exact: true }).click();
  await expect(panel.getByRole("button", { name: "已关闭窗口，检查登录" })).toBeDisabled();
  await page.reload();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "打开登录窗口", exact: true })).toBeDisabled();
  status.manualOpen = false;
  await expect(panel.getByText("窗口已关闭，可以检查", { exact: true })).toBeVisible({ timeout: 8000 });
  // Closing the browser is not itself evidence of a successful login.
  await expect(page.getByRole("button", { name: "LinkedIn 已连接 · 管理" })).toHaveCount(0);
  await panel.getByRole("button", { name: "已关闭窗口，检查登录" }).click();
  await expect(page.getByRole("button", { name: "LinkedIn 已连接 · 管理" })).toBeVisible();
  expect(actions).toEqual(["linkedin-login", "check-login"]);
  expect(applications).toBe(0);
});

test("login errors stay actionable and an absent LinkedIn session is not called connected", async ({ page, baseURL }) => {
  test.skip(!baseURL, "Needs the isolated UI server.");
  await page.route("**/api/browser", async route => {
    if (route.request().method() === "POST" && route.request().postDataJSON().action === "linkedin-login") {
      await route.fulfill({ status: 409, json: { error: "请先完成或停止当前投递任务。" } });
    } else await route.fulfill({ json: { open: false, linkedin: false, manualOpen: false, manualPending: false } });
  });
  await page.goto("/app");
  await page.getByRole("button", { name: "连接 LinkedIn", exact: true }).click();
  const panel = page.locator("#browser-login");
  await panel.getByRole("button", { name: "打开登录窗口", exact: true }).click();
  await expect(panel.getByText("请先完成或停止当前投递任务。", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "已关闭窗口，检查登录" }).click();
  await expect(panel.getByText(/没有检测到 LinkedIn 登录凭据/)).toBeVisible();
  await expect(page.getByRole("button", { name: "LinkedIn 已连接 · 管理" })).toHaveCount(0);
});
