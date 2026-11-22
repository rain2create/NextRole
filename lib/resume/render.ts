import { promises as fs } from "fs";
import path from "path";
import { headlessBrowser } from "../agent/browser";
import type { ResumeData } from "../types";
import { inferEmploymentType, prepareResumeForLayout } from "./layout";
import { RESUME_TEMPLATES, type ResumeSectionKey, type ResumeTemplate, type ResumeTemplateLanguage } from "./templates";

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const nonempty = (values: string[]) => values.filter((value) => value.trim());
const range = (start: string, end: string) => nonempty([start, end]).map(esc).join(" – ");
const bullets = (values: string[]) => nonempty(values).length ? `<ul>${nonempty(values).map((value) => `<li>${esc(value)}</li>`).join("")}</ul>` : "";
const linkText = (value: string) => value.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

function link(value: string) {
  if (!value.trim()) return "";
  return /^https?:\/\//i.test(value)
    ? `<a href="${esc(value)}">${esc(linkText(value))}</a>`
    : esc(value);
}

function contactHtml(resume: ResumeData) {
  return nonempty([
    esc(resume.contact.location), esc(resume.contact.phone),
    resume.contact.email ? `<a href="mailto:${esc(resume.contact.email)}">${esc(resume.contact.email)}</a>` : "",
    ...[resume.contact.linkedin, resume.contact.github, resume.contact.website].map(link),
  ]).map((item) => `<span>${item}</span>`).join('<span class="contact-divider" aria-hidden="true">·</span>');
}

function headingRow(title: string, date: string) {
  return `<div class="entry-header"><div class="entry-title">${title}</div>${date ? `<div class="entry-date">${date}</div>` : ""}</div>`;
}

function keepShortEntry(values: string[], bulletCount: number) {
  // Keep a small project or education item intact; long entries must still flow.
  return bulletCount <= 3 && values.join(" ").length <= 900 ? " entry--keep" : "";
}

function supplementalLine(label: string, values: string[]) {
  const items = nonempty(values);
  return items.length ? `<p class="supplement"><strong>${esc(label)}：</strong>${items.map(esc).join("；")}</p>` : "";
}

