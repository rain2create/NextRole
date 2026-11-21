import { badRequest, route } from "@/lib/api";
import { discover, discoverySchema } from "@/lib/jobs/discovery";

export const POST = route(async (req:Request) => {
  const input = discoverySchema.safeParse(await req.json());
  if (!input.success) return badRequest(input.error.issues[0].message);
  return Response.json(await discover(input.data));
});
