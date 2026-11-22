import { badRequest, route } from "@/lib/api";
import { browserStatus, checkManualLogin, closeAgentBrowser, startManualLogin } from "@/lib/agent/browser";
import { hasActiveRun } from "@/lib/agent/runner";
import { autopilotState } from "@/lib/agent/autopilot";

export const GET = route(async () => Response.json(await browserStatus()));

export const POST = route(async (req: Request) => {
  const { action } = (await req.json()) as { action?: string };
  const pilot = autopilotState();
  if (hasActiveRun() || pilot?.status === "running" || pilot?.status === "searching") {
    return badRequest("正在执行投递。请先完成或停止任务，再切换登录窗口。", 409);
  }
  if (action === "linkedin-login") {
    await startManualLogin();
    return Response.json(await browserStatus());
  }
  if (action === "check-login") {
    return Response.json(await checkManualLogin());
  }
  if (action === "close") {
    await closeAgentBrowser();
    return Response.json(await browserStatus());
  }
  return badRequest("Unknown action.");
}, "无法打开浏览器。请确认已安装 Chrome 或 Edge，且之前的 NextRole 登录窗口已关闭。");
