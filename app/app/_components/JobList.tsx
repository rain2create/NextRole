"use client";
import { ArrowUpRight, Building2, MapPin } from "lucide-react";
import type { Job } from "@/lib/types";
import { useState } from "react";
import { api, errorText, timeAgo } from "./api";
import { SourceBadge } from "./ui";

export function fitTone(score?: number) {
  if (score === undefined) return "bg-paper text-muted";
  if (score >= 75) return "bg-soft text-accent-dark";
  if (score >= 55) return "bg-warn-soft text-warn";
  return "bg-[#f1efea] text-muted";
}

export function JobList({ jobs, selectedId, onSelect }: { jobs: Job[]; selectedId?: string; onSelect: (job: Job) => void }) {
  const [notice,setNotice] = useState("");
  const send = async (job:Job,reason:string) => {
    try {
      await api("/api/jobs/feedback",{json:{jobId:job.id,direction:job.searchView!.direction,reason}});
      window.dispatchEvent(new Event("job-feedback"));
      setNotice(`${job.title}：反馈已保存，下次搜索生效，可在搜索反馈中撤销。`);
    } catch(e) { setNotice(errorText(e)); }
  };
  return (
    <ul className="grid gap-2.5">
      {notice && <li className="text-sm text-muted" role="status">{notice}</li>}
      {jobs.map((job) => (
        <li key={job.id}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect(job)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(job))}
            className={`enter block w-full cursor-pointer rounded-2xl border p-4 text-left transition hover:border-line-strong ${selectedId === job.id ? "border-accent bg-[#f6f9f7] shadow-[inset_3px_0_0_var(--accent)]" : "border-line bg-card"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold leading-snug tracking-tight">{job.title}</h3>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  <span className="inline-flex items-center gap-1"><Building2 size={13} aria-hidden />{job.company}</span>
                  {job.location && <span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden />{job.location}</span>}
                </p>
              </div>
              {job.searchView?.match ? <span className="shrink-0 text-sm font-semibold text-accent">精排 {job.searchView.match.match_score}/100</span> : job.quickFit !== undefined && (
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${fitTone(job.quickFit)}`} title="Quick fit from title, seniority and location. Open the job for a full match analysis.">
                  初评 {job.quickFit}/100
                </span>
              )}
            </div>
            {(job.searchView?.match?.summary || job.quickFitReason) && <p className="mt-2.5 text-sm text-[#4c4b46]">{job.searchView?.match?.summary || job.quickFitReason}</p>}
            {job.searchView?.checks.map(c=><p key={c.field} className="mt-1 text-xs text-muted">{c.field}：<b>{c.state}</b> · {c.evidence}</p>)}
            {job.searchView?.match?.matching_evidence[0] && <p className="mt-2 text-sm">简历证据：{job.searchView.match.matching_evidence[0]}</p>}
            {job.searchView?.match?.missing_requirements[0] && <p className="mt-1 text-sm">缺口：{job.searchView.match.missing_requirements[0]}</p>}
            {!!job.searchView?.feedback.length && <p className="mt-2 text-xs text-muted">按反馈降序：{job.searchView.feedback.join("、")}</p>}
            <div className="mt-3 flex items-center gap-2 text-xs text-muted">
              <SourceBadge source={job.source} />
              {job.postedAt && <span>{timeAgo(job.postedAt)}</span>}
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-auto inline-flex items-center gap-0.5 hover:text-accent"
              >
                Original <ArrowUpRight size={13} aria-hidden />
              </a>
            </div>
          </div>
          {job.searchView && <div className="mt-2 flex flex-wrap items-center gap-3 px-2 text-xs text-muted">
            <label>岗位反馈 <select aria-label={`${job.title}反馈`} value="" onChange={e=>{if(e.target.value) void send(job,e.target.value);}} className="border border-line bg-white p-1">
              <option value="">选择原因</option><option value="公司">不考虑这家公司</option><option value="方向">此方向下职位名称不合适</option><option value="薪资">这个岗位薪资偏低</option>
            </select></label><a href="#resume" className="underline">更正简历信息</a>
          </div>}
        </li>
      ))}
    </ul>
  );
}
