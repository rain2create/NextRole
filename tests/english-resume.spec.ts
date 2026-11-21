import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import type { Job, ResumeData, TranslationReview } from "../lib/types";
import { applyReviewedTranslations, chineseResumeDate, englishResumeDate, translateResumeToChinese, translateResumeToEnglish, translateResumeWithReview } from "../lib/resume/translate";
import { tailorResume } from "../lib/resume/tailor";
import { resumeHtml } from "../lib/resume/render";
import { extractResumeText } from "../lib/resume/parse";

const source: ResumeData = {
  name: "张三", headline: "后端开发工程师", summary: "负责后端服务开发。",
  contact: { email: "sample@example.com", phone: "+86 13800000000", location: "上海", linkedin: "https://example.com/in/sample", github: "https://example.com/code", website: "https://example.com" },
  skills: [{ category: "专业技能", items: ["数据库设计", "Java", "C++"] }],
  experience: [{ title: "软件工程师", company: "示例科技有限公司", location: "上海", start: "2022年6月", end: "至今", bullets: ["负责数据库设计与Java服务维护。"] }],
  projects: [{ name: "支付平台", tech: ["Java", "数据库设计"], link: "https://example.com/project", bullets: ["完成支付接口开发。"] }],
  education: [{ school: "示例大学", degree: "学士", field: "计算机科学", start: "2018年", end: "2022年6月", details: ["主修软件工程。"] }],
  certifications: ["大学英语六级"], achievements: ["校级奖学金"],
};
const english: Record<string, string> = {
  name: "Zhang San", headline: "Backend Engineer", summary: "Developed backend services.", "contact.location": "Shanghai",
  "skills.0.category": "Technical Skills", "skills.0.items.0": "Database design",
  "experience.0.title": "Software Engineer", "experience.0.company": "Shili Technology Co., Ltd.", "experience.0.location": "Shanghai", "experience.0.bullets.0": "Designed databases and maintained Java services.",
  "projects.0.name": "Payment Platform", "projects.0.tech.1": "Database design", "projects.0.bullets.0": "Developed payment APIs.",
  "education.0.school": "Shili University", "education.0.degree": "Bachelor's Degree", "education.0.field": "Computer Science", "education.0.details.0": "Studied software engineering.",
  "certifications.0": "College English Test Band 6", "achievements.0": "University Scholarship",
};
const chinese: Record<string, string> = {
  headline: "后端工程师", summary: "开发后端服务。", "contact.location": "上海",
  "skills.0.category": "技术技能", "skills.0.items.0": "数据库设计",
  "experience.0.title": "软件工程师", "experience.0.location": "上海", "experience.0.bullets.0": "设计数据库并维护Java服务。",
  "projects.0.name": "支付平台", "projects.0.tech.1": "数据库设计", "projects.0.bullets.0": "开发支付接口。",
  "education.0.degree": "学士", "education.0.field": "计算机科学", "education.0.details.0": "主修软件工程。",
  "certifications.0": "大学英语六级", "achievements.0": "大学奖学金",
};
let server: Server;
let mode: "valid" | "duplicate" | "missing" | "unknown" | "chinese" | "english" = "valid";
let tailorSource = source;
const requests: { name: string; fields?: { id: string; text: string }[]; instructions?: string }[] = [];
const envKeys = ["OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL"];
const previous = envKeys.map((key) => process.env[key]);

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const name = body.text.format.name;
    let value: unknown;
    if (name === "english_resume_translation" || name === "chinese_resume_translation") {
      const fields = JSON.parse(body.input).fields as { id: string; text: string }[];
      requests.push({ name, fields });
      const values = name === "english_resume_translation" ? english : chinese;
      const translations = fields.map((field) => ({ id: field.id, text: values[field.id] ?? field.text })).reverse();
      if (mode === "duplicate") translations[0] = { ...translations[1] };
      if (mode === "missing") translations.pop();
      if (mode === "unknown") translations[0].id = "contact.phone";
      if (mode === "chinese") translations[0].text = "仍是中文";
      if (mode === "english") translations[0].text = "Developed backend services.";
      value = { translations };
    } else {
      requests.push({ name, instructions: body.instructions });
      const tailored = structuredClone(tailorSource);
      tailored.skills[0].items.push("不存在的技能");
      value = { resume: tailored, changes: [], cover_letter: "", gaps: [] };
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "resp_fixture", object: "response", created_at: 0, status: "completed", model: "fixture",
      output: [{ id: "msg_fixture", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(value), annotations: [] }] }],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing mock server address");
  process.env.OPENAI_API_KEY = "translation-fixture-key";
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  process.env.OPENAI_MODEL = "fixture";
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  envKeys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
});

