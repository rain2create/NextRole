import { badRequest, route } from "@/lib/api";
import { importJobFromUrl } from "@/lib/jobs/ats";
import { saveJobs } from "@/lib/store";

export const POST = route(async (req: Request) => {
  const body = await req.json();
  if (body?.mode === "manual") return badRequest("不再支持正文导入，请使用职位详情链接。");
  const url = body?.url;
  if (typeof url !== "string" || !url.trim()) return badRequest("Paste a job link.");
  try {
    if (/(^|\.)zhipin\.com$/i.test(new URL(url).hostname.replace(/\.$/,""))) return badRequest("不支持 BOSS 职位链接。");
  } catch { return badRequest("请输入有效的职位详情链接。"); }
  const [job] = await saveJobs([{ ...await importJobFromUrl(url), imported: true }]);
  return Response.json({ job });
}, "We couldn't load that job link.");
