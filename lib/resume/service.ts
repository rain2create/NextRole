import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { UserFacingError } from "../ai";
import { addResumeVersion, getProfile, getResumeVersion, resumeFilePath, saveProfile } from "../store";
import type { Job, Profile, ResumeChange, ResumeData, ResumeDirection, ResumeTranslationDraft, ResumeVersion } from "../types";
import { extractResumeText, structureResume } from "./parse";
import { renderCoverLetterPdf, renderResumePdf } from "./render";
import { tailorResume } from "./tailor";
import { RESUME_DIRECTIONS } from "./directions";
import { getTranslationDraft, listTranslationDrafts, resumeSourceHash, saveTranslationDraft, translationDraftSummary } from "./drafts";
import { applyReviewedTranslations } from "./translate";
import { resolveResumeLanguage, type ResumeLanguage } from "./language";
import { jobWithDetails } from "../jobs/details";
import { prepareResumeForLayout } from "./layout";

const MAX_BYTES = 8 * 1024 * 1024;
const safe = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "Resume";

export async function uploadResume(buffer: Buffer, fileName: string, mimeType: string) {
  if (buffer.length > MAX_BYTES) throw new UserFacingError("That file is larger than 8 MB.");
  const text = await extractResumeText(buffer, fileName);
  const resume = await structureResume(text);

  return saveOriginalResume(resume, text, fileName, mimeType, buffer);
}

export async function uploadResumeText(text: string) {
  const resume = await structureResume(text);
  return saveOriginalResume(resume, text, "粘贴的简历.pdf", "application/pdf");
}

async function saveOriginalResume(resume: ResumeData, text: string, fileName: string, mimeType: string, buffer?: Buffer) {

  const id = randomUUID();
  const ext = path.extname(fileName).toLowerCase();
  // Employers see this file name, so it stays clean; the folder makes it unique.
  const stored = `${id}/${safe(resume.name || path.basename(fileName, ext))}_Resume${ext}`;
  await fs.mkdir(path.dirname(resumeFilePath(stored)), { recursive: true });
  if (buffer) await fs.writeFile(resumeFilePath(stored), buffer);
  else await renderResumePdf(resume, resumeFilePath(stored));

  const version: ResumeVersion = {
    id,
    kind: "original",
    label: `Your resume (${fileName})`,
    fileName: stored,
    mimeType,
    createdAt: new Date().toISOString(),
  };
  await addResumeVersion(version);

  const profile = await getProfile();
  profile.resume = resume;
  profile.resumeText = text;
  profile.originalResumeId = id;
  profile.baseResumeId = null;
  await saveProfile(profile);
  return { profile, version };
}

type GeneratedResult = { version: ResumeVersion; gaps: string[]; resume: ResumeData };
type PendingTranslationResult = { status: "needs_confirmation"; draft: ResumeTranslationDraft };

export async function generateResume(direction: ResumeDirection, job?: Job): Promise<GeneratedResult | PendingTranslationResult> {
  const profile = await getProfile();
  if (!profile.resume || !profile.originalResumeId) throw new UserFacingError("请先上传或粘贴简历。");
  if (job && !job.description?.trim()) throw new UserFacingError("该岗位没有可用的 JD，请选择其他岗位或生成方向版。");
  const preset = RESUME_DIRECTIONS.find((item) => item.value === direction);
  if (!preset) throw new UserFacingError("请先选择修改方向。");

  const out = await tailorResume(prepareResumeForLayout(profile.resume, profile.resumeText), profile.resumeText, job, direction);
  const id = randomUUID();
  const label = job ? `${preset.label} · ${job.company} — ${job.title}` : `${preset.label} · 方向版简历`;
  if (out.outputLanguage === "en" && out.translationReviews.length) {
    if (resumeSourceHash(await getProfile()) !== resumeSourceHash(profile)) {
      throw new UserFacingError("生成期间原始简历已更新，请使用最新简历重新生成。");
    }
    const draft = {
      id, sourceResumeId: profile.originalResumeId, direction, outputLanguage: "en" as const, jobId: job?.id, label,
      translationReviews: out.translationReviews, createdAt: new Date().toISOString(),
      sourceHash: resumeSourceHash(profile), resume: out.resume, coverLetter: out.coverLetter,
      changes: out.changes, gaps: out.gaps,
    };
    await saveTranslationDraft(draft);
    return { status: "needs_confirmation" as const, draft: translationDraftSummary(draft) };
  }
  return persistGeneratedResume(profile, out, { id, direction, outputLanguage: out.outputLanguage, jobId: job?.id, label });
}

type PreparedResume = { resume: ResumeData; coverLetter: string; changes: ResumeChange[]; gaps: string[] };
type GenerationContext = { id: string; direction: ResumeDirection; outputLanguage: ResumeLanguage; jobId?: string; label: string };

