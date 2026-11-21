import { createHash } from "crypto";
import { z } from "zod";
import { badRequest, route } from "@/lib/api";
import { changeFeedback, getJob, listSearchFeedback } from "@/lib/store";
import { normalize } from "@/lib/jobs/criteria";

export const GET = route(async () => Response.json({ entries: await listSearchFeedback() }));
export const POST = route(async (req: Request) => {
  const parsed = z.object({ jobId:z.string().max(160), direction:z.string().trim().min(1).max(180), reason:z.enum(["公司","方向","薪资"]) }).safeParse(await req.json());
  if (!parsed.success) return badRequest("反馈格式不正确");
  const { jobId, direction, reason } = parsed.data;
  const job = await getJob(jobId);
  if (!job) return badRequest("岗位不存在",404);
  const scope = reason === "公司" ? normalize(job.company) : `${normalize(direction)}:${reason === "方向" ? normalize(job.title) : jobId}`;
  const id = createHash("sha256").update(`${reason}:${scope}`).digest("hex").slice(0,24);
  const entries = await changeFeedback(id,{id, jobId, direction, title:job.title, company:job.company, reason});
  return Response.json({ entries });
});
export const DELETE = route(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[a-f0-9]{24}$/.test(id)) return badRequest("无效的反馈记录");
  return Response.json({ entries: await changeFeedback(id) });
});
