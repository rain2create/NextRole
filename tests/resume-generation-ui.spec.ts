import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { Job, Profile, ResumeData, ResumeTranslationDraft, ResumeVersion } from "../lib/types";

const appUrl = process.env.ROLEFLOW_UI_TEST_URL;
test.skip(!appUrl, "Set ROLEFLOW_UI_TEST_URL to run browser integration checks against a local app.");

const resume: ResumeData = {
  name: "张明", headline: "后端开发工程师", summary: "参与支付系统开发与数据库性能优化。",
  contact: { email: "zhangming@example.com", phone: "13800000000", location: "北京", linkedin: "", github: "", website: "" },
  skills: [{ category: "技术技能", items: ["Java", "数据库优化", "分布式系统"] }],
  experience: [{ company: "示例科技有限公司", title: "后端开发工程师", location: "北京", start: "2022年7月", end: "至今", bullets: ["参与支付系统接口开发与数据库优化。"] }],
  projects: [], education: [{ school: "示例大学", degree: "本科", field: "计算机科学", start: "2018年", end: "2022年", details: [] }],
  certifications: [], achievements: [],
};
const jobs: Job[] = [
  { id: "jd-ready", source: "web", title: "支付后端工程师", company: "示例企业", location: "北京", url: "https://example.com/jobs/payment", applyUrl: "https://example.com/jobs/payment", description: "负责支付接口开发，需要 Java、数据库优化经验。", fetchedAt: "2026-11-21T00:00:00.000Z" },
  { id: "jd-empty", source: "web", title: "待补充描述岗位", company: "示例企业", location: "上海", url: "https://example.com/jobs/empty", applyUrl: "https://example.com/jobs/empty", description: "", fetchedAt: "2026-11-21T00:00:00.000Z" },
];

