import type { ResumeDirection } from "../types";

export const RESUME_DIRECTIONS: { value: ResumeDirection; label: string; description: string }[] = [
  { value: "general", label: "通用", description: "清晰呈现已有经历、技能和成果，适合尚未确定目标岗位时使用。" },
  { value: "state_owned", label: "央国企", description: "采用规范、准确的表达，突出已有资格、职责履行与组织协作。" },
  { value: "large_company", label: "大厂", description: "突出真实项目贡献、专业深度、解决问题的过程和已有成果。" },
  { value: "foreign_company", label: "外企", description: "方向版输出英文，岗位专属版跟随 JD 语言；突出已有岗位成果、跨团队协作、国际项目和语言能力。" },
];

export function isResumeDirection(value: unknown): value is ResumeDirection {
  return RESUME_DIRECTIONS.some((direction) => direction.value === value);
}

export const directionInstructions: Record<ResumeDirection, string> = {
  general: "Use a clear, balanced presentation of existing experience, skills and achievements. Do not assume a particular employer or role when no job description is supplied.",
  state_owned: "Use precise, professional and restrained wording. Foreground evidenced qualifications, responsibilities, compliance and collaboration when relevant. Do not infer political affiliation, eligibility, certificates or public-sector experience from this preference.",
  large_company: "Foreground evidenced individual contributions, technical or professional depth, problem-solving and outcomes. Use existing metrics only; never invent scale, impact or leadership. This preference does not override the actual job requirements.",
  foreign_company: "Use clear, concise, professional wording foregrounding evidence relevant to the target role, individual contributions and existing outcomes. Highlight cross-functional collaboration, international projects and language proficiency only when documented in the original resume. Do not assume foreign-company experience, language fluency, work authorization or overseas experience. Output language is controlled separately: a job-specific resume follows the job description's language; a direction-only foreign-company resume uses English. Verified facts and explicit job requirements take priority over this preference.",
};
