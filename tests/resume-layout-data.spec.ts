import { expect, test } from "@playwright/test";
import type { ResumeData } from "../lib/types";
import { inferEmploymentType, prepareResumeForLayout } from "../lib/resume/layout";
import { restoreResumeFacts } from "../lib/resume/facts";

const source: ResumeData = {
  name: "示例", headline: "开发工程师", summary: "已有软件开发经验。",
  contact: { email: "example@example.com", phone: "", location: "上海", linkedin: "", github: "", website: "" },
  skills: [{ category: "技术", items: ["Java"] }],
  experience: [{ title: "软件开发实习生", company: "示例公司", location: "上海", start: "2025年6月", end: "2025年8月", bullets: ["支付平台：使用Java完成支付接口开发，提供https://example.com/payment文档。"] }],
  projects: [{ name: "支付平台", tech: ["Java"], link: "https://example.com/payment", bullets: ["完成支付接口开发"] }],
  education: [], certifications: ["已有证书"], achievements: ["已有荣誉"],
};

test("internship classification follows original roles and unambiguous source headings", () => {
  const entry = source.experience[0];
  expect(inferEmploymentType(entry)).toBe("internship");
  expect(inferEmploymentType({ ...entry, title: "Software Development Intern" })).toBe("internship");
  expect(inferEmploymentType({ ...entry, title: "Internal Tools Engineer" })).toBe("unknown");
  expect(inferEmploymentType({ ...entry, title: "Internship Coordinator" })).toBe("unknown");
  expect(inferEmploymentType({ ...entry, title: "开发工程师" }, "实习经历\n示例公司\n开发工程师\n教育经历\n示例大学")).toBe("internship");
  expect(inferEmploymentType({ ...entry, title: "开发工程师" }, "实习经历\n旧公司\n工作经历\n示例公司")).toBe("unknown");
  expect(inferEmploymentType({ ...entry, title: "开发工程师" }, "工作经历\n示例公司")).toBe("work");
  expect(inferEmploymentType({ ...entry, title: "全职开发工程师" })).toBe("work");
  const mixedSource = "实习经历\n示例公司\n开发工程师\n校园经历\n学生会主席";
  expect(inferEmploymentType({ ...entry, title: "学生会主席" }, mixedSource)).toBe("unknown");
  expect(inferEmploymentType({ ...entry, title: "开发工程师" }, mixedSource)).toBe("unknown");
  expect(inferEmploymentType(entry, mixedSource)).toBe("internship");
  expect(inferEmploymentType({ ...entry, title: "Research Assistant" }, "INTERNSHIP\nExample Ltd.\nACADEMIC EXPERIENCE\nResearch Assistant")).toBe("unknown");
});

test("layout preparation removes only fully covered employer projects and retains independent facts", () => {
  const original = structuredClone(source);
  const prepared = prepareResumeForLayout(source);
  expect(prepared.projects).toEqual([]);
  expect(prepared.experience[0].employmentType).toBe("internship");
  expect(prepared.certifications).toEqual(source.certifications);
  expect(prepared.achievements).toEqual(source.achievements);
  expect(source).toEqual(original);
  expect(prepareResumeForLayout(prepared)).toEqual(prepared);

  const withIndependentProject = structuredClone(source);
  withIndependentProject.projects.push({ name: "独立科研课题", tech: ["Java"], link: "", bullets: ["完成支付接口开发"] });
  expect(prepareResumeForLayout(withIndependentProject).projects.map((project) => project.name)).toEqual(["独立科研课题"]);

  const withUniqueFacts = structuredClone(source);
  withUniqueFacts.projects[0].bullets.push("独立完成性能评估报告");
  expect(prepareResumeForLayout(withUniqueFacts).projects).toHaveLength(1);
  withUniqueFacts.projects[0].bullets = source.projects[0].bullets;
  withUniqueFacts.projects[0].tech.push("Python");
  expect(prepareResumeForLayout(withUniqueFacts).projects).toHaveLength(1);
  withUniqueFacts.projects[0].tech = ["Java"];
  withUniqueFacts.projects[0].link = "https://example.com/independent-details";
  expect(prepareResumeForLayout(withUniqueFacts).projects).toHaveLength(1);
});

test("different work entries cannot jointly erase a standalone project", () => {
  const resume = structuredClone(source);
  resume.experience[0].bullets = ["支付平台：完成支付接口开发"];
  resume.experience.push({ ...resume.experience[0], company: "其他公司", bullets: ["Java https://example.com/payment"] });
  expect(prepareResumeForLayout(resume).projects).toHaveLength(1);
});

test("a candidate cannot overwrite the original role's internship classification", () => {
  const candidate = structuredClone(source);
  candidate.experience[0].employmentType = "work";
  const restored = restoreResumeFacts(source, candidate, "Java").resume;
  expect(restored.experience[0].employmentType).toBe("internship");
  expect(source.experience[0].employmentType).toBeUndefined();
  const unknownSource = structuredClone(source);
  unknownSource.experience[0].title = "开发工程师";
  const unknownCandidate = structuredClone(unknownSource);
  unknownCandidate.experience[0].employmentType = "work";
  expect(restoreResumeFacts(unknownSource, unknownCandidate, "Java").resume.experience[0].employmentType).toBeUndefined();
});
