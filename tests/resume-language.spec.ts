import { expect, test } from "@playwright/test";
import { detectJobLanguage, resolveResumeLanguage } from "../lib/resume/language";
import type { Job, ResumeData } from "../lib/types";

const base: ResumeData = {
  name: "张三", headline: "后端开发工程师", summary: "负责后端服务与数据库设计。",
  contact: { email: "", phone: "", location: "上海", linkedin: "", github: "", website: "" },
  skills: [], experience: [], projects: [], education: [], certifications: [], achievements: [],
};
const job = (description: string): Job => ({ id: "fixture", source: "web", title: "Backend Engineer", company: "示例科技有限公司", location: "Shanghai", description, url: "https://example.com", applyUrl: "https://example.com", fetchedAt: "2026-11-21" });

test("JD language follows prose rather than technology names, markup or an isolated company name", () => {
  expect(detectJobLanguage("负责后端服务开发与数据库设计，熟悉 Java / Spring Boot / MySQL / Redis / Kafka / Docker / Kubernetes / SQL / Git / Linux，能够独立完成需求分析和接口测试。")).toBe("zh-CN");
  expect(detectJobLanguage("<p>负责数据库开发与系统维护，掌握 Java、MySQL。</p><a href='https://example.com/software/developer/java/mysql'>申请</a>")).toBe("zh-CN");
  expect(detectJobLanguage("示例科技有限公司\nWe are looking for a backend engineer to design reliable payment services, work with product teams and improve database performance.")).toBe("en");
  expect(detectJobLanguage("北京示例科技有限公司\nRESPONSIBILITIES: DEVELOP RELIABLE SERVICES, DESIGN SECURE SYSTEMS, COLLABORATE WITH OUR TEAM AND IMPROVE PERFORMANCE.")).toBe("en");
  expect(detectJobLanguage("Build Java services with SQL and collaborate with the product team.")).toBe("en");
});

test("job language overrides every direction while direction-only language defaults remain intact", () => {
  for (const direction of ["general", "state_owned", "large_company", "foreign_company"] as const) {
    expect(resolveResumeLanguage(base, "中文简历：负责服务开发和数据库设计。", job("负责后端服务开发和数据库设计，熟悉Java。"), direction)).toBe("zh-CN");
    expect(resolveResumeLanguage(base, "中文简历：负责服务开发和数据库设计。", job("Develop backend services and maintain databases with the engineering team."), direction)).toBe("en");
  }
  expect(resolveResumeLanguage(base, "负责服务开发和数据库设计。", undefined, "foreign_company")).toBe("en");
  expect(resolveResumeLanguage(base, "负责服务开发和数据库设计。", undefined, "general")).toBe("zh-CN");
  expect(resolveResumeLanguage(base, "Backend engineer developing secure payment services with the product team.", undefined, "general")).toBe("en");
});
