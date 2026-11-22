import { badRequest, route } from "@/lib/api";
import { jobWithDetails } from "@/lib/jobs/details";
import { tailorForJob } from "@/lib/resume/service";
import { isResumeDirection } from "@/lib/resume/directions";
import { getProfile } from "@/lib/store";

export const POST = route(async (req: Request, ctx: RouteContext<"/api/jobs/[id]/tailor">) => {
  const body = await req.json().catch(() => ({}));
  if (body?.direction !== undefined && !isResumeDirection(body.direction)) return badRequest("请选择有效的修改方向。");
  const direction = body?.direction ?? (await getProfile()).resumeDirection;
  if (!direction) return badRequest("请先选择修改方向。");
  const job = await jobWithDetails((await ctx.params).id);
  if (!job) return badRequest("Job not found.", 404);
  if (!job.description?.trim()) return badRequest("该岗位没有可用的 JD。");
  const { version, gaps } = await tailorForJob(job, direction);
  return Response.json({ version, gaps });
}, "Resume tailoring failed. Please retry.");
