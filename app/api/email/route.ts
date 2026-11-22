import { getMailSettings } from "@/lib/email/settings";
import { route } from "@/lib/api";
import { createDraft } from "@/lib/email/service";
import { listResumeVersions, getJobs, listRuns } from "@/lib/store";
export const GET = route(async () => Response.json({ jobs: Object.values(await getJobs()), versions: await listResumeVersions(), runs: (await listRuns()).filter(r => r.channel === "email"), configured: Boolean(await getMailSettings()) }));
export const POST = route(async (req: Request) => Response.json({ run: await createDraft(await req.json()) }));
