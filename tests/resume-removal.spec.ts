import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { addResumeVersion, getProfile, getResumeVersion, listResumeVersions, removeResumeVersion, resumeFilePath, saveProfile } from "../lib/store";
import type { ResumeData, ResumeVersion } from "../lib/types";

test("removing the current original clears readiness, preserves history and survives later uploads", async () => {
  const previous = process.env.ROLEFLOW_DATA_DIR;
  const directory = await fs.mkdtemp(path.join(tmpdir(), "nextrole-remove-"));
  process.env.ROLEFLOW_DATA_DIR = directory;
  try {
    const original: ResumeVersion = { id: "original", kind: "original", label: "Fixture", fileName: "original.pdf", mimeType: "application/pdf", createdAt: new Date().toISOString() };
    const generated: ResumeVersion = { ...original, id: "generated", kind: "base", sourceResumeId: original.id };
    await addResumeVersion(original);
    await addResumeVersion(generated);
    await fs.mkdir(path.dirname(resumeFilePath(original.fileName)), { recursive: true });
    await fs.writeFile(resumeFilePath(original.fileName), "historical attachment fixture");
    const profile = await getProfile();
    profile.resume = { name: "Fixture", headline: "", summary: "", contact: { email: "", phone: "", location: "", linkedin: "", github: "", website: "" }, skills: [], experience: [], education: [], projects: [], certifications: [], achievements: [] } satisfies ResumeData;
    profile.resumeText = "fixture resume text";
    profile.originalResumeId = original.id;
    profile.baseResumeId = generated.id;
    profile.resumeDirection = "general";
    profile.preferences.noticePeriod = "30 days";
    await saveProfile(profile);
    expect(await removeResumeVersion(original.id)).toBe(true);
    expect(await getProfile()).toMatchObject({ resume: null, resumeText: "", originalResumeId: null, baseResumeId: null, resumeDirection: null, preferences: { noticePeriod: "30 days" } });
    expect(await getResumeVersion(original.id)).toBeUndefined();
    expect((await getResumeVersion(original.id, true))?.removedAt).toBeTruthy();
    expect(await fs.readFile(resumeFilePath(original.fileName), "utf8")).toBe("historical attachment fixture");
    expect((await listResumeVersions()).map(v => v.id)).toEqual([generated.id]);
    await addResumeVersion({ ...original, id: "replacement" });
    expect((await getResumeVersion(original.id, true))?.removedAt).toBeTruthy();
    expect(await removeResumeVersion("missing")).toBe(false);
    expect(await removeResumeVersion(original.id)).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.ROLEFLOW_DATA_DIR;
    else process.env.ROLEFLOW_DATA_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
