import { z } from "zod";
import { friendlyError } from "../ai";
import { getProfile, listSearchFeedback, saveJobs, type SearchFeedback } from "../store";
import { searchLinkedIn } from "./linkedin";
import { FetchError, fetchJson } from "./http";
import type { Job, Match } from "../types";
import { criteriaSchema, evaluate, normalize } from "./criteria";
import { analyzeMatch, quickFit } from "./match";
import { searchWebReport } from "./web";
import { fetchAtsJob } from "./ats";
import { searchZhaopin } from "./chinese-boards";

export const discoverySchema = z.object({
  query:z.string().trim().min(1,"请指定岗位或先选择简历推荐方向").max(180),
  location:z.string().trim().max(180).default(""),
  sources:z.object({web:z.boolean().default(false), linkedin:z.boolean().default(false), stripe:z.boolean().default(false), zhaopin:z.boolean().default(false)}).refine(s => Object.values(s).some(Boolean),"请至少选择一个来源"),
  criteria: criteriaSchema.default({}),
});
export function feedbackFor(job:Job, query:string, entries:SearchFeedback[]) {
  return entries.filter(e => e.reason === "公司" ? normalize(job.company) === normalize(e.company) :
    normalize(query) === normalize(e.direction) && (e.reason === "方向" ? normalize(job.title) === normalize(e.title) : e.jobId === job.id)).map(e => e.reason);
}
export function distinctJobs(jobs: Job[]) {
  const ids = new Set<string>(), links = new Set<string>();
  return jobs.filter(j => {
    let url = j.applyUrl || j.url;
    try {
      const u = new URL(url);
      u.hash = "";
      for (const key of [...u.searchParams.keys()]) if (/^(utm_|trk$|trackingId$)/i.test(key)) u.searchParams.delete(key);
      u.searchParams.sort(); url = u.toString().replace(/\/$/, "");
    } catch { /* fall back to exact string */ }
    if (ids.has(j.id) || links.has(url)) return false;
    ids.add(j.id); links.add(url); return true;
  });
}
const cache = new Map<string,{ expires:number; task:ReturnType<typeof searchWebReport> }>();
function careerSites(query:string, location:string) {
  const key = JSON.stringify([normalize(query),normalize(location)]), now = Date.now();
  for (const [k,v] of cache) if (v.expires < now) cache.delete(k);
  const existing = cache.get(key);
  if (existing) return existing.task;
  if (cache.size >= 50) cache.delete(cache.keys().next().value!);
  const task = searchWebReport(query,location).catch(e => ({jobs:[] as Job[], errors:[friendlyError(e,"企业招聘页搜索失败，请稍后重试")]}));
  cache.set(key,{expires:now+120000,task});
  return task;
}
export async function discover(input:z.infer<typeof discoverySchema>) {
  const {query,location,criteria:c,sources} = input;
  const [profile, entries, linkedin, online, board, zhaopin] = await Promise.all([
    getProfile(), listSearchFeedback(),
    sources.linkedin ? searchLinkedIn(query,location,{postedWithin:c.days===1?"day":c.days===7?"week":c.days===30?"month":"any"})
      .then(jobs=>({jobs,errors:[] as string[]})).catch((e:unknown)=>({jobs:[] as Job[],errors:[e instanceof FetchError && [403,429].includes(e.status)
        ? "LinkedIn 限流或拒绝访问，请稍后重试。" : e instanceof FetchError && e.status===451 ? "当前网络无法访问 LinkedIn（HTTP 451）。" : "LinkedIn 搜索失败，请检查网络或改用企业招聘页。"]})) : {jobs:[],errors:[]},
    sources.web ? careerSites(query,location) : {jobs:[],errors:[]},
    sources.stripe ? stripeJobs(query,location).then(jobs=>({jobs,errors:[] as string[]})).catch(()=>({jobs:[] as Job[],errors:["Stripe 公开职位板暂不可用。"]})) : {jobs:[],errors:[]},
    sources.zhaopin ? searchZhaopin(query,location) : {jobs:[],errors:[]},
  ]);
  const reports = [linkedin,online,board,zhaopin];
  const errors = reports.flatMap(r=>r.errors);
  const found = distinctJobs(reports.flatMap(r=>r.jobs));
  const assessed = new Map(found.map(j => [j.id,evaluate(j,c,location)]));
  const clean = found.filter(j => assessed.get(j.id)!.eligible).map(j => ({...j,quickFit:undefined,quickFitReason:undefined,searchView:undefined}));
  const initial = await quickFit(clean,profile);
  const prefs = (j:Job) => assessed.get(j.id)!.preference - feedbackFor(j,query,entries).length * 8;
  initial.sort((a,b) => prefs(b)-prefs(a) || (b.quickFit??0)-(a.quickFit??0));
  // Only enrich publicly exposed ATS records; pasted platform listings stay offline.
  for (const job of initial.slice(0,10)) {
    if (job.description || !["greenhouse","lever","ashby"].includes(job.source)) continue;
    try {
      const full = await fetchAtsJob(job.url);
      if (full) { Object.assign(job,full); assessed.set(job.id,evaluate(job,c,location)); }
    } catch { errors.push(`${job.title}：未取得完整职位描述`); }
  }
  const eligible = initial.filter(j=>assessed.get(j.id)!.eligible);
  const detailed = new Map<string,Match>();
  if (profile.resume) {
    const candidates = eligible.slice(0,10).filter(j => j.description?.trim());
    for (let i=0;i<candidates.length;i+=2) {
      const batch = candidates.slice(i,i+2);
      const out = await Promise.allSettled(batch.map(j => analyzeMatch(j,profile)));
      out.forEach((r,k) => { if(r.status === "fulfilled") detailed.set(batch[k].id,r.value); });
      if (out.every(r => r.status === "rejected")) break;
    }
    if (detailed.size < candidates.length) errors.push("部分岗位未完成简历精排，已保留条件筛选结果");
  }
  const score = (j:Job) => detailed.get(j.id)?.match_score ?? j.quickFit ?? -1;
  eligible.sort((a,b) => prefs(b)-prefs(a) || score(b)-score(a));
  // Persist source records, never a direction-specific ranking or someone else's fit.
  if (found.length) await saveJobs(found);
  const jobs: Job[] = eligible.map(j => ({...j, searchView:{ direction:query, checks:assessed.get(j.id)!.checks, match:detailed.get(j.id), feedback:feedbackFor(j,query,entries) }}));
  return { jobs, errors };
}

async function stripeJobs(query:string,location:string):Promise<Job[]> {
  const board=await fetchJson<{jobs:{id:number;title:string;location?:{name:string};first_published?:string}[]}>("https://boards-api.greenhouse.io/v1/boards/stripe/jobs");
  const terms=query.toLowerCase().trim().split(/\s+/);
  return board.jobs.filter(j=>terms.every(t=>j.title.toLowerCase().includes(t)) && (!location || j.location?.name.toLowerCase().includes(location.toLowerCase())))
    .slice(0,12).map(j=>{
      const url=`https://job-boards.greenhouse.io/stripe/jobs/${j.id}`;
      return {id:`gh-stripe-${j.id}`,source:"greenhouse",title:j.title,company:"Stripe",location:j.location?.name??"",url,applyUrl:url,postedAt:j.first_published,fetchedAt:new Date().toISOString()};
    });
}
