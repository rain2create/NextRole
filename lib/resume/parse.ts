import mammoth from "mammoth";
import { extractLinks, extractText, getDocumentProxy } from "unpdf";
import { GROUNDING_RULES, structured, UserFacingError } from "../ai";
import type { ResumeData } from "../types";
import { resumeSchema } from "./schema";
import { prepareResumeForLayout } from "./layout";

export async function extractResumeText(buffer: Buffer, fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    // Hyperlinks (LinkedIn, GitHub, portfolio) are often hidden behind link text.
    const { links } = await extractLinks(pdf).catch(() => ({ links: [] as string[] }));
    const unique = [...new Set(links.filter((l) => /^https?:|^mailto:/i.test(l)))];
    return unique.length ? `${text}\n\nHyperlinks in document:\n${unique.join("\n")}` : text;
  }
  if (lower.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  throw new UserFacingError("Please upload a PDF or DOCX resume.");
}

// PDF text keeps visual line wraps; Chinese words should not gain spaces at a wrap.
export function unwrapResumeFields<T>(value: T): T {
  if (typeof value === "string")
    return value.replace(/(\p{Script=Han})\s*\r?\n\s*(?=\p{Script=Han})/gu, "$1").replace(/\s*\r?\n\s*/g, " ").trim() as T;
  if (Array.isArray(value)) return value.map(unwrapResumeFields) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unwrapResumeFields(v)])) as T;
  return value;
}

export function hasReadableResumeText(text: string) {
  const characters = text.replace(/\s/g, "");
  const hanCount = (characters.match(/\p{Script=Han}/gu) || []).length;
  // Compact Chinese resumes convey more information per character than English text.
  return characters.length >= 200 || (hanCount >= 30 && characters.length >= 60);
}

export async function structureResume(text: string): Promise<ResumeData> {
  if (!hasReadableResumeText(text))
    throw new UserFacingError(
      "We couldn't read enough text from that file. If it's a scanned PDF, export a text-based PDF or DOCX instead.",
    );
  const resume = await structured({
    schema: resumeSchema,
    name: "resume",
    instructions: `You convert resume text into structured JSON exactly as written.
${GROUNDING_RULES}
- Copy wording faithfully; do not improve, summarise or add bullets. Use "" or [] when a field is absent.
- Keep the source language, including Chinese text. Never translate names, employers, job titles, schools or skills. Recognize Chinese headings such as 基本信息、教育经历、实习经历、工作经历、项目经历、专业技能、证书 and 荣誉.
- Dates stay in the resume's own format (e.g. "Jun 2023", "Present").
- Preserve the distinction between internships and formal employment in the original job titles. Do not promote an internship to a full-time role.
- When the original places a project under a work or internship entry, preserve that project's name, technologies, links and details within that entry's bullets. Do not duplicate it in projects. Use projects for independent research, coursework, personal or separately presented projects.
- If the resume has no summary section, leave summary empty.`,
    input: text.slice(0, 30000),
  });
  return prepareResumeForLayout(unwrapResumeFields(resume), text);
}
