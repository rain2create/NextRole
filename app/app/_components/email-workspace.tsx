"use client";
import { useEffect, useState } from "react";
import { STATUS_TEXT } from "./RunPanel";
import { AppHeader } from "./AppHeader";
import type { ApplicationRun, Job, ResumeVersion } from "@/lib/types";
export default function EmailWorkspace({embedded=false}:{embedded?:boolean}) {
  const [jobs,setJobs]=useState<Job[]>([]),[versions,setVersions]=useState<ResumeVersion[]>([]),[runs,setRuns]=useState<ApplicationRun[]>([]);
  const [configured,setConfigured]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [sourceText,setSourceText]=useState(""),[recipient,setRecipient]=useState(""),[image,setImage]=useState<File|null>(null),[warnings,setWarnings]=useState<string[]>([]);
  async function prepare(){setBusy(true);setMessage("");setWarnings([]);try{const f=new FormData();f.set("text",sourceText);f.set("recipient",recipient);f.set("resumeVersionId",draft.resumeVersionId);if(image)f.set("file",image);const r=await fetch("/api/email/prepare",{method:"POST",body:f});const d=await r.json();if(!r.ok)throw Error(d.error);await refresh();setDraft(d.draft);setWarnings(d.warnings);setMessage(`已提取：${d.source.company} — ${d.source.role}。请检查并编辑下方草稿，当前尚未发送。`);}catch(e){setMessage(e instanceof Error?e.message:"准备失败");}finally{setBusy(false);}}
  const [mail,setMail]=useState({host:"",port:465,user:"",pass:"",from:""});
  const [mailNotice,setMailNotice]=useState("");
  async function connect(){setBusy(true);setMailNotice("");try{const r=await fetch("/api/email/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...mail,from:mail.from||mail.user})});const d=await r.json();if(!r.ok)throw Error(d.error);setMail(v=>({...v,pass:""}));await refresh();setMailNotice("邮箱连接成功，尚未发送邮件。");}catch(e){setMailNotice(e instanceof Error?e.message:"连接失败");}finally{setBusy(false);}}
  const [draft,setDraft]=useState({jobId:"",resumeVersionId:"",to:"",subject:"",body:""});
  async function refresh(){const r=await fetch("/api/email");const d=await r.json();if(!r.ok)throw Error(d.error);setJobs(d.jobs);setVersions(d.versions);setRuns(d.runs);setConfigured(d.configured);}
  useEffect(()=>{refresh().catch(e=>setMessage(e.message));fetch("/api/email/settings").then(r=>r.json()).then(d=>{if(d.configured)setMail(v=>({...v,host:d.host,port:d.port,user:d.user,from:d.from}));}).catch(()=>{});},[]);
  async function action(url:string,body:unknown){setBusy(true);setMessage("");try{const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);await refresh();setMessage("已保存，请检查下方结果。");}catch(e){setMessage(e instanceof Error?e.message:"请求失败");}finally{setBusy(false);}}
  return <div className={embedded ? undefined : "app-shell"}>{!embedded && <AppHeader active="email" />}<section className={`email-workspace surface rounded-2xl border border-line bg-card p-5 sm:p-7 ${embedded ? "" : "mt-8"}`}><h2 className="text-2xl font-semibold">邮件投递</h2><p>准备材料 → 检查草稿 → 确认发送 → 跟进申请</p>
    <details open={!configured} className="my-5 rounded-xl border border-line p-4"><summary className="cursor-pointer font-semibold">{configured?"邮箱已连接 · 管理连接":"连接发件邮箱"}</summary>
      <p className="my-3 text-sm text-muted">请先在邮箱设置中开启 SMTP，并填写邮箱授权码。授权码保存在本机，不会交给模型。此连接方式不支持必须通过 OAuth 授权的 Microsoft / Google 账户。</p>
      <label>邮箱服务商<select defaultValue="custom" onChange={e=>{if(e.target.value==="163")setMail(v=>({...v,host:"smtp.163.com",port:465}));}}><option value="custom">自定义 SMTP</option><option value="163">163 邮箱</option></select></label>
      <div className="grid gap-3 sm:grid-cols-2"><label>SMTP 服务器<input required value={mail.host} onChange={e=>setMail({...mail,host:e.target.value})}/></label><label>端口<select value={mail.port} onChange={e=>setMail({...mail,port:Number(e.target.value)})}><option value={465}>465 · TLS</option><option value={587}>587 · STARTTLS</option></select></label>
      <label>邮箱账号<input type="email" value={mail.user} onChange={e=>setMail({...mail,user:e.target.value})}/></label><label>邮箱授权码 / 应用密码<input type="password" autoComplete="new-password" value={mail.pass} onChange={e=>setMail({...mail,pass:e.target.value})}/></label>
      <label>发件地址（默认使用邮箱账号）<input type="email" value={mail.from} onChange={e=>setMail({...mail,from:e.target.value})}/></label></div>
      <button type="button" disabled={busy||!mail.host||!mail.user||!mail.pass} onClick={()=>void connect()}>验证并连接邮箱</button><p role="status">{mailNotice}</p>
    </details>
    <section className="mb-6 grid gap-3 rounded-xl border border-line bg-paper p-5"><h2>从招聘信息准备材料</h2><p>选择下方的简历附件，再粘贴招聘文本、链接或上传文件。可以组合多种来源，生成后先检查草稿再发送。</p>
      <label>招聘文本或链接（公司、岗位、要求及投递说明）<textarea rows={6} value={sourceText} onChange={e=>setSourceText(e.target.value)}/></label>
      <label>招聘文件（图片、PDF 或 DOCX）<input type="file" accept="image/png,image/jpeg,image/webp,.pdf,.docx" onChange={e=>setImage(e.target.files?.[0]||null)}/></label>
      <label>指定收件人（选填）<input type="email" value={recipient} onChange={e=>setRecipient(e.target.value)}/></label>
      <button type="button" disabled={busy||!draft.resumeVersionId} onClick={()=>void prepare()}>{busy?"正在准备…":"提取岗位并生成邮件"}</button>
      {warnings.length>0&&<div role="alert"><strong>发送前请确认</strong><ul>{warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
    </section>
    <form onSubmit={e=>{e.preventDefault();void action("/api/email",draft);}} style={{display:"grid",gap:12}}>
      <label>目标岗位<select required value={draft.jobId} onChange={e=>setDraft({...draft,jobId:e.target.value})}><option value="">选择岗位</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.company} — {j.title}</option>)}</select></label>
      <label>简历附件<select required value={draft.resumeVersionId} onChange={e=>setDraft({...draft,resumeVersionId:e.target.value})}><option value="">选择简历</option>{versions.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
      <label>收件人<input required type="email" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
      <label>邮件主题<input required maxLength={200} value={draft.subject} onChange={e=>setDraft({...draft,subject:e.target.value})}/></label>
      <label>邮件正文<textarea required rows={9} value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/></label>
      <button disabled={busy}>保存草稿</button>
    </form><p role="status">{message}</p><a href="/app/tracking">查看申请管理</a>
    {runs.map(r=><article key={r.id} className="mt-5 rounded-xl border border-line p-4"><h2>{r.email?.subject}</h2><p>收件人：{r.email?.to}</p><p>简历：{versions.find(v=>v.id===r.resumeVersionId)?.label || r.resumeVersionId}</p><pre style={{whiteSpace:"pre-wrap"}}>{r.email?.body}</pre><p>状态：{r.email?.delivery === "draft" ? "草稿" : r.email?.delivery === "accepted" ? "邮件服务器已接收" : r.email?.delivery === "sending" ? "发送中" : "发送结果待确认"} · {STATUS_TEXT[r.status]}</p>{r.outcome&&<p>{r.outcome}</p>}{r.email?.messageId&&<p>邮件编号：{r.email.messageId}</p>}{r.email?.delivery==="draft"&&<button disabled={busy||!configured} onClick={()=>{if(window.confirm(`确认将邮件和所选简历发送至 ${r.email?.to}？`))void action(`/api/email/${r.id}`,{confirm:true});}}>确认并发送邮件</button>}</article>)}
  </section></div>;
}
