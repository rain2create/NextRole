import { route } from "@/lib/api";
import { prepareEmail } from "@/lib/email/prepare";
export const POST = route(async(req:Request)=>Response.json(await prepareEmail(await req.formData())),"Could not prepare the application email. Check the source and try again.");