test.beforeEach(() => { mode = "valid"; requests.length = 0; tailorSource = source; });

test("faithful English translation maps fields by stable IDs and preserves original structure and contact facts", async () => {
  const original = structuredClone(source);
  const result = await translateResumeToEnglish(source);
  expect(result.name).toBe("Zhang San");
  expect(result.skills[0].items).toEqual(["Database design", "Java", "C++"]);
  expect(result.contact).toEqual({ ...source.contact, location: "Shanghai" });
  expect(result.projects[0].link).toBe(source.projects[0].link);
  expect(result.experience[0]).toMatchObject({ title: "Software Engineer", start: "Jun 2022", end: "Present" });
  expect(result.education[0]).toMatchObject({ school: "Shili University", start: "2018", end: "Jun 2022" });
  expect(result.experience).toHaveLength(source.experience.length);
  expect(result.projects).toHaveLength(source.projects.length);
  expect(source).toEqual(original);
  expect(requests[0].fields?.some((field) => field.id === "contact.phone" || field.id === "experience.0.start" || field.text === "Java")).toBe(false);
});

test("translation rejects missing, duplicate, unknown and untranslated Chinese fields", async () => {
  for (const invalid of ["duplicate", "missing", "unknown", "chinese"] as const) {
    mode = invalid;
    await expect(translateResumeToEnglish(source)).rejects.toThrow(/英文简历翻译/);
  }
});

test("an English resume keeps its wording and needs no extra model call", async () => {
  const allEnglish = await translateResumeToEnglish(source);
  requests.length = 0;
  expect(await translateResumeToEnglish(allEnglish)).toEqual(allEnglish);
  expect((await translateResumeWithReview(allEnglish)).translationReviews).toEqual([]);
  expect(requests).toHaveLength(0);
  expect(englishResumeDate("2022年6月15日")).toBe("Jun 15, 2022");
  expect(englishResumeDate("2022年")).toBe("2022");
});

test("unverified translated proper names are reviewable and confirmed edits do not alter source facts", async () => {
  const original = structuredClone(source);
  const { resume, translationReviews } = await translateResumeWithReview(source);
  const company = translationReviews.find((review) => review.id === "experience.0.company");
  expect(company).toMatchObject({ source: "示例科技有限公司", suggested: "Shili Technology Co., Ltd." });
  expect(company?.reason).toContain("尚未确认");
  expect(translationReviews.some((review) => review.id === "education.0.school")).toBe(true);
  expect(translationReviews.some((review) => review.id === "name")).toBe(true);
  expect(translationReviews.some((review) => review.id === "skills.0.items.0")).toBe(false);
  const approved = Object.fromEntries(translationReviews.map((review) => [review.id, review.suggested]));
  approved["experience.0.company"] = "  Example Technology Co., Ltd.  ";
  const confirmed = applyReviewedTranslations(resume, translationReviews, approved);
  expect(confirmed.experience[0].company).toBe("Example Technology Co., Ltd.");
  expect(confirmed.contact).toEqual(resume.contact);
  expect(confirmed.skills).toEqual(resume.skills);
  expect(resume.experience[0].company).toBe("Shili Technology Co., Ltd.");
  expect(source).toEqual(original);
});

