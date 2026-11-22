import type { ResumeData } from "../types";

type Experience = ResumeData["experience"][number];
export type EmploymentType = "work" | "internship" | "unknown";

const internshipTitle = /实习|\bintern\b|\binternships?\b(?=\s*[)\]）]?\s*$)/i;
const workTitle = /全职|正式员工|正式职员|\bfull[\s-]?time\b|\bpermanent\b/i;
const internshipHeading = /(?:^|\n)\s*(?:实习(?:经历|经验)|internships?(?:\s+experience)?)\s*[:：]?\s*(?:\n|$)/i;
const workHeading = /(?:^|\n)\s*(?:工作(?:经历|经验)|职业经历|任职经历|(?:work|professional|employment)\s+(?:experience|history)|工作[与及和/·、\s]*实习(?:经历|经验))\s*[:：]?\s*(?:\n|$)/i;
const nonEmploymentTitle = /学生会|团委|团支书|班长|社团|志愿者|科研助理|研究助理|\bvolunteer\b|\bresearch\s+assistant\b|\bstudent\s+(?:council|union|association)\b|\bclub\s+(?:president|leader)\b/i;
const nonEmploymentHeading = /(?:^|\n)\s*(?:校园(?:经历|活动)|社会实践|志愿(?:经历|活动|服务)|科研(?:经历|经验)|研究经历|(?:campus|leadership|volunteer|research|academic)(?:\s+(?:experience|activities|service))?)\s*[:：]?\s*(?:\n|$)/i;

/** Infer only from the candidate's own role or source headings, never from a JD. */
export function inferEmploymentType(entry: Experience, rawText = ""): EmploymentType {
  if (internshipTitle.test(entry.title)) return "internship";
  if (entry.employmentType === "internship" || entry.employmentType === "work") return entry.employmentType;
  if (workTitle.test(entry.title)) return "work";
  if (nonEmploymentTitle.test(entry.title)) return "unknown";
  const raw = rawText.replace(/\r\n?/g, "\n");
  // A global internship heading is insufficient when the source also has campus,
  // volunteering or research sections that may have been parsed into experience.
  if (nonEmploymentHeading.test(raw)) return "unknown";
  const internshipOnly = internshipHeading.test(raw);
  const workOnly = workHeading.test(raw);
  if (internshipOnly && !workOnly) return "internship";
  if (workOnly && !internshipOnly && !/工作[与及和/·、\s]*实习/.test(raw)) return "work";
  return "unknown";
}

const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}+#.]/gu, "");

/** A project is redundant only when one work entry already contains all of it. */
function isFullyEmbedded(project: ResumeData["projects"][number], experience: Experience[]) {
  const name = normalize(project.name);
  const details = project.bullets.map(normalize).filter(Boolean);
  // A title or generic overlapping bullet alone does not prove the project is the same.
  if (!name || !details.length) return false;
  return experience.some((entry) => {
    const texts = [entry.title, entry.company, ...entry.bullets].map(normalize);
    const mentionsName = texts.some((text) => text.includes(name));
    const covers = (detail: string) => texts.some((text) => text.includes(detail));
    const coversLink = !project.link.trim() || [entry.title, entry.company, ...entry.bullets].some((text) => text.includes(project.link.trim()));
    return mentionsName && details.every(covers) && project.tech.map(normalize).filter(Boolean).every(covers) && coversLink;
  });
}

/** Prepare a copy for either language template without changing the factual source. */
export function prepareResumeForLayout(source: ResumeData, rawText = ""): ResumeData {
  const resume = structuredClone(source);
  resume.experience = resume.experience.map((entry) => {
    const employmentType = inferEmploymentType(entry, rawText);
    return employmentType === "unknown" ? entry : { ...entry, employmentType };
  });
  resume.projects = resume.projects.filter((project) => !isFullyEmbedded(project, resume.experience));
  return resume;
}
