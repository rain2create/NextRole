import { z } from "zod";
import { badRequest, route } from "@/lib/api";
import { listJobFeedback, updateJobFeedback, skipReasons } from "@/lib/jobs/feedback";
import { getJob, getJobs } from "@/lib/store";

const inputSchema = z.object({
  jobId: z.string().min(1).max(200),
  action: z.enum(["save", "skip", "undo"]),
  reason: z.enum(skipReasons).optional(),
  query: z.string().max(200).optional(),
});

async function response(current?: Awaited<ReturnType<typeof listJobFeedback>>) {
  const feedback = current ?? await listJobFeedback();
  const jobs = await getJobs();
  const savedJobs = feedback
    .filter((item) => item.kind === "saved")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((item) => jobs[item.jobId])
    .filter((job) => job !== undefined);
  return Response.json({ feedback, savedJobs }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = route(async () => response());

export const POST = route(async (req: Request) => {
  const parsed = inputSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest("Invalid job feedback.");
  const { jobId, action, reason, query } = parsed.data;
  if (action === "skip" && !reason) return badRequest("Choose a skip reason.");
  if (action === "undo") return response(await updateJobFeedback(jobId, null));

  const job = await getJob(jobId);
  if (!job) return badRequest("This job is no longer available in local search results.", 404);
  return response(await updateJobFeedback(jobId, {
    kind: action === "save" ? "saved" : "skipped",
    reason: action === "skip" ? reason : undefined,
    query: query?.trim() || "",
    title: job.title,
    company: job.company,
    seniority: job.seniority,
  }));
}, "Job feedback could not be saved.");