test("confirmation rejects omitted, injected, duplicate, invalid-text and out-of-range fields", () => {
  const review: TranslationReview = { id: "experience.0.company", source: "示例科技有限公司", suggested: "Example Technology Co., Ltd.", reason: "待核对" };
  const invalidApprovals: Record<string, string>[] = [
    {},
    { "experience.0.company": "Example", "contact.email": "wrong@example.com" },
    { "experience.0.company": "" },
    { "experience.0.company": "仍是中文" },
    { "experience.0.company": "Example カンパニー" },
    { "experience.0.company": "Example\nInjected" },
    { "experience.0.company": "X".repeat(501) },
  ];
  for (const approvals of invalidApprovals) expect(() => applyReviewedTranslations(source, [review], approvals)).toThrow();
  expect(() => applyReviewedTranslations(source, [review, review], { [review.id]: "Example" })).toThrow();
  for (const id of ["experience.99.company", "education.99.school", "certifications.99", "contact.email", "__proto__.polluted", "experience.0.__proto__"]) {
    expect(() => applyReviewedTranslations(source, [{ ...review, id }], { [id]: "Example" })).toThrow();
  }
  const inheritedOnly = Object.create({ [review.id]: "Inherited" }) as Record<string, string>;
  expect(() => applyReviewedTranslations(source, [review], inheritedOnly)).toThrow();
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

test("foreign-company tailoring validates Chinese skills before translation and creates an English PDF", async ({ page }) => {
  const result = await tailorResume(source, JSON.stringify(source), undefined, "foreign_company");
  expect(requests.map((request) => request.name)).toEqual(["tailored_resume", "english_resume_translation"]);
  expect(result.resume.skills[0].items).toEqual(["Database design", "Java", "C++"]);
  expect(JSON.stringify(result.resume)).not.toContain("不存在的技能");
  expect(JSON.stringify(result.resume)).not.toMatch(/\p{Script=Han}/u);
  expect(result.translationReviews.find((review) => review.id === "experience.0.company")?.source).toBe(source.experience[0].company);
  const html = resumeHtml(result.resume, "en");
  expect(html).toContain('lang="en"');
  await page.setContent(html);
  const text = await extractResumeText(await page.pdf({ format: "A4" }), "english-resume.pdf");
  expect(text).toContain("Skills");
  expect(text).toContain("Database design");
  expect(text).not.toContain("专业技能");
});

const fixtureJob = (description: string): Job => ({ id: "language-fixture", source: "web", title: "Backend Engineer", company: "Example Employer", location: "Shanghai", description, url: "https://example.com/job", applyUrl: "https://example.com/job", fetchedAt: "2026-11-21" });

test("an English JD produces English with proper-name review even for a general direction", async () => {
  const result = await tailorResume(source, JSON.stringify(source), fixtureJob("Develop backend services and maintain databases. Collaborate with our product and engineering teams."), "general");
  expect(result.outputLanguage).toBe("en");
  expect(result.translationReviews.some((review) => review.id === "experience.0.company")).toBe(true);
  expect(result.resume.skills[0].items).toEqual(["Database design", "Java", "C++"]);
  expect(requests.map((request) => request.name)).toEqual(["tailored_resume", "english_resume_translation"]);
  expect(requests[0].instructions).toContain("Write the cover letter in English");
});

test("a Chinese JD overrides a foreign-company direction without English translation or review", async () => {
  const result = await tailorResume(source, JSON.stringify(source), fixtureJob("负责后端开发、数据库设计与服务维护，熟悉 Java / Spring Boot / MySQL / Redis。"), "foreign_company");
  expect(result.outputLanguage).toBe("zh-CN");
  expect(result.translationReviews).toEqual([]);
  expect(result.resume.summary).toContain("负责后端服务");
  expect(requests.map((request) => request.name)).toEqual(["tailored_resume"]);
  expect(requests[0].instructions).toContain("Write the cover letter in Simplified Chinese");
});

test("an English source resume is faithfully converted for a Chinese JD without losing identifiers", async ({ page }) => {
  const englishSource = await translateResumeToEnglish(source);
  tailorSource = englishSource;
  requests.length = 0;
  const result = await tailorResume(englishSource, JSON.stringify(englishSource), fixtureJob("负责后端服务开发，进行数据库设计，具备团队协作经验。"), "foreign_company");
  expect(result.outputLanguage).toBe("zh-CN");
  expect(result.translationReviews).toEqual([]);
  expect(result.resume.summary).toBe("开发后端服务。");
  expect(result.resume.skills[0].items).toEqual(["数据库设计", "Java", "C++"]);
  expect(result.resume.contact.email).toBe(source.contact.email);
  expect(result.resume.name).toBe("Zhang San");
  expect(result.resume.experience[0]).toMatchObject({ company: "Shili Technology Co., Ltd.", title: "软件工程师", start: "2022年6月", end: "至今" });
  expect(result.resume.education[0].school).toBe("Shili University");
  expect(englishSource.summary).toBe("Developed backend services.");
  expect(requests.map((request) => request.name)).toEqual(["tailored_resume", "chinese_resume_translation"]);
  expect(chineseResumeDate("September 15, 2024")).toBe("2024年9月15日");
  const html = resumeHtml(result.resume, result.outputLanguage);
  await page.setContent(html);
  const text = await extractResumeText(await page.pdf({ format: "A4" }), "中文简历.pdf");
  expect(text).toContain("专业技能");
  expect(text).toContain("数据库设计");
});

test("Chinese translation includes uppercase prose and English prose containing a Chinese proper name", async () => {
  const mixed = structuredClone(source);
  mixed.headline = "DEVELOPER";
  mixed.summary = "Built data pipelines at 示例公司";
  await translateResumeToChinese(mixed);
  expect(requests[0].name).toBe("chinese_resume_translation");
  expect(requests[0].fields).toEqual(expect.arrayContaining([
    { id: "headline", text: "DEVELOPER" },
    { id: "summary", text: "Built data pipelines at 示例公司" },
  ]));
});

test("short uppercase role words and categories are translated instead of being inferred as technical names", async () => {
  const upper = structuredClone(source);
  upper.headline = "SALES";
  upper.experience[0].title = "LEAD";
  upper.skills[0].category = "DATA";
  const result = await translateResumeToChinese(upper);
  expect(requests[0].fields).toEqual(expect.arrayContaining([
    { id: "headline", text: "SALES" },
    { id: "experience.0.title", text: "LEAD" },
    { id: "skills.0.category", text: "DATA" },
  ]));
  expect(result.headline).toMatch(/\p{Script=Han}/u);
  expect(result.experience[0].title).toMatch(/\p{Script=Han}/u);
  expect(result.skills[0].category).toMatch(/\p{Script=Han}/u);
});

test("Chinese resumes preserve existing product names without requesting a Chinese translation", async () => {
  const technical = structuredClone(source);
  const names = ["OpenFeign", "Element UI", "InAgent Skill", "HTML/Word", "PaddleOCR-VL-1.6"];
  technical.skills = [{ category: "专业技能", items: names }];
  technical.projects[0].tech = names;
  const result = await translateResumeToChinese(technical);
  expect(result.skills[0].items).toEqual(names);
  expect(result.projects[0].tech).toEqual(names);
  expect(requests).toHaveLength(0);
  expect(technical.skills[0].items).toEqual(names);
});

test("Chinese translation preserves arbitrary project technologies while translating project prose", async () => {
  const technical = structuredClone(source);
  technical.headline = "Backend Engineer";
  technical.summary = "Developed backend services.";
  technical.projects[0].name = "Payment Platform";
  technical.projects[0].bullets = ["Developed payment APIs."];
  technical.projects[0].tech = ["Apache Maven", "Spring Cloud Alibaba", "Nacos 2.3", "IntelliJ IDEA", "Computer Vision", "数据库设计"];
  technical.projects.push({ name: "数据工具", tech: ["Vendor Product SDK", "Apache Spark"], link: "", bullets: ["完成数据处理。"] });
  const original = structuredClone(technical);

  const result = await translateResumeToChinese(technical);

  expect(result.summary).toBe("开发后端服务。");
  expect(result.projects[0].name).toBe("支付平台");
  expect(result.projects[0].bullets).toEqual(["开发支付接口。"]);
  expect(result.projects.map((project) => project.tech)).toEqual(original.projects.map((project) => project.tech));
  expect(requests).toHaveLength(1);
  expect(requests[0].fields?.some((field) => /^projects\.\d+\.tech\./.test(field.id))).toBe(false);
  expect(technical).toEqual(original);
});

test("Chinese source with unfamiliar technology names needs no translation request", async () => {
  const technical = structuredClone(source);
  technical.projects[0].tech = ["Apache Maven", "Spring Cloud Alibaba", "Vendor Product SDK", "IntelliJ IDEA"];
  expect(await translateResumeToChinese(technical)).toEqual(technical);
  expect(requests).toHaveLength(0);
});

test("Chinese translation still rejects untranslated prose and invalid field mappings", async () => {
  const prose = structuredClone(source);
  prose.headline = "Backend Engineer";
  prose.summary = "Developed backend services.";
  for (const invalid of ["duplicate", "missing", "unknown", "english"] as const) {
    mode = invalid;
    await expect(translateResumeToChinese(prose)).rejects.toThrow(/中文简历/);
  }
});

test("Chinese translation allows unchanged unfamiliar names in name-bearing fields", async () => {
  const names = structuredClone(source);
  names.summary = "Developed backend services.";
  names.skills.push({ category: "工具", items: ["Maven", "Nacos", "Apache Spark", "Vendor Product SDK", "Advanced Installer", "I/O"] });
  names.projects.push({ name: "Atlas", tech: ["Vendor Product SDK"], link: "", bullets: [] });
  names.certifications.push("Acme Cloud Professional");
  names.achievements.push("Acme Excellence Award");
  const original = structuredClone(names);

  const result = await translateResumeToChinese(names);

  expect(result.summary).toBe("开发后端服务。");
  expect(result.skills[1]).toEqual(names.skills[1]);
  expect(result.projects[1]).toEqual(names.projects[1]);
  expect(result.certifications[1]).toBe(names.certifications[1]);
  expect(result.achievements[1]).toBe(names.achievements[1]);
  expect(names).toEqual(original);
});

test("name-bearing fields cannot bypass translation for complete English descriptions or rewritten English", async () => {
  const prose = structuredClone(source);
  prose.skills.push({ category: "技能", items: [] });
  for (const description of [
    "Developed and maintained backend services using Java.",
    "Developed backend services using Java",
    "Designed payment APIs using Java",
    "Skilled in Java and SQL",
    "Proficient with backend service development",
    "Experienced in designing backend services",
    "Strong knowledge of Java and SQL",
    "5 years of experience in backend development",
    "Responsible for backend service maintenance",
    "Cloud infrastructure: deploying and maintaining backend services",
  ]) {
    prose.skills[1].items = [description];
    await expect(translateResumeToChinese(prose)).rejects.toThrow(/skills\.1\.items\.0/);
  }
  prose.skills[1].items = ["Maven"];
  mode = "english";
  await expect(translateResumeToChinese(prose)).rejects.toThrow(/skills\.1\.items\.0/);
});

test("Chinese translation preserves score and metric facts without treating them as English prose", async () => {
  const metrics = structuredClone(source);
  metrics.summary = "Developed backend services.";
  const facts = ["GPA：88.04/100", "IELTS 7.0", "CET-6: 550/710", "R² = 0.94"];
  metrics.education[0].details.push(...facts);
  const result = await translateResumeToChinese(metrics);
  expect(result.summary).toBe("开发后端服务。");
  expect(result.education[0].details.slice(1)).toEqual(facts);
  expect(requests[0].fields?.some((field) => facts.includes(field.text))).toBe(false);
});
