import { readFile } from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";
import type { ResumeData } from "../lib/types";
import { normalizeResumeFact, restoreResumeFacts } from "../lib/resume/facts";
import { extractResumeText, hasReadableResumeText, unwrapResumeFields } from "../lib/resume/parse";
import { resumeHtml } from "../lib/resume/render";

const base: ResumeData = {
  name: "张三", headline: "后端开发工程师",
  contact: { email: "zhangsan@example.com", phone: "13800000000", location: "北京", linkedin: "", github: "", website: "" },
  summary: "负责订单与支付系统开发，具备需求分析和数据库设计经验。",
  skills: [{ category: "专业技能", items: ["需求分析", "数据库设计", "Java", "C++"] }],
  experience: [
    { company: "北京示例科技有限公司", title: "开发工程师", start: "2022年6月", end: "2023年6月", location: "北京", bullets: ["负责订单系统开发。"] },
    { company: "北京示例科技有限公司", title: "测试工程师", start: "2023年7月", end: "至今", location: "北京", bullets: ["负责支付系统测试。"] },
    { company: "上海示例技术有限公司", title: "开发工程师", start: "2021年6月", end: "2022年5月", location: "上海", bullets: ["参与接口开发。"] },
  ],
  projects: [{ name: "支付平台", tech: ["Java"], link: "", bullets: ["完成数据库设计。"] }],
  education: [{ school: "北京示例大学", degree: "本科", field: "计算机科学与技术", start: "2017年", end: "2021年", details: [] }],
  certifications: ["大学英语六级"], achievements: [],
};

test("comparison keeps distinct Chinese facts and normalizes full-width Latin text", () => {
  expect(normalizeResumeFact("北京示例科技有限公司")).not.toBe(normalizeResumeFact("上海示例技术有限公司"));
  expect(normalizeResumeFact("Ｃ＋＋")).toBe("c++");
  expect(normalizeResumeFact("需求分析")).toBe("需求分析");
});

test("Chinese employers and multiple roles retain their correct identity and dates", () => {
  const candidate = structuredClone(base);
  candidate.experience = [
    { ...base.experience[1], start: "invented", end: "invented", bullets: ["支付系统测试职责。"] },
    { ...base.experience[2], start: "invented", bullets: ["接口开发职责。"] },
    { ...base.experience[0], company: "虚构公司", bullets: ["不应保留。"] },
  ];
  const { resume } = restoreResumeFacts(base, candidate, "需求分析、数据库设计、Java、C++");
  expect(resume.experience).toHaveLength(3);
  expect(resume.experience[0]).toMatchObject({ company: base.experience[1].company, title: "测试工程师", start: "2023年7月", end: "至今" });
  expect(resume.experience[1]).toMatchObject({ company: "上海示例技术有限公司", start: "2021年6月" });
  expect(resume.experience[2]).toEqual(base.experience[0]);
});

test("unsupported Chinese, empty and punctuation-only skills are removed", () => {
  const candidate = structuredClone(base);
  candidate.skills = [{ category: "技能", items: ["需求分析", "数据库设计", "Ｃ＋＋", "区块链开发", "", "！？", "+", "#", "."] }];
  const { resume, changes } = restoreResumeFacts(base, candidate, "需求分析、数据库设计、Java、C++、C#、.NET");
  expect(resume.skills[0].items).toEqual(["需求分析", "数据库设计", "Ｃ＋＋"]);
  expect(changes[0].change).toContain("区块链开发");
});

test("repeated same-company titles use dates rather than merge two periods", () => {
  const source = structuredClone(base);
  source.experience[1].title = source.experience[0].title;
  const candidate = structuredClone(source);
  candidate.experience = [{ ...source.experience[1], bullets: ["第二段任职。"] }, { ...source.experience[0], bullets: ["第一段任职。"] }];
  const { resume } = restoreResumeFacts(source, candidate, "Java");
  expect(resume.experience.map((role) => [role.start, role.bullets[0]])).toEqual([["2023年7月", "第二段任职。"], ["2022年6月", "第一段任职。"], ["2021年6月", "参与接口开发。"]]);
});

test("Chinese wrapping preserves words and compact resumes are accepted", () => {
  expect(unwrapResumeFields({ company: "北京示例\n科技有限公司", skill: "Spring\nBoot" })).toEqual({ company: "北京示例科技有限公司", skill: "Spring Boot" });
  const compact = "张三，计算机专业本科毕业，拥有后端开发实习经历，负责订单系统接口开发、数据库设计与测试，掌握需求分析、Java、MySQL，期望在北京从事后端开发相关工作。";
  expect(compact.length).toBeLessThan(200);
  expect(hasReadableResumeText(compact)).toBe(true);
  expect(hasReadableResumeText("张三\n后端开发")).toBe(false);
});

test("Chinese DOCX text is extracted without losing characters", async () => {
  const bytes = await readFile(path.join(process.cwd(), "tests/fixtures/chinese-resume.docx"));
  const text = await extractResumeText(bytes, "中文简历.docx");
  expect(text).toContain("张三");
  expect(text).toContain("北京示例科技有限公司");
  expect(text).toContain("需求分析、数据库设计");
  expect(hasReadableResumeText(text)).toBe(true);
});

test("Chinese generated PDF has Chinese headings and extractable text", async ({ page }) => {
  const html = resumeHtml(base);
  expect(html).toContain('lang="zh-CN"');
  expect(html).toContain("Microsoft YaHei");
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const text = await extractResumeText(await page.pdf({ format: "A4", printBackground: true }), "中文简历.pdf");
  const compact = text.replace(/\s/g, "");
  for (const expected of ["张三", "北京示例科技有限公司", "测试工程师", "教育经历", "数据库设计"]) expect(compact).toContain(expected);
});
