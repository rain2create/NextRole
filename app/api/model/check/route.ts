import { z } from "zod";
import { badRequest, route } from "@/lib/api";
import { keyIssue, structured } from "@/lib/ai";
import { config } from "@/lib/config";

export const POST = route(async () => {
  const issue = keyIssue();
  if (issue) return badRequest(issue);
  await structured({
    schema: z.object({ status: z.literal("ok") }), name: "connection_check",
    instructions: 'Return a JSON object with status equal to "ok".', input: "Connection test.",
  });
  return Response.json({ model: config.model(), ok: true });
});
