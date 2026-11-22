import { expect, test } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";
import type { ResumeData } from "../lib/types";
import { resumeHtml } from "../lib/resume/render";

const fixture: ResumeData = {
  name: "张明", headline: "后端开发工程师",
  contact: { email: "sample@example.com", phone: "+86 13800000000", location: "上海", linkedin: "", github: "https://example.com/code", website: "" },
  summary: "具备后端开发和数据分析经验。",
  skills: [{ category: "技术能力", items: ["Java", "数据库设计"] }],
  experience: [{ title: "软件开发实习生", company: "示例科技有限公司", location: "上海", start: "2025年6月", end: "2025年8月", bullets: ["维护后端服务并参与接口设计。"] }],
  projects: [{ name: "独立光谱分类研究", tech: ["Python"], link: "", bullets: ["处理观测数据并比较分类方法。"] }],
  education: [{ school: "示例大学", degree: "本科", field: "计算机科学", start: "2021年", end: "2025年", details: ["完成软件工程及数据库课程。"] }],
  certifications: ["英语考试成绩已提供"], achievements: ["校级奖学金", "优秀员工"],
};

test("Chinese layout follows the confirmed order and keeps honors and credentials within existing sections", async ({ page }) => {
  const original = structuredClone(fixture);
  await page.setContent(resumeHtml(fixture, "zh-CN"));
  expect(await page.locator("section").evaluateAll((sections) => sections.map((section) => section.getAttribute("data-section")))).toEqual(["education", "experience", "projects", "skills"]);
  await expect(page.getByRole("heading", { name: "实习经历", exact: true })).toBeVisible();
  await expect(page.locator('section[data-section="education"]')).toContainText("校级奖学金");
  await expect(page.locator('section[data-section="skills"]')).toContainText("优秀员工");
  await expect(page.locator('section[data-section="skills"]')).toContainText("英语考试成绩已提供");
  await expect(page.getByRole("heading", { name: "个人简介", exact: true })).toHaveCount(0);
  expect(fixture).toEqual(original);
});

test("English layout follows the confirmed order even when the source contains Chinese names", async ({ page }) => {
  await page.setContent(resumeHtml(fixture, "en"));
  expect(await page.locator("section h2").allTextContents()).toEqual(["Summary", "Education", "Experience", "Projects", "Achievements", "Certifications", "Skills"]);
  const withWork = structuredClone(fixture);
  withWork.experience.push({ ...fixture.experience[0], title: "后端开发工程师", company: "另一家科技公司" });
  await page.setContent(resumeHtml(withWork, "zh-CN"));
  await expect(page.getByRole("heading", { name: "工作经历", exact: true })).toBeVisible();
  await expect(page.getByText("软件开发实习生", { exact: true })).toBeVisible();
});

test("empty sections disappear and projects already covered by work are not repeated", async ({ page }) => {
  const empty = structuredClone(fixture);
  empty.summary = ""; empty.education = []; empty.experience = []; empty.projects = []; empty.achievements = []; empty.certifications = [];
  empty.skills = [{ category: "Empty category", items: ["", " "] }];
  await page.setContent(resumeHtml(empty, "en"));
  await expect(page.locator("section")).toHaveCount(0);
  const covered = structuredClone(fixture);
  covered.experience[0].bullets = ["支付平台使用Java完成数据库设计。"];
  covered.projects = [{ name: "支付平台", tech: ["Java"], link: "", bullets: ["支付平台使用Java完成数据库设计。"] }];
  await page.setContent(resumeHtml(covered, "zh-CN"));
  await expect(page.locator('section[data-section="projects"]')).toHaveCount(0);
  await expect(page.locator('section[data-section="experience"]')).toContainText("支付平台使用Java完成数据库设计。");
  empty.achievements = ["校级奖学金"];
  await page.setContent(resumeHtml(empty, "zh-CN"));
  await expect(page.locator('section[data-section="skills"]')).toContainText("校级奖学金");
});

test("long headings wrap without colliding with dates and special characters remain literal text", async ({ page }) => {
  const long = structuredClone(fixture);
  long.experience[0].company = 'A very long company name for a research and software development team & "Data" <Systems> '.repeat(3);
  await page.setContent(resumeHtml(long, "en"));
  await page.evaluate(() => document.fonts.ready);
  const row = page.locator(".experience-entry .entry-header");
  const title = await row.locator(".entry-title").boundingBox();
  const date = await row.locator(".entry-date").boundingBox();
  expect(title).toBeTruthy(); expect(date).toBeTruthy();
  expect(title!.x + title!.width).toBeLessThanOrEqual(date!.x);
  await expect(row.locator(".entry-title")).toHaveText(long.experience[0].company);
  await expect(row.locator("systems")).toHaveCount(0);
  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth)).toBe(true);
});

test("a long experience flows across PDF pages without reducing body text or creating an empty first page", async ({ page }) => {
  const long = structuredClone(fixture);
  long.experience[0].bullets = Array.from({ length: 30 }, (_, index) => `第${index + 1}项工作：参与后端接口设计、数据库维护、异常排查与团队沟通，记录已完成的功能并保留清晰的技术说明，以支持系统后续维护和需求验证。`);
  await page.setContent(resumeHtml(long, "zh-CN"));
  await page.evaluate(() => document.fonts.ready);
  const fontSize = await page.locator("body").evaluate((body) => parseFloat(getComputedStyle(body).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(14);
  const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  const pdfDocument = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(pdfDocument, { mergePages: false });
  expect(text.length).toBeGreaterThan(1);
  expect(text[0]).toContain("示例科技有限公司");
  for (const content of text) expect(content.trim().length).toBeGreaterThan(20);
  expect(text.join(" ")).toContain("第30项工作");
});
