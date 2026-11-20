import type { Job } from "../types";
import type { JobFeedback } from "./feedback";

export type JobRank = { job: Job; note?: string };
export type JobSort = "fit" | "for-you";

const seniorWords = /\b(senior|sr|lead|principal|staff|director|head|chief|junior|jr|intern|graduate)\b/i;
const stopWords = new Set(["a", "an", "and", "at", "for", "in", "of", "the", "with", "remote", "hybrid", "full", "time", "job", "role", "position", "i", "ii", "iii"]);

function words(value: string) {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function roleWords(title: string) {
  return new Set(words(title).filter((word) => !stopWords.has(word) && !seniorWords.test(word)));
}

function titleSimilarity(a: string, b: string) {
  const left = roleWords(a);
  const right = roleWords(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / Math.max(left.size, right.size);
}

function level(job: Pick<Job, "title" | "seniority">) {
  const title = job.title.toLowerCase();
  const seniority = (job.seniority || "").toLowerCase();
  if (/\b(intern|internship|graduate|junior|jr)\b/.test(title)) return 0;
  if (/\b(principal|staff|director|head|chief|vp|vice president)\b/.test(title)) return 3;
  if (/\b(senior|sr|lead|manager)\b/.test(title)) return 2;
  if (/\b(director|executive)\b/.test(seniority)) return 3;
  if (/\b(senior|lead|manager)\b/.test(seniority)) return 2;
  if (/\b(intern|entry|junior)\b/.test(seniority)) return 0;
  return 1;
}

function sameCompany(a: string, b: string) {
  const clean = (value: string) => words(value).filter((word) => !["inc", "ltd", "limited", "llc", "co", "company"].includes(word)).join(" ");
  return Boolean(clean(a)) && clean(a) === clean(b);
}

function queryAsksForSenior(query: string) {
  return /\b(senior|sr|lead|principal|staff|director|head|chief)\b/i.test(query);
}

type Adjustment = { points: number; note: string };

function adjustment(job: Job, feedback: JobFeedback[], query: string): Adjustment {
  let positive = 0;
  let negative = 0;
  let positiveNote = "";
  let negativeNote = "";
  for (const item of feedback) {
    if (item.kind === "saved") {
      if (item.jobId === job.id || (level(job) === level(item) && titleSimilarity(job.title, item.title) >= 0.6)) {
        positive += item.jobId === job.id ? 10 : 4;
        if (item.jobId === job.id || !positiveNote) positiveNote = item.jobId === job.id ? "↑ Saved job" : "↑ Similar to saved jobs";
      }
    } else if (item.reason === "too-senior" && !queryAsksForSenior(query)) {
      if (level(job) >= Math.max(2, level(item))) {
        negative += 10;
        negativeNote = "↓ Too senior for you";
      }
    } else if (item.reason === "not-this-company" && sameCompany(job.company, item.company)) {
      negative += 10;
      negativeNote = "↓ Not this company";
    } else if (item.reason === "wrong-role" && item.query && query && titleSimilarity(item.query, query) >= 0.5) {
      if (titleSimilarity(job.title, item.title) >= 0.6) {
        negative += 10;
        negativeNote = "↓ Wrong role";
      }
    }
  }
  const up = Math.min(10, positive);
  const down = Math.min(12, negative);
  return { points: up - down, note: up > down ? positiveNote : down > up ? negativeNote : "" };
}

/** Preserve quickFit and only change the ordinary search list's display order. */
export function rankJobs(jobs: Job[], feedback: JobFeedback[], query: string, sort: JobSort): JobRank[] {
  const byId = new Map(feedback.map((item) => [item.jobId, item]));
  const active = jobs.filter((job) => byId.get(job.id)?.kind !== "skipped");
  const skipped = jobs.filter((job) => byId.get(job.id)?.kind === "skipped");
  if (sort === "fit") return [...active, ...skipped].map((job) => ({ job }));

  const ranked = active.map((job, index) => ({ job, index, change: adjustment(job, feedback, query) }));
  ranked.sort((a, b) => ((b.job.quickFit ?? 0) + b.change.points) - ((a.job.quickFit ?? 0) + a.change.points) || a.index - b.index);
  const output = ranked.map(({ job, index, change }, newIndex) => ({
    job,
    note: change.points > 0 && newIndex < index ? change.note : change.points < 0 && newIndex > index ? change.note : undefined,
  }));
  return [...output, ...skipped.map((job) => ({ job }))];
}
