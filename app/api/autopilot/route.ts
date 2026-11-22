import { badRequest, route } from "@/lib/api";
import { autopilotState, startAutopilot, stopAutopilot, type AutopilotInput } from "@/lib/agent/autopilot";
import { isResumeDirection } from "@/lib/resume/directions";
import { getProfile } from "@/lib/store";

export const GET = route(async () => Response.json({ autopilot: autopilotState() }));

export const POST = route(async (req: Request) => {
  const body = (await req.json()) as { action?: string } & Partial<AutopilotInput>;
  if (body.action === "stop") return Response.json({ autopilot: stopAutopilot() });
  if (body.action !== "start") return badRequest("Unknown action.");
  if (body.direction !== undefined && !isResumeDirection(body.direction)) return badRequest("请选择有效的简历修改方向。");
  const direction = body.direction ?? (await getProfile()).resumeDirection ?? undefined;
  if ((body.tailor ?? true) && !direction) return badRequest("请先在简历区选择修改方向，再启动自动定制。");
  const autopilot = await startAutopilot({
    query: body.query?.trim() || "",
    location: body.location?.trim() || "",
    limit: Math.min(Math.max(Number(body.limit) || 3, 1), 10),
    minFit: Math.min(Math.max(Number(body.minFit ?? 65) || 0, 0), 95),
    sources: body.sources ?? { linkedin: true, web: true },
    easyApplyOnly: body.easyApplyOnly ?? true,
    tailor: body.tailor ?? true,
    direction,
    autoSubmit: Boolean(body.autoSubmit),
  });
  return Response.json({ autopilot });
}, "Couldn't start autopilot.");
