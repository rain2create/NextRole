"use client";
import { useEffect, useState } from "react";
import type { ApplicationRun, Job, ResumeVersion } from "@/lib/types";
export default function EmailWorkspace({embedded=false}:{embedded?:boolean}) {
  const [jobs,setJobs]=useState<Job[]>([]),[versions,setVersions]=useState<ResumeVersion[]>([]),[runs,setRuns]=useState<ApplicationRun[]>([]);
  const [configured,setConfigured]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [sourceText,setSourceText]=useState(""),[recipient,setRecipient]=useState(""),[image,setImage]=useState<File|null>(null),[warnings,setWarnings]=useState<string[]>([]);
  async function prepare(){setBusy(true);setMessage("");setWarnings([]);try{const f=new FormData();f.set("text",sourceText);f.set("recipient",recipient);f.set("resumeVersionId",draft.resumeVersionId);if(image)f.set("file",image);const r=await fetch("/api/email/prepare",{method:"POST",body:f});const d=await r.json();if(!r.ok)throw Error(d.error);await refresh();setDraft(d.draft);setWarnings(d.warnings);setMessage(`Extracted: ${d.source.company} — ${d.source.role}. Review and edit the email below; nothing has been sent.`);}catch(e){setMessage(e instanceof Error?e.message:"Preparation failed");}finally{setBusy(false);}}
  const [mail,setMail]=useState({host:"",port:465,user:"",pass:"",from:""});
  const [mailNotice,setMailNotice]=useState("");
  async function connect(){setBusy(true);setMailNotice("");try{const r=await fetch("/api/email/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...mail,from:mail.from||mail.user})});const d=await r.json();if(!r.ok)throw Error(d.error);setMail(v=>({...v,pass:""}));await refresh();setMailNotice("Mailbox connected. No email was sent.");}catch(e){setMailNotice(e instanceof Error?e.message:"Connection failed");}finally{setBusy(false);}}
  const [draft,setDraft]=useState({jobId:"",resumeVersionId:"",to:"",subject:"",body:""});
  async function refresh(){const r=await fetch("/api/email");const d=await r.json();if(!r.ok)throw Error(d.error);setJobs(d.jobs);setVersions(d.versions);setRuns(d.runs);setConfigured(d.configured);}
  useEffect(()=>{refresh().catch(e=>setMessage(e.message));fetch("/api/email/settings").then(r=>r.json()).then(d=>{if(d.configured)setMail(v=>({...v,host:d.host,port:d.port,user:d.user,from:d.from}));}).catch(()=>{});},[]);
  async function action(url:string,body:unknown){setBusy(true);setMessage("");try{const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);await refresh();setMessage("Saved. Review the result below.");}catch(e){setMessage(e instanceof Error?e.message:"Request failed");}finally{setBusy(false);}}
  return <section className="email-workspace" style={{maxWidth:embedded?undefined:950,margin:embedded?0:"40px auto",padding:24,background:"white",borderRadius:24,border:"1px solid var(--line)"}}>{!embedded&&<a href="/app">← Workspace</a>}<h1 className="text-2xl font-semibold">Email applications</h1><p>Prepare → Review draft → Confirm and send → Application tracking</p>
    <details open={!configured} className="my-5 rounded-xl border border-line p-4"><summary className="cursor-pointer font-semibold">{configured?"Mailbox connected · Manage connection":"1. Connect your sending mailbox"}</summary>
      <p className="my-3 text-sm text-muted">This app connects via SMTP, not the chat mailbox plugin. Enable SMTP in your mailbox and use an authorization/app password. Credentials stay on this computer in the ignored data folder, not in the model prompt. Microsoft/Google accounts that require OAuth are not supported by this password connection.</p>
      <label>Provider<select defaultValue="custom" onChange={e=>{if(e.target.value==="163")setMail(v=>({...v,host:"smtp.163.com",port:465}));}}><option value="custom">Custom SMTP</option><option value="163">163 Mail</option></select></label>
      <div className="grid gap-3 sm:grid-cols-2"><label>SMTP host<input required value={mail.host} onChange={e=>setMail({...mail,host:e.target.value})}/></label><label>Port<select value={mail.port} onChange={e=>setMail({...mail,port:Number(e.target.value)})}><option value={465}>465 · TLS</option><option value={587}>587 · STARTTLS</option></select></label>
      <label>Mailbox account<input type="email" value={mail.user} onChange={e=>setMail({...mail,user:e.target.value})}/></label><label>Authorization / app password<input type="password" autoComplete="new-password" value={mail.pass} onChange={e=>setMail({...mail,pass:e.target.value})}/></label>
      <label>From address (defaults to account)<input type="email" value={mail.from} onChange={e=>setMail({...mail,from:e.target.value})}/></label></div>
      <button type="button" disabled={busy||!mail.host||!mail.user||!mail.pass} onClick={()=>void connect()}>Verify and connect mailbox</button><p role="status">{mailNotice}</p>
    </details>
    <section style={{border:"1px solid #ccd",padding:20,marginBottom:24,display:"grid",gap:12}}><h2>Prepare from recruiting information</h2><p>Select your resume below, then paste text or URLs in the text box, or upload a recruiting file. You can combine sources. Review extracted details before saving or sending.</p>
      <label>Text or recruiting URLs (company, role, JD and email instructions)<textarea rows={6} value={sourceText} onChange={e=>setSourceText(e.target.value)}/></label>
      <label>Recruiting file (image, PDF or DOCX)<input type="file" accept="image/png,image/jpeg,image/webp,.pdf,.docx" onChange={e=>setImage(e.target.files?.[0]||null)}/></label>
      <label>Confirmed recipient (optional override)<input type="email" value={recipient} onChange={e=>setRecipient(e.target.value)}/></label>
      <button type="button" disabled={busy||!draft.resumeVersionId} onClick={()=>void prepare()}>{busy?"Preparing…":"Extract job and generate email"}</button>
      {warnings.length>0&&<div role="alert"><strong>Verify before sending</strong><ul>{warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
    </section>
    <form onSubmit={e=>{e.preventDefault();void action("/api/email",draft);}} style={{display:"grid",gap:12}}>
      <label>Job<select required value={draft.jobId} onChange={e=>setDraft({...draft,jobId:e.target.value})}><option value="">Select job</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.company} — {j.title}</option>)}</select></label>
      <label>Resume attachment<select required value={draft.resumeVersionId} onChange={e=>setDraft({...draft,resumeVersionId:e.target.value})}><option value="">Select resume</option>{versions.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
      <label>Recipient<input required type="email" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
      <label>Subject<input required maxLength={200} value={draft.subject} onChange={e=>setDraft({...draft,subject:e.target.value})}/></label>
      <label>Body<textarea required rows={9} value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/></label>
      <button disabled={busy}>Save draft for review</button>
    </form><p role="status">{message}</p><a href="/app/tracking">Application tracking</a>
    {runs.map(r=><article key={r.id} style={{border:"1px solid #aaa",padding:16,marginTop:20}}><h2>{r.email?.subject}</h2><p>To: {r.email?.to}</p><p>Resume: {versions.find(v=>v.id===r.resumeVersionId)?.label || r.resumeVersionId}</p><pre style={{whiteSpace:"pre-wrap"}}>{r.email?.body}</pre><p>Status: {r.email?.delivery} · {r.status}</p>{r.outcome&&<p>{r.outcome}</p>}{r.email?.messageId&&<p>Message ID: {r.email.messageId}</p>}{r.email?.delivery==="draft"&&<button disabled={busy||!configured} onClick={()=>{if(window.confirm(`Send this email to ${r.email?.to} with the selected resume?`))void action(`/api/email/${r.id}`,{confirm:true});}}>Confirm and send email</button>}</article>)}
  </section>;
}
