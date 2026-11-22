import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getMailSettings, mailTransport } from "./settings";
import { z } from "zod";
import { dataPath } from "../config";
import { getJob, getResumeVersion, listRuns, resumeFilePath, saveRun } from "../store";
import { UserFacingError } from "../ai";
import type { ApplicationRun } from "../types";

export const draftSchema = z.object({ jobId: z.string().min(1), resumeVersionId: z.string().min(1),
  to: z.string().email(), subject: z.string().trim().min(1).max(200).refine(s => !/[\r\n]/.test(s)),
  body: z.string().trim().min(1).max(30000) }).strict();
const locks = new Set<string>();
export async function createDraft(input: unknown) {
  const data = draftSchema.parse(input);
  const job = await getJob(data.jobId), version = await getResumeVersion(data.resumeVersionId);
  if (!job || !version) throw new UserFacingError("Select an existing job and resume version.");
  const at = new Date().toISOString();
  const run: ApplicationRun = { id: randomUUID(), jobId: job.id, job, resumeVersionId: version.id,
    channel: "email", email: { ...data, delivery: "draft" }, autoSubmit: false, status: "awaiting_approval",
    pending: { type: "approval", summary: `Email to ${data.to}: ${data.subject}`, unresolved: [] },
    currentUrl: job.url, steps: 0, events: [], usage: { inputTokens: 0, outputTokens: 0, modelCalls: 0 }, createdAt: at, updatedAt: at };
  await saveRun(run); return run;
}
export async function sendDraft(id: string, confirm: boolean) {
  if (!confirm) throw new UserFacingError("Explicit confirmation is required.");
  if (locks.has(id)) throw new UserFacingError("This email is already being processed.");
  locks.add(id);
  try {
    const run = (await listRuns()).find(r => r.id === id);
    if (!run?.email || run.channel !== "email") throw new UserFacingError("Email draft not found.");
    if (run.email.delivery === "accepted") return run;
    if (run.email.delivery !== "draft") throw new UserFacingError("Delivery is uncertain or failed. Check your Sent mailbox before creating another draft.");
    const settings = await getMailSettings();
    if (!settings) throw new UserFacingError("Connect your mailbox in Email applications first.");
    const version = await getResumeVersion(run.resumeVersionId);
    if (!version) throw new UserFacingError("Resume version no longer exists.");
    const content = await fs.readFile(resumeFilePath(version.fileName));
    run.email.delivery = "sending"; run.status = "running"; run.updatedAt = new Date().toISOString();
    await saveRun(run);
    const transport = mailTransport(settings);
    try {
      const result = await transport.sendMail({ from: settings.from, to: run.email.to, subject: run.email.subject, text: run.email.body,
        attachments: [{ filename: path.basename(version.fileName), content, contentType: version.mimeType }] });
      if (!result.accepted.length || result.rejected.length) throw new Error("Recipient was not accepted");
      run.email.delivery = "accepted"; run.email.messageId = result.messageId;
      run.status = "submitted"; run.pending = null; run.updatedAt = new Date().toISOString();
      run.outcome = "SMTP server accepted the message; delivery and reading are not confirmed.";
    } catch {
      run.email.delivery = "unknown"; run.status = "blocked"; run.pending = null;
      run.outcome = "Email delivery could not be confirmed. Check Sent mail before retrying to avoid duplicates.";
    } finally { transport.close(); }
    run.updatedAt = new Date().toISOString();
    await saveRun(run); return run;
  } finally { locks.delete(id); }
}
