export type ResumeSectionKey = "summary" | "education" | "experience" | "projects" | "achievements" | "certifications" | "skills";
export type ResumeTemplateLanguage = "zh-CN" | "en";

export type ResumeTemplate = {
  id: string;
  language: ResumeTemplateLanguage;
  sections: readonly ResumeSectionKey[];
  titles: Record<ResumeSectionKey, string>;
  internshipTitle: string;
  academicAwardsLabel: string;
  otherAwardsLabel: string;
  certificationsLabel: string;
  accent: string;
  headerAlign: "left" | "center";
  fontSize: number;
  lineHeight: number;
  sectionSpacing: number;
  entrySpacing: number;
  bulletSpacing: number;
};

// Column order and typography belong to the template, independently of AI wording.
export const RESUME_TEMPLATES: Record<ResumeTemplateLanguage, ResumeTemplate> = {
  "zh-CN": {
    id: "chinese-education-first",
    language: "zh-CN",
    sections: ["education", "experience", "projects", "skills"],
    titles: { summary: "个人简介", education: "教育经历", experience: "工作经历", projects: "项目经历", achievements: "荣誉与成果", certifications: "资格证书", skills: "专业技能" },
    internshipTitle: "实习经历",
    academicAwardsLabel: "荣誉与奖励",
    otherAwardsLabel: "其他荣誉",
    certificationsLabel: "资格证书",
    accent: "#28486a",
    headerAlign: "center",
    fontSize: 10.5,
    lineHeight: 1.45,
    sectionSpacing: 10,
    entrySpacing: 6,
    bulletSpacing: 1.8,
  },
  en: {
    id: "english-summary-education",
    language: "en",
    sections: ["summary", "education", "experience", "projects", "achievements", "certifications", "skills"],
    titles: { summary: "Summary", education: "Education", experience: "Experience", projects: "Projects", achievements: "Achievements", certifications: "Certifications", skills: "Skills" },
    internshipTitle: "Experience",
    academicAwardsLabel: "Academic Honors",
    otherAwardsLabel: "Other Achievements",
    certificationsLabel: "Certifications",
    accent: "#28486a",
    headerAlign: "left",
    fontSize: 10.5,
    lineHeight: 1.28,
    sectionSpacing: 8,
    entrySpacing: 4,
    bulletSpacing: 1.2,
  },
};
