import { route } from "@/lib/api";
import { connectMailbox, publicMailSettings } from "@/lib/email/settings";
export const GET=route(async()=>Response.json(await publicMailSettings()));
export const POST=route(async(req:Request)=>Response.json(await connectMailbox(await req.json())));
