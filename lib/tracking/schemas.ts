import { z } from "zod";
import { statuses } from "./types";
const date = z.union([z.literal(""), z.string().datetime({ offset: true })]);
const url = z.string().trim().max(2000).refine(v => !v || /^https?:\/\//i.test(v) && URL.canParse(v), "链接须为 http 或 https 地址");
const fieldSchemas = {
  company: z.string().trim().min(1, "请填写公司").max(200),
  role: z.string().trim().min(1, "请填写岗位").max(200),
  location: z.string().trim().max(200), url,
  status: z.enum(statuses), appliedAt: date,
  resumeVersionId: z.string().max(100),
  interviewAt: date, interviewRound: z.string().trim().max(100),
  interviewLocation: z.string().trim().max(1000), notes: z.string().max(10000),
};
export const fields = z.object({
  ...fieldSchemas,
  location: fieldSchemas.location.default(""), url: fieldSchemas.url.default(""),
  status: fieldSchemas.status.default("saved"), appliedAt: fieldSchemas.appliedAt.default(""),
  resumeVersionId: fieldSchemas.resumeVersionId.default(""),
  interviewAt: fieldSchemas.interviewAt.default(""), interviewRound: fieldSchemas.interviewRound.default(""),
  interviewLocation: fieldSchemas.interviewLocation.default(""), notes: fieldSchemas.notes.default(""),
}).strict();
// Partial updates must not apply creation defaults to omitted fields.
export const patchSchema = z.object(fieldSchemas).partial().extend({
  revision: z.number().int().positive(), archived: z.boolean().optional(),
}).strict();
export type CreateInput = z.infer<typeof fields>;
export type PatchInput = z.infer<typeof patchSchema>;
export const recordSchema = fields.extend({
  id: z.string(), jobId: z.string().optional(), source: z.enum(["manual", "agent"]),
  everApplied: z.boolean(), everOffer: z.boolean(), runIds: z.array(z.string()),
  revision: z.number().int().positive(), archivedAt: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
  history: z.array(z.object({
    id: z.string(), at: z.string(), source: z.enum(["manual", "agent"]), label: z.string(),
    fromStatus: z.enum(statuses).optional(), toStatus: z.enum(statuses).optional(), runId: z.string().optional(),
  })),
});
export const querySchema = z.object({
  q: z.string().max(200).default(""), status: z.enum([...statuses, ""]).default(""),
  archived: z.enum(["active", "archived", "all"]).default("active"),
  from: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).default(""),
  to: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).default(""),
  page: z.coerce.number().int().min(1).default(1),
});