function isAcademicAward(value: string) {
  return /奖学金|校级|院级|优秀毕业生|优秀学生|三好学生|学业|学术|scholarship|dean['’]?s|academic|university|college|school\s+(?:award|honou?r)/i.test(value);
}

function sectionBody(resume: ResumeData, key: ResumeSectionKey, template: ResumeTemplate) {
  const chinese = template.language === "zh-CN";
  const academicAwards = chinese && resume.education.length ? resume.achievements.filter(isAcademicAward) : [];
  const otherAwards = chinese ? resume.achievements.filter((award) => !academicAwards.includes(award)) : [];
  switch (key) {
    case "summary": return resume.summary.trim() ? `<p class="summary">${esc(resume.summary)}</p>` : "";
    case "education": return resume.education.map((entry) => {
      const qualification = nonempty([entry.degree, entry.field]).map(esc).join(chinese ? " · " : ", ");
      if (![entry.school, qualification, entry.start, entry.end, ...entry.details].some((value) => value.trim())) return "";
      return `<article class="entry education-entry${keepShortEntry([entry.school, qualification, ...entry.details], entry.details.length)}">${headingRow(esc(entry.school), range(entry.start, entry.end))}${qualification ? `<p class="entry-subtitle">${qualification}</p>` : ""}${bullets(entry.details)}</article>`;
    }).join("") + (chinese ? supplementalLine(template.academicAwardsLabel, academicAwards) : "");
    case "experience": return resume.experience.map((entry) => {
      if (![entry.company, entry.title, entry.start, entry.end, entry.location, ...entry.bullets].some((value) => value.trim())) return "";
      const title = entry.company || entry.title;
      const subtitle = entry.company ? entry.title : "";
      return `<article class="entry experience-entry${keepShortEntry([title, subtitle, ...entry.bullets], entry.bullets.length)}">${headingRow(esc(title), range(entry.start, entry.end))}${subtitle || entry.location ? `<div class="entry-subrow">${subtitle ? `<p class="entry-subtitle">${esc(subtitle)}</p>` : ""}${entry.location ? `<p class="entry-location">${esc(entry.location)}</p>` : ""}</div>` : ""}${bullets(entry.bullets)}</article>`;
    }).join("");
    case "projects": return resume.projects.map((entry) => {
      const technologies = nonempty(entry.tech);
      if (![entry.name, entry.link, ...technologies, ...entry.bullets].some((value) => value.trim())) return "";
      return `<article class="entry project-entry${keepShortEntry([entry.name, ...technologies, ...entry.bullets], entry.bullets.length)}"><div class="entry-header"><div class="entry-title">${esc(entry.name)}</div>${entry.link ? `<div class="project-link">${link(entry.link)}</div>` : ""}</div>${technologies.length ? `<p class="project-technologies">${technologies.map(esc).join(" · ")}</p>` : ""}${bullets(entry.bullets)}</article>`;
    }).join("");
    case "achievements": return bullets(resume.achievements);
    case "certifications": return bullets(resume.certifications);
    case "skills": {
      const skills = resume.skills.filter((group) => nonempty(group.items).length).map((group) =>
        `<p class="skill-line">${group.category.trim() ? `<strong>${esc(group.category)}${chinese ? "：" : ": "}</strong>` : ""}${nonempty(group.items).map(esc).join(chinese ? "、" : ", ")}</p>`).join("");
      return skills + (chinese ? supplementalLine(template.certificationsLabel, resume.certifications) + supplementalLine(template.otherAwardsLabel, otherAwards) : "");
    }
  }
}

function style(template: ResumeTemplate) {
  return `
  @page { size: A4; margin: 14mm 16mm; }
  * { box-sizing: border-box; }
  html { color-scheme: light; }
  body { margin: 0; color: #1c1c1c; font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif; font-size: ${template.fontSize}pt; line-height: ${template.lineHeight}; overflow-wrap: anywhere; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  a { color: inherit; text-decoration: none; }
  .resume-header { text-align: ${template.headerAlign}; padding-bottom: ${template.language === "en" ? "8pt" : "2pt"}; ${template.language === "en" ? "border-bottom: .5pt solid #ccd4de;" : ""} }
  h1 { margin: 0; font-size: ${template.language === "zh-CN" ? 24 : 23}pt; line-height: 1.15; font-weight: 700; letter-spacing: -.02em; }
  .headline { margin: 4pt 0 0; font-size: 11pt; line-height: 1.35; font-weight: 500; color: #373737; }
  .contact { display: flex; flex-wrap: wrap; justify-content: ${template.headerAlign === "center" ? "center" : "flex-start"}; gap: 1pt 6pt; margin-top: 5pt; font-size: 9.3pt; line-height: 1.45; color: #444; }
  .contact > span { min-width: 0; }
  .contact-divider { color: #8a8a8a; }
  section { margin-top: ${template.sectionSpacing}pt; }
  h2 { margin: 0 0 5pt; padding-bottom: 3pt; border-bottom: .7pt solid ${template.accent}; font-size: 11.2pt; line-height: 1.3; font-weight: 700; color: ${template.accent}; letter-spacing: ${template.language === "zh-CN" ? ".08em" : ".035em"}; ${template.language === "en" ? "text-transform: uppercase;" : ""} break-after: avoid; page-break-after: avoid; }
  .entry { margin-top: ${template.entrySpacing}pt; break-inside: auto; page-break-inside: auto; }
  .entry--keep { break-inside: avoid; page-break-inside: avoid; }
  .entry:first-of-type { margin-top: 0; }

  .entry-header { display: grid; grid-template-columns: minmax(0, 1fr) max-content; gap: 3pt 12pt; align-items: start; break-after: avoid; page-break-after: avoid; }
  .entry-header > :only-child { grid-column: 1 / -1; }
  .entry-title { min-width: 0; font-weight: 650; line-height: 1.35; }
  .entry-date { color: #535353; font-size: 9.6pt; line-height: 1.45; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
  .entry-subrow { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0 10pt; break-after: avoid; page-break-after: avoid; }
  .entry-subtitle { margin: 1pt 0 0; font-weight: 500; color: #3c3c3c; }
  .entry-location { margin: 1pt 0 0 auto; font-size: 9.5pt; color: #606060; }
  .project-link { max-width: 55mm; color: #555; font-size: 9pt; text-align: right; overflow-wrap: anywhere; }
  .project-technologies { margin: 1pt 0 0; color: #555; font-size: 9.5pt; break-after: avoid; page-break-after: avoid; }
  ul { margin: 3pt 0 0; padding-left: 13pt; }
  li { margin: ${template.bulletSpacing}pt 0 0; padding-left: 1pt; orphans: 2; widows: 2; }
  p { orphans: 2; widows: 2; }
  .summary { margin: 0; }
  .skill-line, .supplement { margin: 2pt 0 0; }
  strong { font-weight: 650; }
  @media screen { body { max-width: 178mm; margin: 0 auto; padding: 12mm 0; } }
  `;
}

// Rendered section order is deterministic; AI only supplies facts and wording.
export function resumeHtml(source: ResumeData, language?: ResumeTemplateLanguage) {
  const resume = prepareResumeForLayout(source);
  const selectedLanguage = language ?? (/\p{Script=Han}/u.test(JSON.stringify(resume)) ? "zh-CN" : "en");
  const template = RESUME_TEMPLATES[selectedLanguage];
  const allInternships = resume.experience.length > 0 && resume.experience.every((entry) => inferEmploymentType(entry) === "internship");
  const sections = template.sections.map((key) => {
    const body = sectionBody(resume, key, template);
    if (!body.trim()) return "";
    const title = key === "experience" && selectedLanguage === "zh-CN" && allInternships ? template.internshipTitle : template.titles[key];
    return `<section data-section="${key}"><h2>${esc(title)}</h2>${body}</section>`;
  }).join("");
  return `<!doctype html><html lang="${template.language}"><head><meta charset="utf-8"><title>${esc(resume.name)} — ${selectedLanguage === "zh-CN" ? "简历" : "Resume"}</title><style>${style(template)}</style></head><body><header class="resume-header"><h1>${esc(resume.name)}</h1>${resume.headline.trim() ? `<p class="headline">${esc(resume.headline)}</p>` : ""}${contactHtml(resume) ? `<div class="contact">${contactHtml(resume)}</div>` : ""}</header>${sections}</body></html>`;
}

function coverLetterHtml(resume: ResumeData, letter: string, language?: ResumeTemplateLanguage) {
  const selectedLanguage = language ?? (/\p{Script=Han}/u.test(letter) ? "zh-CN" : "en");
  const template = RESUME_TEMPLATES[selectedLanguage];
  const paragraphs = letter.split(/\n\s*\n/).filter((paragraph) => paragraph.trim()).map((paragraph) => `<p>${esc(paragraph)}</p>`).join("");
  return `<!doctype html><html lang="${selectedLanguage}"><head><meta charset="utf-8"><title>${esc(resume.name)} — ${selectedLanguage === "zh-CN" ? "求职信" : "Cover Letter"}</title><style>${style(template)} @page { margin: 20mm; } .letter-header { padding-bottom: 12pt; border-bottom: .7pt solid ${template.accent}; } .letter-header h1 { font-size: 19pt; } .letter-content { margin-top: 16pt; } .letter-content p { margin: 0 0 10pt; }</style></head><body><header class="letter-header"><h1>${esc(resume.name)}</h1>${contactHtml(resume) ? `<div class="contact">${contactHtml(resume)}</div>` : ""}</header><main class="letter-content">${paragraphs}</main></body></html>`;
}

async function htmlToPdf(html: string, outPath: string) {
  const browser = await headlessBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await page.pdf({ path: outPath, format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally { await page.close(); }
}

export const renderResumePdf = (resume: ResumeData, outPath: string, language?: ResumeTemplateLanguage) => htmlToPdf(resumeHtml(resume, language), outPath);
export const renderCoverLetterPdf = (resume: ResumeData, letter: string, outPath: string, language?: ResumeTemplateLanguage) => htmlToPdf(coverLetterHtml(resume, letter, language), outPath);
