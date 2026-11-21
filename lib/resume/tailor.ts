import { GROUNDING_RULES, structured } from "../ai";
import type { Job, ResumeData, ResumeDirection } from "../types";
import { directionInstructions } from "./directions";
import { restoreResumeFacts } from "./facts";
import { tailorSchema } from "./schema";
import { translateResumeToChinese, translateResumeWithReview } from "./translate";
import { resolveResumeLanguage } from "./language";
import { prepareResumeForLayout } from "./layout";

export async function tailorResume(base: ResumeData, resumeText: string, job?: Job, direction: ResumeDirection = "general") {
  const source = prepareResumeForLayout(base, resumeText);
  const outputLanguage = resolveResumeLanguage(base, resumeText, job, direction);
  const out = await structured({
    schema: tailorSchema,
    name: "tailored_resume",
    effort: "medium",
    instructions: `${job ? "You tailor a candidate's resume to one specific job." : "You improve the presentation of a candidate's resume for their chosen application direction, without assuming a specific job."}
${GROUNDING_RULES}
Priority: verified resume facts first, explicit job requirements second (when supplied), direction preferences last.
DIRECTION PREFERENCE: ${directionInstructions[direction]}
OUTPUT LANGUAGE: ${outputLanguage === "en" ? "English" : "Simplified Chinese"}. ${job ? "The job description language determines the final resume language and takes precedence over direction preferences." : "The application direction and source resume determine the final language."}
LANGUAGE STAGES: This is the source-language tailoring stage. Keep all resume fields in their original language so source facts can be validated. A separate faithful translation step will produce the required output language after validation. Write the cover letter in ${outputLanguage === "en" ? "English" : "Simplified Chinese"}; write the internal change log and gaps in the original resume language.
Allowed edits:
- Rewrite the summary/headline to foreground relevant existing experience.
- Reorder items and bullets so relevant evidence comes first; rephrase using job terminology only where it truthfully describes the same work.
- Reorder and regroup skills; drop clearly irrelevant ones. Only list skills present in the original resume.
- Trim weak or irrelevant bullets to keep the resume concise without losing important qualifications.
- Keep projects already embedded in an employment entry within that entry. Do not repeat the same project and its facts in the standalone projects list; preserve genuinely independent projects, research and coursework.
- Preserve whether each original role was an internship or formal employment. Do not change internship titles or infer employment status from the target job.
- Return content in the existing JSON fields. The renderer controls the fixed section order, headings, typography and page layout; do not add formatting instructions or new layout fields to the resume content.
- Keep an English summary brief, around 2-3 factual sentences, without generic self-praise. The Chinese template does not display the summary: preserve relevant factual evidence in its appropriate existing fields without changing attribution, rather than leaving unique facts only in the summary.
- Do not put a document title, section heading or a complete Markdown resume inside a content field. Do not truncate meaningful bullets or drop important facts merely to force a one-page output.
Not allowed: adding employers, roles, dates, degrees, certifications, metrics, tools or responsibilities not in the original. Keep employer names, job titles, dates and schools exactly as written.
${job ? "Write a cover letter grounded in the resume and this job. Include genuinely unsupported job requirements in gaps." : 'No target job was supplied. Return cover_letter as an empty string and gaps as an empty array. Do not invent a company, job description or job-specific requirements.'}`,
    input: `${job ? `JOB\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\nDescription:\n${(job.description || "").slice(0, 12000)}` : "NO TARGET JOB: produce a direction-based resume only."}

ORIGINAL RESUME (structured JSON)
${JSON.stringify(source)}

ORIGINAL RESUME (raw text, for fact checking)
${resumeText.slice(0, 15000)}`,
  });
  const result = restoreResumeFacts(source, out.resume, resumeText, out.changes);
  const translated = outputLanguage === "en"
    ? await translateResumeWithReview(result.resume)
    : { resume: await translateResumeToChinese(result.resume), translationReviews: [] };
  return { ...result, ...translated, resume: prepareResumeForLayout(translated.resume), outputLanguage, coverLetter: job ? out.cover_letter : "", gaps: job ? out.gaps : [] };
}
