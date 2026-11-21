import type { ResumeChange, ResumeData } from "../types";
import { inferEmploymentType } from "./layout";

// Normalize only for comparison. Keep the original wording in the final document.
export const normalizeResumeFact = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}\p{M}+#.]/gu, "");

export function restoreResumeFacts(base: ResumeData, candidate: ResumeData, resumeText: string, proposedChanges: ResumeChange[] = []) {
  const resume = structuredClone(candidate);
  const changes = [...proposedChanges];
  resume.name = base.name;
  resume.contact = structuredClone(base.contact);

  const used = new Set<number>();
  resume.experience = candidate.experience.flatMap((entry) => {
    const company = normalizeResumeFact(entry.company);
    const title = normalizeResumeFact(entry.title);
    if (!company || !title) return [];
    const matches = base.experience
      .map((original, index) => ({ original, index }))
      .filter(({ original, index }) => !used.has(index) && normalizeResumeFact(original.company) === company && normalizeResumeFact(original.title) === title);
    // The same role can occur more than once at one company. Dates must disambiguate it.
    const match = matches.length === 1 ? matches[0] : matches.find(({ original }) =>
      normalizeResumeFact(original.start) === normalizeResumeFact(entry.start) && normalizeResumeFact(original.end) === normalizeResumeFact(entry.end));
    if (!match) return [];
    used.add(match.index);
    const { original } = match;
    const restored = { ...entry, title: original.title, company: original.company, start: original.start, end: original.end, location: original.location };
    // Classification belongs to the source role, not to model-generated wording.
    const employmentType = inferEmploymentType(original, resumeText);
    if (employmentType === "unknown") delete restored.employmentType;
    else restored.employmentType = employmentType;
    return [restored];
  });
  base.experience.forEach((original, index) => {
    if (!used.has(index)) {
      const restored = structuredClone(original);
      const employmentType = inferEmploymentType(original, resumeText);
      if (employmentType !== "unknown") restored.employmentType = employmentType;
      resume.experience.push(restored);
    }
  });
  resume.education = structuredClone(base.education);
  resume.certifications = [...base.certifications];

  const source = normalizeResumeFact(resumeText + "\n" + base.skills.flatMap((group) => group.items).join("\n"));
  const dropped: string[] = [];
  resume.skills = resume.skills.map((group) => ({
    ...group,
    items: group.items.filter((skill) => {
      const normalized = normalizeResumeFact(skill);
      const supported = /[\p{L}\p{N}]/u.test(normalized) && source.includes(normalized);
      if (!supported) dropped.push(skill);
      return supported;
    }),
  })).filter((group) => group.items.length > 0);
  if (dropped.length) {
    const chinese = /\p{Script=Han}/u.test(resumeText);
    changes.push({
      section: chinese ? "专业技能" : "Skills",
      change: chinese ? `移除原简历中未找到的技能：${dropped.map((skill) => skill || "（空白）").join("、")}` : `Removed ${dropped.join(", ")}`,
      reason: chinese ? "事实校验：原简历未提供相关技能依据" : "Guardrail: not found in your original resume",
    });
  }
  return { resume, changes };
}
