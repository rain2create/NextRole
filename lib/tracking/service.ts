import { randomUUID } from "crypto";
import { dataPath } from "../config";
import type { ApplicationRun } from "../types";
import { trackingStore } from "./store";
import { fields, patchSchema, querySchema } from "./schemas";
import { statusLabels, type ApplicationRecord, type ApplicationStatus } from "./types";

export class TrackingError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const confirmsApplied = (status: ApplicationStatus) => ["applied", "interviewing", "offer", "rejected"].includes(status);
export function trackingService(file = dataPath("application-records.json")) {
  const store = trackingStore(file);
  const now = () => new Date().toISOString();
  async function create(input: unknown) {
    const data = fields.parse(input);
    return store.update(records => {
      const at = now();
      const record: ApplicationRecord = {
        ...data, id: randomUUID(), source: "manual", runIds: [], revision: 1, archivedAt: null,
        everApplied: confirmsApplied(data.status) || Boolean(data.appliedAt), everOffer: data.status === "offer",
        createdAt: at, updatedAt: at,
        history: [{ id: randomUUID(), at, source: "manual", label: "手动新增申请", toStatus: data.status }],
      };
      records.push(record);
      return record;
    });
  }
  async function patch(id: string, input: unknown) {
    const { revision, archived, ...changes } = patchSchema.parse(input);
    return store.update(records => {
      const record = records.find(r => r.id === id);
      if (!record) throw new TrackingError("申请不存在", 404);
      if (record.revision !== revision) throw new TrackingError("记录已被更新，请关闭详情并重新打开后再修改。", 409);
      const previous = record.status;
      const at = now();
      Object.assign(record, changes);
      if (archived !== undefined) record.archivedAt = archived ? at : null;
      record.everApplied ||= confirmsApplied(record.status) || Boolean(record.appliedAt);
      record.everOffer ||= record.status === "offer";
      record.history.push({
        id: randomUUID(), at, source: "manual", fromStatus: previous, toStatus: record.status,
        label: archived !== undefined ? (archived ? "归档申请" : "恢复申请") :
          previous !== record.status ? statusLabels[previous] + " → " + statusLabels[record.status] : "更新申请详情",
      });
      record.revision++; record.updatedAt = at;
      return record;
    });
  }
  async function sync(runs: ApplicationRun[]) {
    return store.update(records => {
      let changed = 0;
      for (const run of [...runs].sort((a,b) => a.createdAt.localeCompare(b.createdAt))) {
        if (run.status !== "submitted" && run.status !== "awaiting_approval") continue;
        const submitted = run.status === "submitted";
        const label = submitted ? "Agent 报告提交成功" : "已填写／邮件已备好，待确认投递";
        let record = records.find(r => r.runIds.includes(run.id) || r.jobId === run.jobId);
        if (record?.history.some(e => e.runId === run.id && e.label === label)) continue;
        const at = now();
        if (!record) {
          record = {
            id: randomUUID(), jobId: run.jobId, company: run.job.company, role: run.job.title,
            location: run.job.location, url: run.job.url, status: submitted ? "applied" : "saved", source: "agent",
            appliedAt: submitted ? run.updatedAt : "", resumeVersionId: run.resumeVersionId, runIds: [],
            everApplied: submitted, everOffer: false, interviewAt: "", interviewRound: "", interviewLocation: "", notes: "",
            revision: 0, archivedAt: null, createdAt: at, updatedAt: at, history: [],
          };
          records.push(record);
        }
        const previous = record.status;
        if (submitted) {
          if (record.status === "saved") record.status = "applied";
          record.everApplied = true;
          record.appliedAt ||= run.updatedAt;
        }
        record.resumeVersionId ||= run.resumeVersionId;
        record.runIds = [...new Set([...record.runIds, ...runs.filter(r => r.jobId === run.jobId).map(r => r.id)])];
        record.history.push({ id: randomUUID(), at, source: "agent", label,
          fromStatus: previous, toStatus: record.status, runId: run.id });
        record.updatedAt = at; record.revision++; changed++;
      }
      return { changed };
    });
  }
  async function get(id: string) {
    const record = (await store.read()).find(r => r.id === id);
    if (!record) throw new TrackingError("申请不存在", 404);
    return record;
  }
  async function list(input: unknown) {
    const query = querySchema.parse(input);
    const scope = (await store.read()).filter(r => query.archived === "all" || (query.archived === "archived" ? Boolean(r.archivedAt) : !r.archivedAt));
    const q = query.q.trim().toLocaleLowerCase();
    const filtered = scope.filter(r =>
      (!q || (r.company + " " + r.role).toLocaleLowerCase().includes(q)) &&
      (!query.status || r.status === query.status) &&
      (!query.from || Boolean(r.appliedAt) && r.appliedAt.slice(0,10) >= query.from) &&
      (!query.to || Boolean(r.appliedAt) && r.appliedAt.slice(0,10) <= query.to)
    ).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    const pages = Math.max(1, Math.ceil(filtered.length / 20));
    const page = Math.min(query.page, pages);
    return { records: filtered.slice((page-1)*20,page*20), all: filtered, total: filtered.length, page, pages,
      summary: { applied: scope.filter(r=>r.everApplied).length, interviewing: scope.filter(r=>r.status==="interviewing").length, offers: scope.filter(r=>r.everOffer).length } };
  }
  return { create, patch, sync, get, list };
}
export const syncApplicationRun = (run: ApplicationRun) => trackingService().sync([run]);
