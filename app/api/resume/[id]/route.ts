import { promises as fs } from "fs";
import path from "path";
import type { NextRequest } from "next/server";
import { badRequest, route } from "@/lib/api";
import { getResumeVersion, listRuns, removeResumeVersion, resumeFilePath } from "@/lib/store";
import { contentDisposition } from "@/lib/http-files";
import { autopilotState } from "@/lib/agent/autopilot";
import { hasActiveRun } from "@/lib/agent/runner";

const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/resume/[id]">) => {
  const version = await getResumeVersion((await ctx.params).id, true);
  if (!version) return badRequest("Resume version not found.", 404);
  const wantCover = req.nextUrl.searchParams.get("file") === "cover";
  const name = wantCover ? version.coverLetterFile : version.fileName;
  if (!name) return badRequest("No cover letter for this version.", 404);
  const body = await fs.readFile(resumeFilePath(name));
  const download = req.nextUrl.searchParams.has("download");
  return new Response(body, {
    headers: {
      "Content-Type": TYPES[path.extname(name).toLowerCase()] || "application/octet-stream",
      "Content-Disposition": contentDisposition(name, download),
      "Cache-Control": "no-store",
    },
  });
});

export const DELETE = route(async (_req: NextRequest, ctx: RouteContext<"/api/resume/[id]">) => {
  const { id } = await ctx.params;
  const active = autopilotState()?.status;
  const pendingEmail = (await listRuns()).some(r => r.channel === "email" && r.resumeVersionId === id && r.status === "awaiting_approval");
  if (hasActiveRun() || active === "searching" || active === "running" || pendingEmail) {
    return badRequest("请先结束正在进行的投递，或处理引用该简历的待发送邮件，再移除简历。", 409);
  }
  if (!await removeResumeVersion(id)) return badRequest("Resume version not found.", 404);
  return Response.json({ removed: true });
});
