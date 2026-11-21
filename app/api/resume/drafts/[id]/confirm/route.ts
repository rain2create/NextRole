import { z } from "zod";
import { badRequest, route } from "@/lib/api";
import { UserFacingError } from "@/lib/ai";
import { confirmResumeTranslation } from "@/lib/resume/service";

const schema = z.object({ translations: z.record(z.string(), z.string().trim().min(1).max(500)) }).strict();

export const POST = route(async (req: Request, ctx: RouteContext<"/api/resume/drafts/[id]/confirm">) => {
  const input = schema.safeParse(await req.json().catch(() => null));
  if (!input.success) return badRequest("请确认每个专有名词的英文译法，单项最多 500 字符。");
  try {
    return Response.json(await confirmResumeTranslation((await ctx.params).id, input.data.translations));
  } catch (error) {
    if (error instanceof UserFacingError) return badRequest(error.message);
    throw error;
  }
}, "英文译名确认失败，请重试。");
