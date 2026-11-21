import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import type { ResumeData, Job } from "../lib/types";

test("Chinese pasted resumes produce separate direction and JD PDFs without changing original facts", async ({}, testInfo) => {
  const keys = ["OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL", "ROLEFLOW_DATA_DIR", "BROWSER_CHANNEL"];
  const previous = keys.map((key) => process.env[key]);
  const resume: ResumeData = {
    name: "张晓明", headline: "后端开发工程师", summary: "从事平台开发与系统维护。",
    contact: { email: "sample@example.com", phone: "13800000000", location: "上海", linkedin: "", github: "", website: "" },
    skills: [{ category: "专业技能", items: ["数据库设计", "Java"] }],
    experience: [{ title: "软件工程师", company: "甲方科技有限公司", location: "上海", start: "2022年", end: "至今", bullets: ["负责数据库设计与服务维护。"] }],
    education: [{ school: "示例大学", degree: "本科", field: "计算机科学", start: "2018年", end: "2022年", details: [] }],
    projects: [], certifications: [], achievements: [],
  };
  const original = structuredClone(resume);
  const requests: { input: string; instructions: string; schemaName: string }[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    const body = JSON.parse(raw);
    const schemaName = body.text.format.name;
    requests.push({ input: body.input, instructions: body.instructions, schemaName });
    const tailored = structuredClone(resume);
    tailored.skills[0].items.push("不存在的中文技能");
    const result = schemaName === "resume" ? resume : {
      resume: tailored,
      changes: [{ section: "摘要", change: "突出相关经验", reason: "根据修改方向调整表达" }],
      cover_letter: "您好：我希望应聘贵公司的后端岗位。感谢审阅。", gaps: ["未提供云平台经验"],
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "resp_fixture", object: "response", created_at: 0, status: "completed", model: "fixture",
      output: [{ id: "msg_fixture", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(result), annotations: [] }] }],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  let closeBrowser: (() => Promise<void>) | undefined;
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing fixture server port");
    const dataDir = testInfo.outputPath("private-data");
    process.env.OPENAI_API_KEY = "fixture-key";
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
    process.env.OPENAI_MODEL = "fixture";
    process.env.ROLEFLOW_DATA_DIR = dataDir;
    process.env.BROWSER_CHANNEL = process.env.PW_CHANNEL || "chromium";
    const { uploadResumeText, generateResume } = await import("../lib/resume/service");
    const { getProfile, listResumeVersions } = await import("../lib/store");
    const { extractResumeText } = await import("../lib/resume/parse");
    const { headlessBrowser } = await import("../lib/agent/browser");
    closeBrowser = async () => (await headlessBrowser()).close();
    const text = "张晓明\n后端开发工程师\n上海\n示例大学，计算机科学本科，2018年至2022年。\n甲方科技有限公司，软件工程师，2022年至今。\n负责数据库设计、Java服务开发与系统维护，参与接口设计、日常故障排查和团队协作。\n";
    const upload = await uploadResumeText(text);
    expect(upload.profile.resume?.name).toBe("张晓明");
    const direction = await generateResume("state_owned");
    if ("draft" in direction) throw new Error("Chinese direction resume must not need English review");
    expect(direction.version).toMatchObject({ kind: "base", direction: "state_owned", sourceResumeId: upload.version.id });
    expect(direction.version.jobId).toBeUndefined();
    expect(direction.version.coverLetterFile).toBeUndefined();
    expect(direction.gaps).toEqual([]);
    expect(direction.resume.skills[0].items).toEqual(["数据库设计", "Java"]);
    const job: Job = { id: "chinese-job", source: "web", title: "后端开发工程师", company: "乙方平台公司", location: "上海", url: "https://example.com/jobs/1", applyUrl: "https://example.com/jobs/1", description: "负责Java后端服务开发和数据库设计。", fetchedAt: new Date().toISOString() };
    const tailored = await generateResume("large_company", job);
    if ("draft" in tailored) throw new Error("Chinese JD resume must not need English review");
    expect(tailored.version).toMatchObject({ kind: "tailored", jobId: job.id, direction: "large_company", sourceResumeId: upload.version.id });
    expect(tailored.version.coverLetterFile).toBeTruthy();
    expect(tailored.version.outputLanguage).toBe("zh-CN");
    const foreignChinese = await generateResume("foreign_company", job);
    if ("draft" in foreignChinese) throw new Error("A Chinese JD overrides the foreign-company English preset");
    expect(foreignChinese.version).toMatchObject({ direction: "foreign_company", outputLanguage: "zh-CN", jobId: job.id });
    expect(foreignChinese.resume.name).toBe("张晓明");
    expect(requests).toHaveLength(4);
    expect(requests[2].input).toContain(job.description);
    expect((await getProfile()).resume).toEqual(original);
    expect((await getProfile()).resumeDirection).toBe("foreign_company");
    expect(await listResumeVersions()).toHaveLength(4);
    for (const version of [upload.version, direction.version, tailored.version, foreignChinese.version]) {
      const bytes = await fs.readFile(path.join(dataDir, "resumes", version.fileName));
      expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
      const extracted = await extractResumeText(bytes, "简历.pdf");
      expect(extracted).toContain("张晓明");
      expect(extracted).toContain("甲方科技有限公司");
      expect(extracted).not.toContain("不存在的中文技能");
    }
  } finally {
    if (closeBrowser) await closeBrowser();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
});