async function mockWorkspace(page: Page, options: { hasResume?: boolean; versions?: ResumeVersion[]; translationDrafts?: ResumeTranslationDraft[]; reviewRequired?: boolean; confirmationFailures?: number; englishJd?: boolean } = {}) {
  const profile: Profile = {
    resume: options.hasResume === false ? null : structuredClone(resume), resumeText: "张明，后端开发工程师，参与支付系统开发与数据库优化。",
    originalResumeId: options.hasResume === false ? null : "original-current", baseResumeId: null,
    preferences: { workAuthorization: "中国公民", requiresSponsorship: "否", noticePeriod: "30天", currentCompensation: "", expectedCompensation: "面议", willingToRelocate: "北京", yearsOfExperience: "4", pronouns: "", demographics: "Decline to self-identify", extraNotes: "" },
    answers: [], updatedAt: "2026-11-21T00:00:00.000Z",
  };
  const versions: ResumeVersion[] = options.versions ? [...options.versions] : [];
  const availableJobs = structuredClone(jobs);
  if (options.englishJd) availableJobs[0].description = "Responsibilities: build reliable payment services and design database schemas. Requirements: strong Java development experience, SQL performance tuning and cross-functional collaboration.";
  const translationDrafts: ResumeTranslationDraft[] = options.translationDrafts ? structuredClone(options.translationDrafts) : [];
  const generatedRequests: Record<string, unknown>[] = [];
  const textRequests: Record<string, unknown>[] = [];
  const confirmationRequests: Record<string, unknown>[] = [];
  let confirmationFailures = options.confirmationFailures ?? 0;
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;
    const respond = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/api/profile" && req.method() === "GET") return respond({ profile, versions, translationDrafts, ai: { configured: true, keyKind: "application", issue: null, webSearch: false, model: "test-model", agentModel: "test-model" } });
    if (pathname === "/api/applications" && req.method() === "GET") return respond({ applications: [] });
    if (pathname === "/api/browser" && req.method() === "GET") return respond({ open: false, linkedin: false });
    if (pathname === "/api/autopilot" && req.method() === "GET") return respond({ autopilot: null });
    if (pathname === "/api/jobs/discover") return respond({ jobs: availableJobs, errors: [] });
    if (pathname === "/api/job-feedback") return respond({ feedback: [], savedJobs: [] });
    if (pathname === "/api/jobs/feedback") return respond({ entries: [] });
    if (pathname === "/api/resume" && req.method() === "POST") {
      textRequests.push(req.postDataJSON());
      profile.resume = structuredClone(resume);
      profile.originalResumeId = "original-current";
      return respond({ profile, version: { id: "original-current", kind: "original", label: "文本简历", fileName: "original.pdf", mimeType: "application/pdf", createdAt: profile.updatedAt } });
    }
    if (pathname === "/api/resume/generate") {
      const input = req.postDataJSON();
      generatedRequests.push(input);
      const outputLanguage = input.mode === "job" ? options.englishJd ? "en" : "zh-CN" : input.direction === "foreign_company" ? "en" : "zh-CN";
      if (outputLanguage === "en" && options.reviewRequired) {
        const draft: ResumeTranslationDraft = {
          id: "pending-english", sourceResumeId: "original-current", direction: input.direction, outputLanguage: "en", jobId: input.mode === "job" ? input.jobId : undefined,
          label: "外企测试简历", createdAt: profile.updatedAt,
          translationReviews: [{ id: "experience.0.company", source: "示例科技有限公司", suggested: "Example Technology Co., Ltd.", reason: "请核对官方英文名称。" }],
        };
        translationDrafts.unshift(draft);
        return respond({ status: "needs_confirmation", draft });
      }
      const version: ResumeVersion = {
        id: `generated-${generatedRequests.length}`, kind: input.mode === "job" ? "tailored" : "base",
        jobId: input.mode === "job" ? input.jobId : undefined, sourceResumeId: "original-current", direction: input.direction,
        label: input.mode === "job" ? "岗位专属测试简历" : "方向测试简历", fileName: "test/张明_简历.pdf", mimeType: "application/pdf", createdAt: profile.updatedAt,
        changes: [{ section: "摘要", change: "MODEL_CHANGE_DETAIL_FIXTURE", reason: "MODEL_CHANGE_REASON_FIXTURE" }],
        outputLanguage,
      };
      profile.resumeDirection = input.direction;
      versions.unshift(version);
      return respond({ version, gaps: ["MODEL_GAP_DETAIL_FIXTURE"], resume });
    }
    if (/^\/api\/resume\/drafts\/[^/]+\/confirm$/.test(pathname)) {
      confirmationRequests.push(req.postDataJSON());
      if (confirmationFailures-- > 0) return respond({ error: "测试导出失败，请重试。" }, 500);
      const id = pathname.split("/")[4];
      const draft = translationDrafts.find((item) => item.id === id);
      if (!draft) return respond({ error: "Draft not found" }, 404);
      const version: ResumeVersion = {
        id: "confirmed-english", kind: draft.jobId ? "tailored" : "base", direction: draft.direction, outputLanguage: "en",
        sourceResumeId: draft.sourceResumeId, jobId: draft.jobId, label: "已确认外企英文简历", fileName: "test/English_Resume.pdf", mimeType: "application/pdf", createdAt: profile.updatedAt,
      };
      versions.unshift(version);
      translationDrafts.splice(translationDrafts.indexOf(draft), 1);
      profile.resumeDirection = draft.direction;
      return respond({ version, gaps: [], resume });
    }
    if (pathname.startsWith("/api/jobs/")) {
      const found = availableJobs.find((job) => pathname === `/api/jobs/${job.id}`);
      if (found) return respond({ job: found });
    }
    if (pathname.startsWith("/api/resume/")) return route.fulfill({ contentType: "text/html", body: "<html><body>简历预览</body></html>" });
    // Keep every unrecognised API request away from real profile files and credentials.
    return respond({ error: `Unexpected mocked API request: ${req.method()} ${pathname}` }, 501);
  });
  await page.goto(`${appUrl!.replace(/\/$/, "")}/app`);
  await expect(page.getByTestId("resume-generation")).toBeVisible();
  return { profile, versions, translationDrafts, generatedRequests, textRequests, confirmationRequests };
}

