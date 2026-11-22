"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, CalendarDays, Download, Plus, RefreshCw, Search, Send, Sparkles } from "lucide-react";
import { Button, Field, inputCls, Notice } from "../_components/ui";
import { api, errorText } from "../_components/api";
import { statusLabels, statuses, type ApplicationRecord } from "@/lib/tracking/types";
import type { ApplicationRun } from "@/lib/types";
import { AppHeader } from "../_components/AppHeader";
import { ApplicationEditor } from "./editor";

type Result = { records: ApplicationRecord[]; total: number; page: number; pages: number; summary: { applied: number; interviewing: number; offers: number } };
const emptyQuery = { q: "", status: "", archived: "active", from: "", to: "", page: "1" };
export const displayDate = (value: string) => value ? new Date(value).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" }) : "—";
export function StatusBadge({ record }: { record: ApplicationRecord }) {
  const colors = { saved: "bg-slate-100 text-slate-600", applied: "bg-sky-50 text-sky-700", interviewing: "bg-amber-50 text-amber-800", offer: "bg-emerald-50 text-emerald-700", rejected: "bg-rose-50 text-rose-700", withdrawn: "bg-slate-100 text-slate-500" };
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold ${colors[record.status]}`}>{statusLabels[record.status]}</span>;
}
export default function TrackingPage() {
  const [query,setQuery] = useState(emptyQuery);
  const [ready,setReady] = useState(false);
  const [data,setData] = useState<Result | null>(null);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [loading,setLoading] = useState(false);
  const [syncing,setSyncing] = useState(false);
  const [editor,setEditor] = useState<{ record: ApplicationRecord | null; runs: ApplicationRun[] } | null>(null);
  const [opening,setOpening] = useState(false);
  const [activeRuns,setActiveRuns] = useState(0);
  const requestId = useRef(0);
  const tableScroll = useRef<HTMLDivElement>(null);
  const displayedParams = useRef("");
  useEffect(()=>{
    const read = () => {
      const p = new URLSearchParams(window.location.search);
      setQuery(Object.fromEntries(Object.entries(emptyQuery).map(([k,v])=>[k,p.get(k) ?? v])) as typeof emptyQuery);
      setReady(true);
    };
    read(); window.addEventListener("popstate",read);
    return ()=>window.removeEventListener("popstate",read);
  },[]);
  const params = new URLSearchParams(query).toString();
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const next = await api<Result>("/api/tracking?"+params);
      if(id===requestId.current){
        setData(next);setError("");
        if(displayedParams.current!==params){
          tableScroll.current?.scrollTo({top:0,behavior:"instant"});
          displayedParams.current=params;
        }
      }
    } catch(e){if(id===requestId.current)setError(errorText(e));}
    finally {if(id===requestId.current)setLoading(false);}
  },[params]);
  useEffect(()=>{
    if(!ready)return;
    window.history.replaceState(null,"","?"+params);
    void refresh();
    const timer=setInterval(()=>void refresh(),10000);
    return ()=>{clearInterval(timer);};
  },[ready,params,refresh]);
  useEffect(()=>{
    const check=()=>api<{applications: ApplicationRun[]}>("/api/applications").then(r=>setActiveRuns(r.applications.filter(x=>["running","needs_input","blocked","awaiting_approval"].includes(x.status)).length)).catch(()=>{});
    void check(); const timer=setInterval(()=>void check(),5000);return()=>clearInterval(timer);
  },[]);
  function filter(key: string, value: string){setQuery(q=>({...q,[key]:value,page:"1"}));}
  async function open(id: string){
    setOpening(true);
    try{setEditor(await api<{record: ApplicationRecord; runs: ApplicationRun[]}>("/api/tracking/"+id));}
    catch(e){setError(errorText(e));}finally{setOpening(false);}
  }
  async function sync(){
    setSyncing(true);
    try{const r=await api<{changed:number}>("/api/tracking/sync",{method:"POST"});setMessage(`同步完成，更新了 ${r.changed} 次投递结果。`);await refresh();}
    catch(e){setError(errorText(e));}finally{setSyncing(false);}
  }
  return <main className="app-shell">
    <AppHeader active="tracking" />
    <div className="pt-8">
      {activeRuns>0 && <div className="mb-5"><Notice><Link href="/app#agent">有 {activeRuns} 个申请任务正在运行或等待操作，点击返回查看 →</Link></Notice></div>}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-2 text-xs font-semibold tracking-widest text-accent">申请总览</p><h1 className="text-3xl font-semibold tracking-tight">申请管理</h1><p className="mt-2 text-sm text-muted">每一次投递，每一步进展，都在这里。</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={sync} busy={syncing}><RefreshCw size={15}/>同步投递记录</Button>
          <a href={"/api/tracking/export?"+params} className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-white px-4 py-2.5 text-sm font-semibold"><Download size={15}/>导出 CSV</a>
          <Button onClick={()=>setEditor({record:null,runs:[]})}><Plus size={16}/>新增申请</Button>
        </div>
      </div>
      <div className="tracking-stats mb-3 grid gap-4 sm:grid-cols-3">
        {[
          { label: "累计投递", count: data?.summary.applied, hint: "包括已进入面试和收到 Offer 的申请", Icon: Send, tone: "border-[#d5e8f4] bg-[#f0f8ff] text-[#39779c]" },
          { label: "面试中", count: data?.summary.interviewing, hint: "当前正在推进的面试", Icon: CalendarDays, tone: "border-[#d1eae1] bg-[#edf9f3] text-[#26775f]" },
          { label: "累计 Offer", count: data?.summary.offers, hint: "曾经获得 Offer 的申请", Icon: Sparkles, tone: "border-[#e2def3] bg-[#f6f3ff] text-[#7560a2]" },
        ].map(({ label, count, hint, Icon, tone }) => <article key={label} className={`rounded-2xl border p-5 ${tone}`}>
          <div className="flex items-center justify-between"><p className="text-sm font-medium">{label}</p><span className="rounded-xl bg-white/80 p-2"><Icon size={17} aria-hidden /></span></div>
          <p className="mb-3 mt-1 text-[36px] font-semibold tabular-nums tracking-tight">{count ?? "—"}</p>
          <p className="text-xs text-muted">{hint}</p>
        </article>)}
      </div>
      <p className="mb-6 text-xs text-muted">统计范围：{query.archived==="all"?"全部申请":query.archived==="archived"?"已归档申请":"未归档申请"}；不随关键词或状态筛选变化。面试与 Offer 由你手动更新。</p>
      {error && <div className="mb-4"><Notice tone="error">{error} <button className="underline" onClick={()=>void refresh()}>重试加载</button></Notice></div>}
      {message && <div className="mb-4" role="status"><Notice>{message}</Notice></div>}
      <section className="overflow-hidden surface rounded-2xl border border-line bg-white">
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <div className="min-w-[180px] flex-1"><Field label="公司或岗位"><div className="relative"><Search className="absolute left-3 top-3 text-muted" size={16}/><input aria-label="搜索公司或岗位" className={inputCls+" pl-9"} placeholder="搜索公司或岗位…" value={query.q} onChange={e=>filter("q",e.target.value)}/></div></Field></div>
          <Field label="申请状态"><select className={inputCls} value={query.status} onChange={e=>filter("status",e.target.value)}><option value="">全部状态</option>{statuses.map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}</select></Field>
          <Field label="记录范围"><select className={inputCls} value={query.archived} onChange={e=>filter("archived",e.target.value)}><option value="active">未归档</option><option value="archived">已归档</option><option value="all">全部记录</option></select></Field>
          <Field label="投递日期从（UTC）"><input type="date" className={inputCls} value={query.from} onChange={e=>filter("from",e.target.value)}/></Field>
          <Field label="至"><input type="date" className={inputCls} value={query.to} onChange={e=>filter("to",e.target.value)}/></Field>
          <button className="pb-3 text-sm text-accent" onClick={()=>setQuery(emptyQuery)}>清空筛选</button>
        </div>
        <div ref={tableScroll} role="region" aria-label="申请记录，可上下滚动" tabIndex={0} className="max-h-[clamp(18rem,42dvh,36rem)] overflow-auto overscroll-contain [scrollbar-gutter:stable] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2" aria-busy={loading || opening}>
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="text-xs text-muted"><tr>{["公司 / 岗位","地点","投递时间","状态","下次面试","简历","操作"].map(t=><th key={t} scope="col" className="sticky top-0 z-10 bg-paper px-5 py-3 font-medium shadow-[inset_0_-1px_0_#e2e8f0]">{t}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{data?.records.map(r=><tr key={r.id} className="hover:bg-paper">
              <td className="max-w-[300px] px-5 py-4"><button onClick={()=>void open(r.id)} className="text-left hover:text-accent"><span className="block break-words font-semibold">{r.company}</span><span className="mt-1 block break-words text-xs text-muted">{r.role}</span></button></td>
              <td className="px-5 py-4 text-muted">{r.location||"—"}</td><td className="px-5 py-4 text-xs text-muted">{displayDate(r.appliedAt)}</td>
              <td className="px-5 py-4"><StatusBadge record={r}/>{r.archivedAt&&<span className="mt-1 block text-xs text-muted">已归档</span>}</td>
              <td className="px-5 py-4 text-xs">{r.status==="interviewing"?displayDate(r.interviewAt):"—"}</td>
              <td className="px-5 py-4">{r.resumeVersionId?<a target="_blank" rel="noreferrer" className="text-accent" href={"/api/resume/"+encodeURIComponent(r.resumeVersionId)}>查看</a>:"—"}</td>
              <td className="px-5 py-4"><button disabled={opening} className="whitespace-nowrap text-accent disabled:opacity-50" onClick={()=>void open(r.id)}>查看 / 更新</button></td>
            </tr>)}</tbody>
          </table>
          {!data && !error && <p className="py-16 text-center text-sm text-muted">正在加载申请记录…</p>}
          {data?.records.length===0 && <div className="px-6 py-16 text-center"><BriefcaseBusiness size={32} className="mx-auto mb-4 text-muted"/><p className="font-medium">暂时没有符合条件的申请</p><p className="mt-2 text-sm text-muted">新增一条手动申请，或同步已有的 自动投递记录。</p></div>}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 text-xs text-muted"><span>共 {data?.total??0} 条 · 每页 20 条 · 表内可上下滚动 {loading?"· 更新中…":""}</span><div className="flex items-center gap-4"><button disabled={!data||data.page<=1||loading} className="disabled:opacity-40" onClick={()=>setQuery(q=>({...q,page:String((data?.page??1)-1)}))}>上一页</button><span>{data?.page??1} / {data?.pages??1}</span><button disabled={!data||data.page>=data.pages||loading} className="disabled:opacity-40" onClick={()=>setQuery(q=>({...q,page:String((data?.page??1)+1)}))}>下一页</button></div></footer>
      </section>
      <p className="mt-5 text-xs text-muted">数据保存在本机。申请状态与自动填表运行状态分别记录。</p>
    </div>
    {editor && <ApplicationEditor record={editor.record} runs={editor.runs} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);setMessage("申请记录已保存。");void refresh();}}/>}
  </main>;
}
