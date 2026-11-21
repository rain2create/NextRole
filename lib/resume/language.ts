import type { Job, ResumeData, ResumeDirection } from "../types";

export type ResumeLanguage = "en" | "zh-CN";

// Technology names do not make an otherwise Chinese JD an English document.
const TECHNICAL_WORDS = new Set([
  "java", "javascript", "typescript", "python", "golang", "go", "rust", "kotlin", "scala", "swift", "ruby", "php", "html", "css",
  "spring", "boot", "springboot", "mysql", "postgresql", "postgres", "redis", "mongodb", "oracle", "sql", "nosql", "sqlite",
  "vue", "react", "angular", "next", "node", "nodejs", "express", "django", "flask", "fastapi", "linux", "unix", "windows",
  "docker", "kubernetes", "k8s", "kafka", "rabbitmq", "elasticsearch", "git", "github", "gitlab", "jenkins", "maven", "gradle",
  "aws", "azure", "gcp", "pytorch", "tensorflow", "pandas", "numpy", "scikit", "learn", "hadoop", "spark", "tableau", "powerbi",
  "api", "apis", "rest", "restful", "graphql", "grpc", "http", "https", "tcp", "ip", "ci", "cd", "llm", "rag", "gpu", "cpu",
]);

/** Detect the language of the JD body, ignoring markup, links and technology lists. */
export function detectJobLanguage(description: string): ResumeLanguage {
  const text = description.normalize("NFKC")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/[^\s<>]+|www\.[^\s<>]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, " ")
    .replace(/&(?:[a-z]+|#\d+|#x[a-f\d]+);/gi, " ");
  const han = (text.match(/\p{Script=Han}/gu) || []).length;
  if (!han) return "en";
  const words = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  const proseWords = words.filter((word) => !TECHNICAL_WORDS.has(word.toLowerCase()));
  // Roughly two Han characters form one word. Body prose outweighs an isolated
  // Chinese employer name, while Java/MySQL/etc. do not outweigh Chinese prose.
  return proseWords.length > han / 2 ? "en" : "zh-CN";
}

export function resolveResumeLanguage(base: ResumeData, resumeText: string, job?: Job, direction: ResumeDirection = "general"): ResumeLanguage {
  if (job) return detectJobLanguage(job.description?.trim() || job.title);
  if (direction === "foreign_company") return "en";
  const source = resumeText.trim() || [
    base.headline, base.summary, ...base.skills.flatMap((group) => [group.category, ...group.items]),
    ...base.experience.flatMap((entry) => [entry.title, ...entry.bullets]),
    ...base.projects.flatMap((entry) => [entry.name, ...entry.bullets]),
    ...base.education.flatMap((entry) => [entry.degree, entry.field, ...entry.details]),
  ].join("\n");
  return detectJobLanguage(source);
}