async function searchFixtureJobs(page: Page) {
  await page.getByLabel("目标岗位", { exact: true }).fill("后端工程师");
  await page.getByRole("button", { name: "搜索岗位", exact: true }).click();
  await expect(page.getByRole("heading", { name: "支付后端工程师", exact: true, level: 2 })).toBeVisible();
}

test("missing resume and missing direction keep the single generation button disabled", async ({ page }) => {
  await mockWorkspace(page, { hasResume: false });
  await expect(page.getByTestId("generate-resume")).toHaveCount(1);
  await expect(page.getByTestId("generate-resume")).toBeDisabled();
  await page.getByLabel("修改方向", { exact: true }).selectOption("general");
  await expect(page.getByTestId("generate-resume")).toBeDisabled();
});

test("direction-only generation requires a direction and sends no job ID", async ({ page }) => {
  const fixture = await mockWorkspace(page);
  const button = page.getByTestId("generate-resume");
  await expect(button).toBeDisabled();
  await page.getByLabel("修改方向", { exact: true }).selectOption("state_owned");
  await expect(button).toHaveAccessibleName("生成方向版简历");
  await expect(button).toBeEnabled();
  await button.click();
  await expect.poll(() => fixture.generatedRequests.length).toBe(1);
  expect(fixture.generatedRequests[0]).toEqual({ mode: "direction", direction: "state_owned" });
  await expect(page.getByTestId("resume-generation").getByRole("link", { name: "下载简历 PDF", exact: true })).toBeVisible();
  await expect(page.getByTestId("resume-generation").locator('iframe[title="定制简历预览"]')).toHaveCount(1);
});

test("JD mode requires both direction and a usable JD, and clearing either disables generation", async ({ page }) => {
  const fixture = await mockWorkspace(page);
  await searchFixtureJobs(page);
  await expect(page.getByRole("radio", { name: "方向版（无需 JD）", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "岗位专属版（需 JD）", exact: true }).check();
  const button = page.getByTestId("generate-resume");
  await expect(button).toHaveAccessibleName("生成岗位专属简历");
  await expect(button).toBeDisabled();
  await page.getByLabel("修改方向", { exact: true }).selectOption("large_company");
  await page.getByLabel("目标岗位 JD", { exact: true }).selectOption("jd-ready");
  await expect(button).toBeEnabled();
  await page.getByLabel("修改方向", { exact: true }).selectOption("");
  await expect(button).toBeDisabled();
  await page.getByLabel("修改方向", { exact: true }).selectOption("large_company");
  await page.getByLabel("目标岗位 JD", { exact: true }).selectOption("");
  await expect(button).toBeDisabled();
  await page.getByLabel("目标岗位 JD", { exact: true }).selectOption("jd-empty");
  await expect(button).toBeDisabled();
  await page.getByLabel("目标岗位 JD", { exact: true }).selectOption("jd-ready");
  await expect(button).toBeEnabled();
  await button.click();
  await expect.poll(() => fixture.generatedRequests.length).toBe(1);
  expect(fixture.generatedRequests[0]).toEqual({ mode: "job", direction: "large_company", jobId: "jd-ready" });
  await expect(page.getByTestId("resume-generation").locator('iframe[title="定制简历预览"]')).toHaveCount(1);
  await expect(page.locator("iframe")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Tailored resume", exact: true })).toHaveCount(0);
  await expect(page.getByText("MODEL_CHANGE_DETAIL_FIXTURE")).toHaveCount(0);
  await expect(page.getByText("MODEL_CHANGE_REASON_FIXTURE")).toHaveCount(0);
  await expect(page.getByText("MODEL_GAP_DETAIL_FIXTURE")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Tailored PDF for/ })).toBeChecked();
});