async function persistGeneratedResume(profile: Profile, out: PreparedResume, context: GenerationContext) {
  out = { ...out, resume: prepareResumeForLayout(out.resume, profile.resumeText) };
  const { id, direction, outputLanguage, jobId, label } = context;
  const base = `${safe(profile.resume?.name || out.resume.name)}_Resume`;
  const fileName = `${id}/${base}.pdf`;
  const coverLetterFile = jobId && out.coverLetter.trim() ? `${id}/${safe(profile.resume?.name || out.resume.name)}_Cover_Letter.pdf` : undefined;
  await renderResumePdf(out.resume, resumeFilePath(fileName), outputLanguage);
  if (coverLetterFile) await renderCoverLetterPdf(out.resume, out.coverLetter, resumeFilePath(coverLetterFile), outputLanguage);

  // A slow generation must not replace the selected direction/base of a newly uploaded resume.
  const current = await getProfile();
  if (resumeSourceHash(current) !== resumeSourceHash(profile)) {
    throw new UserFacingError("生成期间原始简历已更新，请使用最新简历重新生成。");
  }

  const version: ResumeVersion = {
    id,
    kind: jobId ? "tailored" : "base",
    jobId,
    direction,
    outputLanguage,
    sourceResumeId: profile.originalResumeId ?? undefined,
    label,
    fileName,
    mimeType: "application/pdf",
    createdAt: new Date().toISOString(),
    changes: out.changes,
    coverLetter: coverLetterFile ? out.coverLetter : undefined,
    coverLetterFile,
  };
  await addResumeVersion(version);
  current.resumeDirection = direction;
  if (!jobId) current.baseResumeId = id;
  await saveProfile(current);
  return { version, gaps: out.gaps, resume: out.resume };
}

const confirmations = new Map<string, Promise<{ version: ResumeVersion; gaps: string[]; resume: ResumeData }>>();

export function confirmResumeTranslation(draftId: string, approvals: Record<string, string>) {
  // Two clicks or a retried request must produce one version of the same draft.
  const existing = confirmations.get(draftId);
  if (existing) return existing;
  const pending = finalizeTranslationDraft(draftId, approvals).finally(() => confirmations.delete(draftId));
  confirmations.set(draftId, pending);
  return pending;
}

async function finalizeTranslationDraft(draftId: string, approvals: Record<string, string>) {
  const draft = await getTranslationDraft(draftId);
  if (!draft) throw new UserFacingError("待确认的英文简历不存在，请重新生成。");
  const profile = await getProfile();
  if (draft.sourceHash !== resumeSourceHash(profile)) throw new UserFacingError("原始简历已更新，请重新生成后再确认译名。");
  const job = draft.jobId ? await jobWithDetails(draft.jobId) : undefined;
  if (draft.jobId && (!job || !job.description?.trim())) throw new UserFacingError("目标岗位 JD 已失效，请重新选择岗位生成简历。");
  if (!profile.resume || resolveResumeLanguage(profile.resume, profile.resumeText, job, draft.direction) !== "en") {
    throw new UserFacingError("该草稿的英文语言与当前 JD 语言不一致，请重新生成岗位专属简历。");
  }
  if (draft.confirmedVersionId) {
    const version = await getResumeVersion(draft.confirmedVersionId);
    if (!version) throw new UserFacingError("已确认的简历版本不存在，请重新生成。");
    return { version, gaps: draft.gaps, resume: draft.resume };
  }
  if (!(await listTranslationDrafts(profile)).some((item) => item.id === draftId)) {
    throw new UserFacingError("该英文草稿已有更新版本，请刷新后确认最新草稿。");
  }
  const resume = applyReviewedTranslations(draft.resume, draft.translationReviews, approvals);
  // Keep the cover letter consistent with user-corrected names without another model call.
  let coverLetter = draft.coverLetter;
  const replacements = new Map<string, string>();
  for (const review of draft.translationReviews) {
    const replacement = approvals[review.id].trim();
    if (replacement === review.suggested) continue;
    const previous = replacements.get(review.suggested);
    if (previous && previous !== replacement) throw new UserFacingError("相同建议译名填写了不同结果，请统一译名后确认。");
    replacements.set(review.suggested, replacement);
  }
  // Replace the original strings in one pass so overlapping names do not cascade.
  if (replacements.size) {
    const pattern = new RegExp([...replacements.keys()].sort((a, b) => b.length - a.length)
      .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
    coverLetter = coverLetter.replace(pattern, (value) => replacements.get(value)!);
  }
  const result = await persistGeneratedResume(profile, { ...draft, resume, coverLetter }, { ...draft, outputLanguage: "en" });
  await saveTranslationDraft({ ...draft, resume, coverLetter, confirmedVersionId: result.version.id });
  return result;
}

// Both manual tailoring and autopilot use the same engine and saved direction.
export async function tailorForJob(job: Job, direction?: ResumeDirection) {
  const profile = await getProfile();
  const result = await generateResume(direction ?? profile.resumeDirection ?? "general", job);
  if ("draft" in result) throw new UserFacingError("英文简历有专有名词需要确认，请先到顶部简历区确认译名，再使用生成后的英文版本申请。");
  return result;
}
