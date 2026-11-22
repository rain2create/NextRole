import { expect, test, type Page } from "@playwright/test";

async function workspace(page: Page, options: { resume?: boolean; ai?: boolean } = {}) {
  const starts: Record<string, unknown>[] = [];
  let hasResume = options.resume !== false;
  let originalId = "test-original";
  let versions = hasResume ? [{ id: originalId, label: "Original fixture", kind: "original", createdAt: "2026-11-22T00:00:00Z" }] : [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/profile") json = {
      profile: {
        resume: !hasResume ? null : {
          name: "Test Candidate", headline: "Engineer", summary: "Synthetic fixture",
          contact: { email: "test@example.com", phone: "", location: "", linkedin: "", github: "", website: "" },
          skills: [], experience: [], education: [], projects: [], certifications: [], achievements: [],
        },
        originalResumeId: hasResume ? originalId : null,
        preferences: {}, answers: [], resumeText: "Synthetic fixture", updatedAt: "2026-11-22T00:00:00Z",
      },
      versions, translationDrafts: [],
      ai: { configured: options.ai !== false, keyKind: "application", issue: null, model: "test", webSearch: false },
    };
    else if (path === "/api/resume" && route.request().method() === "POST") {
      expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
      hasResume = true;
      originalId = "test-uploaded";
      versions = [{ id: originalId, label: "Uploaded fixture", kind: "original", createdAt: "2026-11-22T00:00:00Z" }];
      json = { version: versions[0] };
    }
    else if (path.startsWith("/api/resume/") && route.request().method() === "DELETE") {
      const id = path.split("/").pop();
      versions = versions.filter(v => v.id !== id);
      if (originalId === id) hasResume = false;
      json = { removed: true };
    }
    else if (path === "/api/autopilot") {
      if (route.request().method() === "POST") {
        const input = route.request().postDataJSON();
        starts.push(input);
        json = { autopilot: { id: "mock-run", status: "done", input, items: [], log: [] } };
      } else json = { autopilot: null };
    }
    else if (path === "/api/applications") json = { applications: [] };
    else if (path === "/api/browser") json = { open: false, linkedin: false };
    else if (path === "/api/job-feedback") json = { feedback: [], savedJobs: [] };
    else if (path === "/api/jobs/feedback") json = { entries: [] };
    else if (path === "/api/email") json = { jobs: [], versions: [], runs: [], configured: false };
    await route.fulfill({ json });
  });
  await page.goto("/app");
  await page.getByRole("tab", { name: "自动投递" }).click();
  await expect(page.locator("#autopilot")).toContainText(options.resume === false ? "请先上传简历" : "简历已上传");
  return starts;
}

test("uploaded resume can start after selecting direction inside Autopilot", async ({ page, baseURL }) => {
  test.skip(!baseURL, "Needs the isolated UI server.");
  const starts = await workspace(page);
  const start = page.getByRole("button", { name: "开始自动投递", exact: true });
  await expect(start).toBeDisabled();
  await expect(page.locator("#autopilot-readiness")).toContainText("填写目标岗位");
  await page.getByLabel("目标岗位", { exact: true }).fill("算法工程师");
  await expect(start).toBeDisabled();
  await expect(page.locator("#autopilot-readiness")).toContainText("简历修改方向");
  await page.getByLabel("自动投递的简历修改方向", { exact: true }).selectOption("general");
  await expect(page.getByLabel("修改方向", { exact: true })).toHaveValue("general");
  await expect(start).toBeEnabled();
  await expect(page.getByRole("button", { name: "企业招聘官网", exact: true })).toBeDisabled();
  await start.click();
  await expect.poll(() => starts.length).toBe(1);
  expect(starts[0]).toMatchObject({ query: "算法工程师", direction: "general", tailor: true, autoSubmit: false, sources: { linkedin: true, web: false } });
});

