"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { api, errorText } from "../_components/api";
import { Button, Field, inputCls, Notice } from "../_components/ui";
import { statuses, statusLabels, type ApplicationRecord } from "@/lib/tracking/types";
import type { ApplicationRun, ResumeVersion } from "@/lib/types";

const localTime = (iso: string) => {
  if(!iso)return "";
  const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
};
const dateText=(s:string)=>new Date(s).toLocaleString("zh-CN");
export function ApplicationEditor({record,runs,onClose,onSaved}:{record:ApplicationRecord|null;runs:ApplicationRun[];onClose:()=>void;onSaved:()=>void}){
  const initial = {
    company:record?.company??"",role:record?.role??"",location:record?.location??"",url:record?.url??"",
    status:record?.status??"saved",appliedAt:localTime(record?.appliedAt??""),
    resumeVersionId:record?.resumeVersionId??"",interviewAt:localTime(record?.interviewAt??""),
    interviewRound:record?.interviewRound??"",interviewLocation:record?.interviewLocation??"",notes:record?.notes??"",
  };
  const [draft,setDraft]=useState(initial);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [versions,setVersions]=useState<ResumeVersion[]>([]);
  const dialog=useRef<HTMLDialogElement>(null);
  const dirty=JSON.stringify(draft)!==JSON.stringify(initial);
  useEffect(()=>{
    const element=dialog.current; element?.showModal();
    void api<{versions:ResumeVersion[]}>("/api/profile").then(r=>setVersions(r.versions)).catch(()=>{});
    return()=>element?.close();
  },[]);
  const close=()=>{if(!busy&&(!dirty||window.confirm("有未保存的修改，确定关闭吗？")))onClose();};
  async function save(archived?:boolean){
    setBusy(true);setError("");
    try{
      const body = archived===undefined ? {
        ...draft,
        appliedAt:draft.appliedAt?new Date(draft.appliedAt).toISOString():"",
        interviewAt:draft.interviewAt?new Date(draft.interviewAt).toISOString():"",
      } : {archived};
      await api(record?"/api/tracking/"+record.id:"/api/tracking",{
        method:record?"PATCH":"POST",json:{...body,...(record?{revision:record.revision}:{})},
      });onSaved();
    }catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  function input(key: keyof typeof draft,label:string,type="text"){
    return <Field label={label}><input required={key==="company"||key==="role"} maxLength={key==="url"?2000:undefined} type={type} className={inputCls} value={draft[key]} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}/></Field>;
  }
  return <dialog ref={dialog} aria-labelledby="application-title" onCancel={e=>{e.preventDefault();close();}} className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-2xl bg-white p-0 text-ink shadow-2xl backdrop:bg-black/30">
    <form onSubmit={e=>{e.preventDefault();void save();}} className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-6 py-5"><div><p className="text-xs text-muted">申请管理</p><h2 id="application-title" className="mt-1 text-xl font-semibold">{record?"申请详情":"新增申请"}</h2></div><button type="button" aria-label="关闭详情" onClick={close} disabled={busy} className="rounded-lg p-2 hover:bg-soft"><X size={20}/></button></header>
      <div className="flex-1 space-y-6 px-6 py-6">
        {error&&<Notice tone="error">{error}</Notice>}
        <section><h3 className="mb-4 font-semibold">基本信息</h3><div className="grid gap-4 sm:grid-cols-2">{input("company","公司 *")}{input("role","岗位 *")}{input("location","地点")}{input("url","职位链接","url")}</div>
          {record?.url&&/^https?:\/\//i.test(record.url)&&<a className="mt-3 inline-block text-sm text-accent" href={record.url} target="_blank" rel="noreferrer">打开原职位 ↗</a>}
        </section>
        <section className="border-t border-line pt-5"><h3 className="mb-4 font-semibold">申请进度</h3><div className="grid gap-4 sm:grid-cols-2">
          <Field label="当前状态"><select className={inputCls} value={draft.status} onChange={e=>setDraft(d=>({...d,status:e.target.value as typeof d.status}))}>{statuses.map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}</select></Field>
          {input("appliedAt","投递时间（未知可留空）","datetime-local")}
          {input("interviewRound","面试轮次")}{input("interviewAt","下次面试时间","datetime-local")}
          <div className="sm:col-span-2">{input("interviewLocation","面试地点 / 会议链接")}</div>
        </div><p className="mt-3 text-xs text-muted">时间按当前设备时区显示：{Intl.DateTimeFormat().resolvedOptions().timeZone}。面试和 Offer 需要人工更新。</p></section>
        <section className="border-t border-line pt-5"><h3 className="mb-4 font-semibold">申请材料与备注</h3>
          <Field label="关联简历"><select className={inputCls} value={draft.resumeVersionId} onChange={e=>setDraft(d=>({...d,resumeVersionId:e.target.value}))}><option value="">暂不关联</option>{draft.resumeVersionId&&!versions.some(v=>v.id===draft.resumeVersionId)&&<option value={draft.resumeVersionId}>已关联的历史版本</option>}{versions.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></Field>
          {draft.resumeVersionId&&<a target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-accent" href={"/api/resume/"+encodeURIComponent(draft.resumeVersionId)}>预览关联简历 ↗</a>}
          {versions.find(v=>v.id===draft.resumeVersionId)?.coverLetterFile&&<a target="_blank" rel="noreferrer" className="ml-4 text-sm text-accent" href={"/api/resume/"+encodeURIComponent(draft.resumeVersionId)+"?file=cover"}>求职信 ↗</a>}
          <div className="mt-4"><Field label="跟进备注"><textarea rows={4} maxLength={10000} className={inputCls} value={draft.notes} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))} placeholder="记录沟通情况、面试准备和下一步安排…"/></Field></div>
        </section>
        {!!runs.length&&<section className="border-t border-line pt-5"><h3 className="mb-3 font-semibold">助手执行记录</h3><ul className="space-y-3">{runs.map(r=><li key={r.id} className="rounded-lg bg-paper p-3 text-xs"><p>{dateText(r.createdAt)} · {({submitted:"报告提交成功",failed:"执行失败",cancelled:"已停止",skipped:"已跳过",running:"执行中",blocked:"等待操作",needs_input:"等待回答",awaiting_approval:"等待确认"})[r.status]}</p><p className="mt-1 text-muted">{r.outcome}</p><a target="_blank" rel="noreferrer" href={"/api/resume/"+encodeURIComponent(r.resumeVersionId)} className="mt-2 inline-block text-accent">查看本次使用的简历 ↗</a></li>)}</ul></section>}
        {record&&<section className="border-t border-line pt-5"><h3 className="mb-4 font-semibold">变更时间线</h3><ol className="space-y-4 border-l border-line pl-4">{[...record.history].reverse().map(e=><li key={e.id}><p className="text-sm">{e.label}</p><p className="mt-1 text-xs text-muted">{dateText(e.at)} · {e.source==="manual"?"人工更新":"自动同步"}</p></li>)}</ol></section>}
      </div>
      <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-white px-6 py-4">
        <div>{record&&<button type="button" disabled={busy} className="text-sm text-muted disabled:opacity-50" onClick={()=>{if(window.confirm(dirty?"归档操作不会保存尚未保存的编辑，是否继续？":record.archivedAt?"恢复这条申请？":"将这条申请归档？"))void save(!record.archivedAt);}}>{record.archivedAt?"恢复申请":"归档申请"}</button>}</div>
        <div className="flex gap-2"><Button type="button" variant="secondary" onClick={close} disabled={busy}>取消</Button><Button type="submit" busy={busy}>保存申请</Button></div>
      </footer>
    </form>
  </dialog>;
}
