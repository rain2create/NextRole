import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import type { Job } from "../lib/types";
import { listJobFeedback, updateJobFeedback, type JobFeedback } from "../lib/jobs/feedback";
import { rankJobs } from "../lib/jobs/personalize";

function job(id: string, title: string, company: string, quickFit: number): Job {
  return { id, title, company, quickFit, source: "linkedin", location: "Hong Kong", url: `https://example.com/${id}`, applyUrl: `https://example.com/${id}`, fetchedAt: "2026-11-20T00:00:00Z" };
}

function feedback(source: Job, kind: JobFeedback["kind"], reason?: JobFeedback["reason"], query = "Data Analyst"): JobFeedback {
  return { jobId: source.id, kind, reason, query, title: source.title, company: source.company, updatedAt: "2026-11-20T00:00:00Z" };
}

test("saved roles move similar roles without changing fit or labeling passive moves", () => {
  const jobs = [job("a", "Data Analyst", "A", 80), job("b", "Data Analyst", "B", 77), job("c", "Software Engineer", "C", 70)];
  const input = [feedback(jobs[1], "saved")];
  expect(rankJobs(jobs, input, "Data Analyst", "fit").map(({ job: j }) => j.id)).toEqual(["a", "b", "c"]);
  const personalized = rankJobs(jobs, input, "Data Analyst", "for-you");
  expect(personalized.map(({ job: j }) => j.id)).toEqual(["b", "a", "c"]);
  expect(personalized[0].note).toBe("↑ Saved job");
  expect(personalized[1].note).toBeUndefined();
  expect(personalized[0].job.quickFit).toBe(77);
});

test("skip hides only the chosen job and its reason can affect later searches", () => {
  const rejected = job("old", "Senior Data Analyst", "A", 80);
  const jobs = [job("new", "Senior Software Engineer", "B", 82), job("junior", "Software Engineer", "C", 76)];
  const input = [feedback(rejected, "skipped", "too-senior")];
  const result = rankJobs(jobs, input, "Software Engineer", "for-you");
  expect(result.map(({ job: j }) => j.id)).toEqual(["junior", "new"]);
  expect(result[1].note).toBe("↓ Too senior for you");
  expect(rankJobs(jobs, input, "Senior Software Engineer", "for-you")[0].job.id).toBe("new");
  expect(rankJobs([rejected, ...jobs], input, "Data Analyst", "fit").at(-1)?.job.id).toBe("old");
});

test("wrong role and company feedback stay relevant to their own scope", () => {
  const rejected = job("old", "Data Scientist", "Acme", 80);
  const jobs = [job("same-role", "Data Scientist", "Other", 82), job("same-company", "Backend Engineer", "Acme", 81), job("wanted", "Data Analyst", "Third", 76)];
  const wrongRole = rankJobs(jobs, [feedback(rejected, "skipped", "wrong-role")], "Data Analyst", "for-you");
  expect(wrongRole[0].job.id).toBe("same-company");
  expect(wrongRole.find(({ job: j }) => j.id === "same-role")?.note).toBe("↓ Wrong role");
  expect(rankJobs(jobs, [feedback(rejected, "skipped", "wrong-role")], "Backend Engineer", "for-you").map(({ job: j }) => j.id)).toEqual(jobs.map((j) => j.id));
  const company = rankJobs(jobs, [feedback(rejected, "skipped", "not-this-company")], "Backend Engineer", "for-you");
  expect(company.find(({ job: j }) => j.id === "same-company")?.note).toBe("↓ Not this company");
  expect(rankJobs(jobs, [feedback(rejected, "skipped", "other")], "Data Analyst", "for-you").map(({ job: j }) => j.id)).toEqual(jobs.map((j) => j.id));
});

test("feedback survives a new read and undo removes it", async () => {
  const previous = process.env.ROLEFLOW_DATA_DIR;
  const directory = await mkdtemp(path.join(tmpdir(), "nextrole-feedback-"));
  process.env.ROLEFLOW_DATA_DIR = directory;
  try {
    await updateJobFeedback("example", { kind: "saved", query: "Analyst", title: "Data Analyst", company: "Example" });
    expect((await listJobFeedback())[0].kind).toBe("saved");
    await updateJobFeedback("example", null);
    expect(await listJobFeedback()).toEqual([]);
  } finally {
    if (previous === undefined) delete process.env.ROLEFLOW_DATA_DIR;
    else process.env.ROLEFLOW_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
