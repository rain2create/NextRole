import { z } from "zod";
import { badRequest, route } from "@/lib/api";
import { jobWithDetails } from "@/lib/jobs/details";
import { generateResume } from "@/lib/resume/service";
import { getProfile } from "@/lib/store";

const direction = z.enum(["general", "state_owned", "large_company", "foreign_company"]);
const requestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("direction"), direction }).strict(),
  z.object({ mode: z.literal("job"), direction, jobId: z.string().trim().min(1) }).strict(),
]);

export const POST = route(async (req: Request) => {
  const input = requestSchema.safeParse(await req.json().catch(() => null));
  if (!input.success) return badRequest("请选择修改方向；生成岗位专属版还需要选择目标岗位 JD。");
  const profile = await getProfile();
  if (!profile.resume || !profile.originalResumeId) return badRequest("请先上传或粘贴简历。");
  if (input.data.mode === "direction") return Response.json(await generateResume(input.data.direction));

  const job = await jobWithDetails(input.data.jobId);
  if (!job) return badRequest("目标岗位不存在，请重新选择。", 404);
  if (!job.description?.trim()) return badRequest("该岗位没有可用的 JD，请选择其他岗位或生成方向版。");
  return Response.json(await generateResume(input.data.direction, job));
}, "简历生成失败，请重试。");