test("Chinese pasted resume is submitted as text before generation becomes available", async ({ page }) => {
  const fixture = await mockWorkspace(page, { hasResume: false });
  const pasted = "张明\n后端开发工程师\n北京，13800000000\n示例科技有限公司，2022年7月至今。负责支付接口开发、数据库优化和分布式系统维护。\n示例大学，本科，计算机科学。";
  await page.getByRole("button", { name: "粘贴简历文本", exact: true }).click();
  await page.getByLabel("中文或英文简历文本", { exact: true }).fill(pasted);
  await page.getByRole("button", { name: "读取简历信息", exact: true }).click();
  await expect.poll(() => fixture.textRequests.length).toBe(1);
  expect(fixture.textRequests[0]).toEqual({ text: pasted });
  await page.getByLabel("修改方向", { exact: true }).selectOption("general");
  await expect(page.getByTestId("generate-resume")).toBeEnabled();
  await expect(page.getByRole("heading", { name: "张明", exact: true })).toBeVisible();
});

test("job preview ignores versions from a different direction or original resume", async ({ page }) => {
  const oldVersions: ResumeVersion[] = [
    { id: "wrong-direction", kind: "tailored", jobId: "jd-ready", direction: "state_owned", outputLanguage: "zh-CN", sourceResumeId: "original-current", label: "旧央国企版", fileName: "old.pdf", mimeType: "application/pdf", createdAt: "2026-11-20T00:00:00.000Z" },
    { id: "wrong-source", kind: "tailored", jobId: "jd-ready", direction: "general", outputLanguage: "zh-CN", sourceResumeId: "original-previous", label: "旧源简历版", fileName: "old2.pdf", mimeType: "application/pdf", createdAt: "2026-11-19T00:00:00.000Z" },
  ];
  const fixture = await mockWorkspace(page, { versions: oldVersions });
  await page.getByLabel("修改方向", { exact: true }).selectOption("general");
  await searchFixtureJobs(page);
  await page.getByRole("radio", { name: "岗位专属版（需 JD）", exact: true }).check();
  await expect(page.locator('iframe[title="定制简历预览"]')).toHaveCount(0);
  fixture.versions.unshift({ id: "current-general", kind: "tailored", jobId: "jd-ready", direction: "general", outputLanguage: "zh-CN", sourceResumeId: "original-current", label: "当前通用岗位版", fileName: "current.pdf", mimeType: "application/pdf", createdAt: "2026-11-21T00:00:00.000Z" });
  fixture.profile.resumeDirection = "general";
  await page.reload();
  await searchFixtureJobs(page);
  await page.getByRole("radio", { name: "岗位专属版（需 JD）", exact: true }).check();
  await expect(page.getByTestId("resume-generation").locator('iframe[title="定制简历预览"]')).toHaveAttribute("src", /\/api\/resume\/current-general/);
  await expect(page.locator("iframe")).toHaveCount(1);
});
test("generation controls fit desktop and mobile widths", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await mockWorkspace(page);
  await searchFixtureJobs(page);
  await page.getByRole("radio", { name: "岗位专属版（需 JD）", exact: true }).check();
  await page.getByLabel("修改方向", { exact: true }).selectOption("large_company");
  await page.getByLabel("目标岗位 JD", { exact: true }).selectOption("jd-ready");
  await expect(page.getByTestId("generate-resume")).toBeEnabled();
  const outputDir = process.env.ROLEFLOW_UI_SCREENSHOT_DIR;
  if (outputDir) await page.getByTestId("resume-generation").screenshot({ path: join(outputDir, "resume-generation-desktop.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("radio", { name: "方向版（无需 JD）", exact: true }).check();
  await page.getByLabel("修改方向", { exact: true }).selectOption("state_owned");
  await expect(page.getByTestId("generate-resume")).toHaveAccessibleName("生成方向版简历");
  await expect(page.getByTestId("generate-resume")).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (outputDir) await page.getByTestId("resume-generation").screenshot({ path: join(outputDir, "resume-generation-mobile.png") });
});

test("foreign-company terms must be confirmed before a final PDF can be used", async ({ page }) => {
  const fixture = await mockWorkspace(page, {
    reviewRequired: true, englishJd: true, confirmationFailures: 1,
    versions: [{ id: "older-english", kind: "tailored", jobId: "jd-ready", direction: "foreign_company", outputLanguage: "en", sourceResumeId: "original-current", label: "旧英文简历", fileName: "old.pdf", mimeType: "application/pdf", createdAt: "2026-11-20T00:00:00.000Z" }],
  });
  await searchFixtureJobs(page);
  await page.getByRole("radio", { name: "岗位专属版（需 JD）", exact: true }).check();
  await page.getByLabel("修改方向", { exact: true }).selectOption("foreign_company");
  await expect(page.getByRole("radio", { name: /Tailored PDF for/ })).toBeChecked();
  await page.getByTestId("generate-resume").click();
  await expect(page.getByTestId("translation-review")).toBeVisible();
  await expect(page.getByTestId("generate-resume")).toHaveAccessibleName("草稿已生成，等待译名确认");
  await expect(page.getByTestId("pending-pdf-download")).toBeDisabled();
  await expect(page.locator("#resume-generation-readiness")).toContainText("待确认 1 项译名");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Tailored PDF for/ })).toHaveCount(0);
  await expect(page.getByTestId("resume-generation").getByRole("link", { name: "下载简历 PDF", exact: true })).toHaveCount(0);
  const input = page.getByLabel("英文译名：示例科技有限公司", { exact: true });
  const confirm = page.getByTestId("confirm-translations");
  await input.fill("");
  await expect(confirm).toBeDisabled();
  await input.fill("中文名称");
  await expect(confirm).toBeDisabled();
  await input.fill("Confirmed Example Technology Ltd.");
  await expect(confirm).toBeEnabled();
  if (process.env.ROLEFLOW_UI_SCREENSHOT_DIR) await page.getByTestId("resume-generation").screenshot({ path: join(process.env.ROLEFLOW_UI_SCREENSHOT_DIR, "translation-confirmation.png") });
  await confirm.click();
  await expect(page.getByTestId("resume-generation").getByRole("alert")).toContainText("测试导出失败");
  await expect(input).toHaveValue("Confirmed Example Technology Ltd.");
  await confirm.click();
  await expect(page.getByTestId("translation-review")).toHaveCount(0);
  await expect(page.getByTestId("resume-generation").locator("iframe")).toHaveAttribute("src", /confirmed-english/);
  await expect(page.getByRole("radio", { name: /Tailored PDF for/ })).toBeChecked();
  expect(fixture.generatedRequests).toHaveLength(1);
  expect(fixture.confirmationRequests).toEqual([
    { translations: { "experience.0.company": "Confirmed Example Technology Ltd." } },
    { translations: { "experience.0.company": "Confirmed Example Technology Ltd." } },
  ]);
});

