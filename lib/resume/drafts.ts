import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config";
import { getJob } from "../store";
import { detectJobLanguage } from "./language";
import type { Profile, ResumeChange, ResumeData, ResumeTranslationDraft } from "../types";

export type TranslationDraftRecord = ResumeTranslationDraft & {
  sourceHash: string;
  resume: ResumeData;
  coverLetter: string;
  changes: ResumeChange[];
  gaps: string[];
  confirmedVersionId?: string;
};

const directory = () => path.join(config.dataDir, "translation-drafts");
const validId = (id: string) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);

export const resumeSourceHash = (profile: Profile) => createHash("sha256")
  .update(JSON.stringify([profile.originalResumeId, profile.resume, profile.resumeText])).digest("hex");

export function translationDraftSummary(draft: TranslationDraftRecord): ResumeTranslationDraft {
  const { id, sourceResumeId, direction, outputLanguage, jobId, label, translationReviews, createdAt } = draft;
  return { id, sourceResumeId, direction, outputLanguage, jobId, label, translationReviews, createdAt };
}

export async function getTranslationDraft(id: string): Promise<TranslationDraftRecord | null> {
  if (!validId(id)) return null;
  try { return JSON.parse(await fs.readFile(path.join(directory(), `${id}.json`), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveTranslationDraft(draft: TranslationDraftRecord) {
  if (!validId(draft.id)) throw new Error("Invalid translation draft ID");
  await fs.mkdir(directory(), { recursive: true });
  const target = path.join(directory(), `${draft.id}.json`);
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(draft, null, 2));
  await fs.rename(temporary, target).catch(async () => {
    await fs.writeFile(target, JSON.stringify(draft, null, 2));
    await fs.rm(temporary, { force: true });
  });
}

export async function listTranslationDrafts(profile: Profile): Promise<ResumeTranslationDraft[]> {
  let files: string[];
  try { files = await fs.readdir(directory()); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const hash = resumeSourceHash(profile);
  const drafts = await Promise.all(files.filter((file) => file.endsWith(".json")).map((file) => getTranslationDraft(file.slice(0, -5))));
  const latest = new Map<string, TranslationDraftRecord>();
  for (const draft of drafts.filter((item): item is TranslationDraftRecord => Boolean(item && item.sourceHash === hash))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const key = `${draft.direction}:${draft.jobId ?? ""}`;
    if (!latest.has(key)) latest.set(key, draft);
  }
  const pending = await Promise.all([...latest.values()].filter((draft) => !draft.confirmedVersionId).map(async (draft) => {
    if (draft.jobId) {
      const job = await getJob(draft.jobId);
      if (job?.description?.trim() && detectJobLanguage(job.description) !== "en") return null;
    }
    return translationDraftSummary(draft);
  }));
  return pending.filter((draft): draft is ResumeTranslationDraft => draft !== null);
}
