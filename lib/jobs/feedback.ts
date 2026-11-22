import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { dataPath } from "../config";

export const skipReasons = ["too-senior", "wrong-role", "not-this-company", "other"] as const;
export type SkipReason = (typeof skipReasons)[number];

const feedbackSchema = z.object({
  jobId: z.string().min(1),
  kind: z.enum(["saved", "skipped"]),
  reason: z.enum(skipReasons).optional(),
  query: z.string(),
  title: z.string(),
  company: z.string(),
  seniority: z.string().optional(),
  updatedAt: z.string(),
});
export type JobFeedback = z.infer<typeof feedbackSchema>;

const file = () => dataPath("job-feedback.json");
const queues = ((globalThis as { __jobFeedbackQueues?: Map<string, Promise<unknown>> }).__jobFeedbackQueues ??= new Map());

export async function listJobFeedback(): Promise<JobFeedback[]> {
  try {
    return z.array(feedbackSchema).parse(JSON.parse(await fs.readFile(file(), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error("Job feedback could not be read; the existing file was left unchanged.", { cause: error });
  }
}

export function updateJobFeedback(jobId: string, next: Omit<JobFeedback, "jobId" | "updatedAt"> | null) {
  const target = file();
  const task = (queues.get(target) ?? Promise.resolve()).then(async () => {
    const current = await listJobFeedback();
    const previous = current.find((item) => item.jobId === jobId);
    const updated = current.filter((item) => item.jobId !== jobId);
    if (next) {
      updated.push({ jobId, ...next, updatedAt: next.kind === "saved" && previous?.kind === "saved" ? previous.updatedAt : new Date().toISOString() });
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(updated, null, 2), { flag: "wx" });
      await fs.rename(temporary, target);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
    return updated;
  });
  queues.set(target, task.catch(() => {}));
  return task;
}