test("a saved translation review can resume after refresh without regenerating", async ({ page }) => {
  const draft: ResumeTranslationDraft = {
    id: "saved-review", sourceResumeId: "original-current", direction: "general", jobId: "jd-ready", label: "待确认支付岗位简历", createdAt: "2026-11-21T00:00:00.000Z",
    translationReviews: [{ id: "education.0.school", source: "示例大学", suggested: "Example University", reason: "请核对学校官方英文名。" }],
  };
  const fixture = await mockWorkspace(page, { englishJd: true, translationDrafts: [draft, { ...draft, id: "old-source-review", sourceResumeId: "previous-original", label: "过期源草稿" }] });
  await expect(page.getByRole("button", { name: "继续确认：过期源草稿", exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "继续确认：待确认支付岗位简历", exact: true }).click();
  await expect(page.getByRole("radio", { name: "岗位专属版（需 JD）", exact: true })).toBeChecked();
  await expect(page.getByLabel("修改方向", { exact: true })).toHaveValue("general");
  await expect(page.getByLabel("目标岗位 JD", { exact: true })).toHaveValue("jd-ready");
  const input = page.getByLabel("英文译名：示例大学", { exact: true });
  await expect(input).toHaveValue("Example University");
  await input.fill("Confirmed University");
  await page.getByLabel("修改方向", { exact: true }).selectOption("foreign_company");
  await expect(page.getByTestId("translation-review")).toHaveCount(0);
  await page.getByLabel("修改方向", { exact: true }).selectOption("general");
  await expect(input).toHaveValue("Confirmed University");
  await page.getByLabel("目标岗位 JD", { exact: true }).selectOption("");
  await expect(page.getByTestId("translation-review")).toHaveCount(0);
  expect(fixture.generatedRequests).toHaveLength(0);
  expect(fixture.confirmationRequests).toHaveLength(0);
});

test("an English JD produces an English general-direction resume with translation review", async ({ page }) => {
  const fixture = await mockWorkspace(page, { englishJd: true, reviewRequired: true });
  await searchFixtureJobs(page);
  await page.getByRole("radio", { name: "岗位专属版（需 JD）", exact: true }).check();
  await page.getByLabel("修改方向", { exact: true }).selectOption("general");
  await expect(page.getByTestId("resume-output-language")).toHaveText("JD 语言：英文；本次生成：英文简历。");
  await page.getByTestId("generate-resume").click();
  await expect(page.getByTestId("translation-review")).toBeVisible();
  expect(fixture.translationDrafts[0]).toMatchObject({ direction: "general", outputLanguage: "en" });
  await page.getByTestId("confirm-translations").click();
  await expect(page.getByTestId("translation-review")).toHaveCount(0);
  await expect(page.getByTestId("resume-generation").locator("iframe")).toHaveAttribute("src", /confirmed-english/);
  expect(fixture.versions[0]).toMatchObject({ direction: "general", outputLanguage: "en" });
});

test("a Chinese JD overrides the foreign direction and ignores an old English draft", async ({ page }) => {
  const oldDraft: ResumeTranslationDraft = {
    id: "obsolete-english-review", sourceResumeId: "original-current", direction: "foreign_company", outputLanguage: "en", jobId: "jd-ready", label: "旧英文草稿", createdAt: "2026-11-20T00:00:00.000Z",
    translationReviews: [{ id: "education.0.school", source: "示例大学", suggested: "Example University", reason: "请核对英文名。" }],
  };
  const fixture = await mockWorkspace(page, {
    translationDrafts: [oldDraft],
    versions: [{ id: "old-foreign-english", kind: "tailored", direction: "foreign_company", outputLanguage: "en", sourceResumeId: "original-current", jobId: "jd-ready", label: "旧英文简历", fileName: "old.pdf", mimeType: "application/pdf", createdAt: "2026-11-20T00:00:00.000Z" }],
  });
  await searchFixtureJobs(page);
  await page.getByRole("radio", { name: "岗位专属版（需 JD）", exact: true }).check();
  await page.getByLabel("修改方向", { exact: true }).selectOption("foreign_company");
  await expect(page.getByTestId("resume-output-language")).toHaveText("JD 语言：中文；本次生成：中文简历。");
  await expect(page.getByTestId("translation-review")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "继续确认：旧英文草稿", exact: true })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Tailored PDF for/ })).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByTestId("generate-resume")).toBeEnabled();
  await page.getByTestId("generate-resume").click();
  await expect(page.getByTestId("resume-generation").getByRole("link", { name: "下载简历 PDF", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Tailored PDF for/ })).toBeChecked();
  expect(fixture.versions[0]).toMatchObject({ direction: "foreign_company", outputLanguage: "zh-CN" });
  expect(fixture.confirmationRequests).toHaveLength(0);
});
