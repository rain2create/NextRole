import { test, expect } from "@playwright/test";
import { mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { trackingService } from "../lib/tracking/service";
import { exportCsv } from "../lib/tracking/export";
import type { ApplicationRun } from "../lib/types";
async function setup() { const file=path.join(await mkdtemp(path.join(tmpdir(),"roleflow-tracking-")),"records.json");return {file,service:trackingService(file)}; }
function run(id: string,status: ApplicationRun["status"]="submitted"): ApplicationRun {
  return {id,jobId:"job-1",job:{title:"开发工程师",company:"示例公司",location:"上海",url:"https://example.com/job",source:"web"},
    resumeVersionId:"resume-"+id,autoSubmit:false,status,pending:null,currentUrl:"",steps:2,events:[],usage:{inputTokens:0,outputTokens:0,modelCalls:0},createdAt:"2026-11-18T10:00:00Z",updatedAt:"2026-11-18T10:01:00Z"};
}
test("manual lifecycle persists, records history and preserves cumulative counts",async()=>{
  const {file,service:s}=await setup();
  const a=await s.create({company:"中文公司",role:"开发",status:"applied"});
  expect(a.appliedAt).toBe("");
  const b=await s.patch(a.id,{revision:a.revision,status:"interviewing",notes:"准备二面"});
  const c=await s.patch(a.id,{revision:b.revision,status:"offer"});
  await s.patch(a.id,{revision:c.revision,status:"withdrawn"});
  expect((await trackingService(file).list({})).summary).toEqual({applied:1,interviewing:0,offers:1});
  expect((await s.get(a.id)).history).toHaveLength(4);
  expect((await s.get(a.id)).notes).toBe("准备二面");
});
test("concurrent updates reject stale revisions without overwriting the winner",async()=>{
  const {service:s}=await setup();const a=await s.create({company:"A",role:"B"});
  const results=await Promise.allSettled([s.patch(a.id,{revision:1,notes:"first"}),s.patch(a.id,{revision:1,notes:"second"})]);
  expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  expect((await s.get(a.id)).notes).toBe("first");
});
test("sync is idempotent, associates retries and never regresses manual progress",async()=>{
  const {service:s}=await setup();
  expect(await s.sync([run("failed","failed"),run("waiting","awaiting_approval")])).toEqual({changed:0});
  expect(await s.sync([run("failed","failed"),run("success")])).toEqual({changed:1});
  let record=(await s.list({})).records[0];expect(record.runIds).toContain("failed");
  record=await s.patch(record.id,{revision:record.revision,status:"interviewing"});
  expect(await s.sync([run("success")])).toEqual({changed:0});
  await s.sync([run("success-2")]);
  const list=await s.list({});expect(list.total).toBe(1);expect(list.records[0].status).toBe("interviewing");
  expect(list.summary.applied).toBe(1);expect(list.records[0].resumeVersionId).toBe("resume-success");
});
test("archive restore, pagination and filtered exports use the correct scope",async()=>{
  const {service:s}=await setup();
  await Promise.all(Array.from({length:23},(_,i)=>s.create({company:"公司"+i,role:"开发",status:"applied"})));
  const first=await s.list({});expect(first.records).toHaveLength(20);expect(first.total).toBe(23);
  expect((await s.list({page:2})).records).toHaveLength(3);
  const record=first.records[0];const archived=await s.patch(record.id,{revision:1,archived:true});
  expect((await s.list({})).total).toBe(22);expect((await s.list({archived:"archived"})).total).toBe(1);
  await s.patch(record.id,{revision:archived.revision,archived:false});
  expect((await s.list({q:record.company})).all.some(r=>r.id===record.id)).toBe(true);
});
test("corrupt storage is reported and never silently replaced",async()=>{
  const {file,service:s}=await setup();await writeFile(file,"broken");
  await expect(s.create({company:"A",role:"B"})).rejects.toThrow("原文件未被覆盖");
  expect(await readFile(file,"utf8")).toBe("broken");
});
test("invalid inputs are rejected and CSV escapes spreadsheet content",async()=>{
  const {service:s}=await setup();
  await expect(s.create({company:"A",role:"B",url:"javascript:alert(1)"})).rejects.toThrow();
  await expect(s.create({company:"",role:"B"})).rejects.toThrow();
  const a=await s.create({company:'=FORMULA',role:'中文,"岗位"',notes:"第一行\n第二行"});
  const csv=exportCsv([a]);expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('"\'=FORMULA"');expect(csv).toContain('中文,""岗位""');expect(csv).toContain("第一行\n第二行");
});

test("partial note and archive updates preserve every omitted application field", async () => {
  const { service: s } = await setup();
  const details = {
    company: "示例科技", role: "后端工程师", location: "上海", url: "https://example.com/job",
    status: "interviewing", appliedAt: "2026-11-18T10:00:00Z", resumeVersionId: "resume-existing",
    interviewAt: "2026-11-25T09:00:00Z", interviewRound: "二面", interviewLocation: "线上会议",
    notes: "原始备注",
  };
  const created = await s.create(details);
  const edited = await s.patch(created.id, { revision: created.revision, notes: "补充准备内容" });
  expect(edited).toMatchObject({ ...details, notes: "补充准备内容" });
  const archived = await s.patch(created.id, { revision: edited.revision, archived: true });
  expect(archived).toMatchObject({ ...details, notes: "补充准备内容" });
  expect(archived.archivedAt).not.toBeNull();
  const restored = await s.patch(created.id, { revision: archived.revision, archived: false });
  expect(restored).toMatchObject({ ...details, notes: "补充准备内容", archivedAt: null });
});
