import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import type { ResumeData } from "../lib/types";

test("translation drafts require review, survive reload, reject stale sources and finalize once without another model call", async ({}, testInfo) => {
  const keys = ["OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL", "ROLEFLOW_DATA_DIR", "BROWSER_CHANNEL"];
  const previous = keys.map((key) => process.env[key]);
  const source: ResumeData = {
    name: "张三", headline: "软件工程师", summary: "负责后端服务。",
    contact: { email: "fixture@example.com", phone: "13800000000", location: "上海", linkedin: "", github: "", website: "" },
    skills: [{ category: "技能", items: ["Java", "数据库设计"] }],
    experience: [{ title: "开发工程师", company: "示例科技有限公司", location: "上海", start: "2022年6月", end: "至今", bullets: ["维护Java服务。"] }],
    projects: [], education: [], certifications: [], achievements: [],
  };
  const translations: Record<string, string> = {
    name: "Zhang San", headline: "Software Engineer", summary: "Maintained backend services.", "contact.location": "Shanghai",
    "skills.0.category": "Skills", "skills.0.items.1": "Database Design", "experience.0.title": "Developer",
    "experience.0.company": "Shili Technology Co., Ltd.", "experience.0.location": "Shanghai", "experience.0.bullets.0": "Maintained Java services.",
  };
  let modelCalls = 0;
  const server = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); modelCalls++;
    const value = body.text.format.name === "english_resume_translation"
      ? { translations: JSON.parse(body.input).fields.map((field: { id: string }) => ({ id: field.id, text: translations[field.id] })) }
      : { resume: source, changes: [], cover_letter: "I worked at Shili Technology Co., Ltd.", gaps: [] };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "resp_fixture", object: "response", created_at: 0, status: "completed", model: "fixture",
      output: [{ id: "msg_fixture", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(value), annotations: [] }] }],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  let closeBrowser: (() => Promise<void>) | undefined;
  try {
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing mock port");
    const dataDir = testInfo.outputPath("isolated-data");
    process.env.OPENAI_API_KEY = "fixture-key";
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
    process.env.OPENAI_MODEL = "fixture"; process.env.ROLEFLOW_DATA_DIR = dataDir;
    process.env.BROWSER_CHANNEL = process.env.PW_CHANNEL || "chromium";
    const { getProfile, saveProfile, listResumeVersions, saveJobs } = await import("../lib/store");
    const { generateResume, confirmResumeTranslation } = await import("../lib/resume/service");
    const { listTranslationDrafts } = await import("../lib/resume/drafts");
    const { headlessBrowser } = await import("../lib/agent/browser");
    const { extractResumeText } = await import("../lib/resume/parse");
    closeBrowser = async () => (await headlessBrowser()).close();
    const profile = await getProfile();
    profile.resume = source; profile.resumeText = JSON.stringify(source); profile.originalResumeId = "original-fixture";
    await saveProfile(profile);
    const job = { id: "job-fixture", title: "Software Engineer", company: "Example Employer", location: "Shanghai", source: "web" as const, url: "https://example.com/job", applyUrl: "https://example.com/job", description: "Java and database development", fetchedAt: new Date().toISOString() };
    await saveJobs([job]);
    const prepared = await generateResume("general", job);
    if (!("draft" in prepared)) throw new Error("Expected a review draft");
    expect(prepared.status).toBe("needs_confirmation");
    expect(prepared.draft.translationReviews.some((item) => item.source === source.experience[0].company)).toBe(true);
    expect(await listResumeVersions()).toEqual([]);
    expect(await fs.stat(path.join(dataDir, "resumes")).then(() => true, () => false)).toBe(false);
    expect((await listTranslationDrafts(await getProfile())).map((item) => item.id)).toEqual([prepared.draft.id]);
    expect(modelCalls).toBe(2);
    const approvals = Object.fromEntries(prepared.draft.translationReviews.map((item) => [item.id, item.suggested]));
    await expect(confirmResumeTranslation(prepared.draft.id, {})).rejects.toThrow();
    approvals["experience.0.company"] = "Example Software Co., Ltd.";
    const [confirmed, repeated] = await Promise.all([confirmResumeTranslation(prepared.draft.id, approvals), confirmResumeTranslation(prepared.draft.id, approvals)]);
    expect(confirmed.version.id).toBe(repeated.version.id);
    expect(confirmed.resume.experience[0].company).toBe("Example Software Co., Ltd.");
    expect(confirmed.version.coverLetter).toContain("Example Software Co., Ltd.");
    expect(confirmed.version).toMatchObject({ outputLanguage: "en", direction: "general", sourceResumeId: "original-fixture" });
    expect(await listResumeVersions()).toHaveLength(1);
    expect(await listTranslationDrafts(await getProfile())).toEqual([]);
    expect((await confirmResumeTranslation(prepared.draft.id, approvals)).version.id).toBe(confirmed.version.id);
    expect(modelCalls).toBe(2);
    expect((await getProfile()).resume).toEqual(source);
    const pdf = await fs.readFile(path.join(dataDir, "resumes", confirmed.version.fileName));
    expect(await extractResumeText(pdf, "resume.pdf")).toContain("Example Software Co., Ltd.");
    const stale = await generateResume("foreign_company", job);
    if (!("draft" in stale)) throw new Error("Expected another review draft");
    const staleApprovals = Object.fromEntries(stale.draft.translationReviews.map((item) => [item.id, item.suggested]));
    await saveJobs([{ ...job, description: "岗位职责：负责后端服务开发和数据库设计，熟悉 Java 技术栈。" }]);
    expect(await listTranslationDrafts(await getProfile())).toEqual([]);
    await expect(confirmResumeTranslation(stale.draft.id, staleApprovals)).rejects.toThrow("语言不一致");
    await saveJobs([job]);
    const changed = await getProfile(); changed.resume!.contact.location = "北京"; await saveProfile(changed);
    await expect(confirmResumeTranslation(stale.draft.id, staleApprovals)).rejects.toThrow("原始简历已更新");
    expect(await listTranslationDrafts(await getProfile())).toEqual([]);
    expect(await listResumeVersions()).toHaveLength(1);
  } finally {
    if (closeBrowser) await closeBrowser();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
});
