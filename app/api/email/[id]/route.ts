import { route } from "@/lib/api";
import { sendDraft } from "@/lib/email/service";
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const body = await req.json();
  return Response.json({ run: await sendDraft((await ctx.params).id, body.confirm === true) });
});