test("Autopilot upload updates the shared resume and removal resets readiness after refresh", async ({ page, baseURL }) => {
  test.skip(!baseURL, "Needs the isolated UI server.");
  await workspace(page, { resume: false });
  const picker = page.waitForEvent("filechooser");
  await page.locator("#autopilot").getByRole("button", { name: "上传简历", exact: true }).click();
  await (await picker).setFiles({ name: "sample.pdf", mimeType: "application/pdf", buffer: Buffer.from("synthetic upload; parsing mocked") });
  await expect(page.locator("#autopilot")).toContainText("简历已上传");
  await expect(page.locator("#resume").getByRole("heading", { name: "Test Candidate", exact: true })).toBeVisible();
  const version = page.getByTestId("resume-version-test-uploaded");
  await expect(version).toContainText("Uploaded fixture");
  await expect(version).toContainText("当前使用");
  await page.getByLabel("目标岗位", { exact: true }).fill("Engineer");
  await page.getByRole("checkbox", { name: /为每个岗位定制简历/ }).uncheck();
  await expect(page.getByRole("button", { name: "开始自动投递", exact: true })).toBeEnabled();
  page.once("dialog", dialog => dialog.dismiss());
  await version.getByRole("button", { name: "移除 Uploaded fixture", exact: true }).click();
  await expect(version).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await version.getByRole("button", { name: "移除 Uploaded fixture", exact: true }).click();
  await expect(version).toHaveCount(0);
  await expect(page.locator("#autopilot-readiness")).toContainText("上传并解析简历");
  await expect(page.getByRole("button", { name: "开始自动投递", exact: true })).toBeDisabled();
  await page.reload();
  await page.getByRole("tab", { name: "自动投递" }).click();
  await expect(page.locator("#autopilot").getByRole("button", { name: "上传简历", exact: true })).toBeVisible();
  await expect(page.getByTestId("resume-version-test-uploaded")).toHaveCount(0);
});

test("original resume mode needs no direction but still requires a usable source", async ({ page, baseURL }) => {
  test.skip(!baseURL, "Needs the isolated UI server.");
  const starts = await workspace(page);
  await page.getByLabel("目标岗位", { exact: true }).fill("Engineer");
  await page.getByRole("checkbox", { name: /为每个岗位定制简历/ }).uncheck();
  const start = page.getByRole("button", { name: "开始自动投递", exact: true });
  await expect(start).toBeEnabled();
  await page.getByRole("button", { name: "LinkedIn", exact: true }).click();
  await expect(start).toBeDisabled();
  await expect(page.locator("#autopilot-readiness")).toContainText("至少选择一个可用的职位来源");
  await page.getByRole("button", { name: "LinkedIn", exact: true }).click();
  await start.click();
  await expect.poll(() => starts.length).toBe(1);
  expect(starts[0]).toMatchObject({ tailor: false, autoSubmit: false });
  expect(starts[0]).not.toHaveProperty("direction");
});

test("missing resume and model are explained beside the disabled start button", async ({ page, baseURL }) => {
  test.skip(!baseURL, "Needs the isolated UI server.");
  await workspace(page, { resume: false, ai: false });
  await page.getByLabel("目标岗位", { exact: true }).fill("Engineer");
  await page.getByRole("checkbox", { name: /为每个岗位定制简历/ }).uncheck();
  await expect(page.getByRole("button", { name: "开始自动投递", exact: true })).toBeDisabled();
  await expect(page.locator("#autopilot-readiness")).toContainText("上传并解析简历");
  await expect(page.locator("#autopilot-readiness")).toContainText("配置可用的模型密钥");
});

test("Chinese navigation and Search upload remain usable on a narrow screen", async ({ page, baseURL }) => {
  test.skip(!baseURL, "Needs the isolated UI server.");
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await workspace(page, { resume: false });
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.getByRole("tab", { name: "搜索并挑选岗位" }).click();
  const picker = page.waitForEvent("filechooser");
  await page.locator("#search").getByRole("button", { name: "上传简历", exact: true }).click();
  await (await picker).setFiles({ name: "sample.pdf", mimeType: "application/pdf", buffer: Buffer.from("synthetic fixture") });
  await expect(page.locator("#search").getByRole("button", { name: "更换简历", exact: true })).toBeVisible();
  await expect(page.getByTestId("resume-version-test-uploaded")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "邮件投递" }).click();
  await expect(page).toHaveURL(/\/app\/email$/);
  await expect(page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "邮件投递" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "保存草稿", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
