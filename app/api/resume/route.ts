import { badRequest, route } from "@/lib/api";
import { uploadResume, uploadResumeText } from "@/lib/resume/service";

export const POST = route(async (req: Request) => {
  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.text !== "string" || !body.text.trim()) return badRequest("请粘贴简历正文。");
    if (body.text.length > 30000) return badRequest("简历正文请控制在 30,000 字符以内。");
    return Response.json(await uploadResumeText(body.text.trim()));
  }
  const form = await req.formData();
  const file = form.get("resume");
  if (!(file instanceof File)) return badRequest("Choose a PDF or DOCX file.");
  const { profile, version } = await uploadResume(Buffer.from(await file.arrayBuffer()), file.name, file.type);
  return Response.json({ profile, version });
}, "We couldn't read that resume. Try a text-based PDF or DOCX.");
