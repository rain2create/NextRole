"use client";
import { Search, Sparkles, Undo2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { degrees, fields, type Criteria } from "@/lib/jobs/criteria";
import type { SearchFeedback } from "@/lib/store";
import type { Job } from "@/lib/types";
import { api, errorText } from "./api";
import { Button, Field, inputCls, Notice } from "./ui";

type Direction = { title: string; evidence: string; gap: string };
const num = (s: string) => s === "" ? undefined : Number(s);
const initial: Criteria = { currency:"CNY", period:"月", payKind:"不限", must:[], confirmedOnly:false };

export function SearchPanel({ defaultLocation, hasResume, aiReady, profileLoaded, onResults, onImported }: {
  profileLoaded:boolean;
  defaultLocation:string; hasResume:boolean; aiReady:boolean;
  onResults:(jobs:Job[], errors:string[], query:string)=>void; onImported:(job:Job)=>void;
}) {
  const [query,setQuery] = useState(""), [location,setLocation] = useState<string|null>(null);
  const [criteria,setCriteria] = useState<Criteria>(initial), [web,setWeb] = useState<boolean|null>(null), [linkedin,setLinkedin] = useState(true);
  const [directions,setDirections] = useState<Direction[]>([]), [chosen,setChosen] = useState<string[]>([]);
  const [stripe,setStripe] = useState(true);
  const [zhaopin,setZhaopin] = useState(false);
  const [busy,setBusy] = useState(""), [error,setError] = useState("");
  const [feedback,setFeedback] = useState<SearchFeedback[]>([]);
  const loc = location ?? defaultLocation, queries = query.trim() ? [query.trim()] : chosen;
  const update = <K extends keyof Criteria>(key:K, value:Criteria[K]) => setCriteria(c=>({...c,[key]:value}));
  useEffect(() => {
    const refresh = () => api<{entries:SearchFeedback[]}>("/api/jobs/feedback").then(r=>setFeedback(r.entries)).catch(e=>setError(errorText(e)));
    void refresh();
    window.addEventListener("job-feedback",refresh);
    return () => window.removeEventListener("job-feedback",refresh);
  },[]);
  const search = async (event:FormEvent) => {
    event.preventDefault(); setError("");
    if (!queries.length && !hasResume) { setError("请填写目标岗位，或先上传简历后获取推荐。"); return; }
    if (queries.length && !linkedin && !stripe && !zhaopin && !(aiReady && (web??true))) { setError("请至少选择一个来源"); return; }
    setBusy(queries.length ? "搜索中" : "正在评估简历");
    try {
      if (!queries.length) {
        const r = await api<{directions:Direction[]}>("/api/jobs/directions",{method:"POST"});
        setDirections(r.directions); return;
      }
      const jobs:Job[] = [], errors:string[] = [];
      for (const q of queries) {
        const r = await api<{jobs:Job[];errors:string[]}>("/api/jobs/discover",{json:{query:q,location:loc,criteria,sources:{web:aiReady && (web??true),linkedin,stripe,zhaopin}}});
        jobs.push(...r.jobs); errors.push(...r.errors.map(e=>`${q}：${e}`));
        if (!r.jobs.length && queries.length>1 && !r.errors.length) errors.push(`${q}：无符合条件的结果`);
      }
      onResults(jobs,errors,queries.join(" / "));
    } catch(e) { setError(errorText(e)); } finally { setBusy(""); }
  };
  const importJob = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy("导入中"); setError("");
    try {
      const {job} = await api<{job:Job}>("/api/jobs/import",{json:values});
      onImported(job); form.reset();
    } catch(e) { setError(errorText(e)); } finally { setBusy(""); }
  };
  const undo = async (id:string) => {
    try { setFeedback((await api<{entries:SearchFeedback[]}>(`/api/jobs/feedback?id=${id}`,{method:"DELETE"})).entries); }
    catch(e) { setError(errorText(e)); }
  };
  const select = (label:string, options:readonly string[], value:string|undefined, change:(v:string)=>void, optional=true) =>
    <Field label={label}><select className={inputCls} value={value??""} onChange={e=>change(e.target.value)}>
      {optional && <option value="">不限</option>}{options.map(o=><option key={o}>{o}</option>)}
    </select></Field>;
  return <section id="search" className="mx-auto max-w-4xl scroll-mt-6 py-8">
    <h1 className="mb-5 text-2xl font-semibold">岗位搜索</h1>
    <form onSubmit={search} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <Field label="目标岗位"><input className={inputCls} value={query} maxLength={180} placeholder="例如：算法工程师；留空从简历推荐" onChange={e=>setQuery(e.target.value)} /></Field>
        <Field label="地点"><input className={inputCls} value={loc} placeholder="不限" maxLength={180} onChange={e=>setLocation(e.target.value)} /></Field>
        <Button type="submit" disabled={!queries.length && !profileLoaded} busy={!!busy}>{queries.length ? <Search size={16}/> : <Sparkles size={16}/>} {busy || (queries.length?"搜索岗位":"推荐方向")}</Button>
      </div>
      {!query.trim() && directions.length>0 && <fieldset className="grid gap-2"><legend className="text-sm font-medium">确认搜索方向</legend>
        {directions.map(d=><label key={d.title} className="flex items-start gap-2 border-b border-line py-2 text-sm">
          <input type="checkbox" className="mt-1" checked={chosen.includes(d.title)} onChange={e=>setChosen(a=>e.target.checked?[...a,d.title]:a.filter(t=>t!==d.title))}/>
          <span><b>{d.title}</b><span className="block">依据：{d.evidence}</span><span className="block text-muted">待确认：{d.gap}</span></span>
        </label>)}</fieldset>}
      <div className="flex flex-wrap gap-4 text-sm">
        <label title={aiReady ? undefined : "需要千问应用密钥并启用 QWEN_WEB_SEARCH"}><input type="checkbox" disabled={!aiReady} checked={aiReady && (web??true)} onChange={e=>setWeb(e.target.checked)}/> 企业招聘页</label>
        <label><input type="checkbox" checked={linkedin} onChange={e=>setLinkedin(e.target.checked)}/> LinkedIn 公开职位</label>
        <label><input type="checkbox" checked={stripe} onChange={e=>setStripe(e.target.checked)}/> Stripe 职位板（Greenhouse）</label>
        <label><input type="checkbox" checked={zhaopin} onChange={e=>setZhaopin(e.target.checked)}/> 智联招聘（API.SH，1 credit/方向）</label>
      </div>
      <details className="border-y border-line py-3"><summary className="cursor-pointer font-medium">搜索条件</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="我的相关工龄（年）"><input className={inputCls} type="number" min={0} max={70} step="0.5" value={criteria.years??""} onChange={e=>update("years",num(e.target.value))}/></Field>
          {select("我的最高学历",degrees,criteria.degree,v=>update("degree",v as Criteria["degree"] || undefined))}
          {select("工作类型",["全职","兼职","实习","合同"],criteria.work,v=>update("work",v as Criteria["work"] || undefined))}
          <Field label="可接受薪资下限"><input className={inputCls} type="number" min={1} value={criteria.min??""} onChange={e=>update("min",num(e.target.value))}/></Field>
          <Field label="期望薪资上限"><input className={inputCls} type="number" min={criteria.min??1} value={criteria.max??""} onChange={e=>update("max",num(e.target.value))}/></Field>
          {select("薪资币种",["CNY","USD"],criteria.currency,v=>update("currency",v as Criteria["currency"]),false)}
          {select("薪资周期",["月","年"],criteria.period,v=>update("period",v as Criteria["period"]),false)}
          {select("薪资口径",["不限","底薪","总包"],criteria.payKind,v=>update("payKind",v as Criteria["payKind"]),false)}
          {select("办公方式",["现场","远程","混合"],criteria.mode,v=>update("mode",v as Criteria["mode"] || undefined))}
          <Field label="发布日期"><select className={inputCls} value={criteria.days??""} onChange={e=>update("days",num(e.target.value))}><option value="">不限</option><option value="1">最近一天</option><option value="7">最近一周</option><option value="30">最近一个月</option></select></Field>
        </div>
        <fieldset className="mt-4 flex flex-wrap gap-3 text-sm"><legend className="mb-2 font-medium">必须满足（其余条件优先排序）</legend>
          {fields.map(f=><label key={f}><input type="checkbox" checked={criteria.must.includes(f)} onChange={e=>update("must",e.target.checked?[...criteria.must,f]:criteria.must.filter(x=>x!==f))}/> {f}</label>)}
        </fieldset>
        <label className="mt-3 block text-sm"><input type="checkbox" checked={criteria.confirmedOnly} onChange={e=>update("confirmedOnly",e.target.checked)}/> 只看所有条件已确认符合的岗位</label>
      </details>
    </form>
    <details className="border-b border-line py-3"><summary className="cursor-pointer font-medium">导入岗位</summary>
      <form onSubmit={importJob} className="mt-3 grid gap-3">
        <Field label="岗位详情链接"><input className={inputCls} name="url" type="url" required maxLength={2048}/></Field>
        <Button type="submit" variant="secondary" disabled={!!busy} className="justify-self-start">导入</Button>
      </form>
    </details>
    <details className="border-b border-line py-3"><summary className="cursor-pointer font-medium">搜索反馈（{feedback.length}）</summary>
      {!feedback.length && <p className="mt-2 text-sm text-muted">暂无反馈</p>}
      {feedback.map(e=><div className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm" key={e.id}>
        <span>{e.reason} · {e.company} · {e.title}（搜索：{e.direction}）</span><button type="button" title="撤销反馈" aria-label="撤销反馈" onClick={()=>void undo(e.id)}><Undo2 size={16}/></button>
      </div>)}
    </details>
    {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
  </section>;
}
