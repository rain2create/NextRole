"use client";

import { ArrowUpRight, Building2, MapPin } from "lucide-react";
import type { Job } from "@/lib/types";
import type { JobFeedback, SkipReason } from "@/lib/jobs/feedback";
import type { JobRank } from "@/lib/jobs/personalize";
import { useState } from "react";
import { api, errorText, timeAgo } from "./api";
import { JobFeedbackActions } from "./JobFeedbackActions";
import { SourceBadge } from "./ui";

export function fitTone(score?: number) {
  if (score === undefined) return "bg-paper text-muted";
  if (score >= 75) return "bg-soft text-accent-dark";
  if (score >= 55) return "bg-warn-soft text-warn";
  return "bg-paper text-muted";
}

export function JobList({
  ranked,
  feedback,
  selectedId,
  busyId,
  onSelect,
  onFeedback,
}: {
  ranked: JobRank[];
  feedback: JobFeedback[];
  selectedId?: string;
  busyId?: string;
  onSelect: (job: Job) => void;
  onFeedback: (job: Job, action: "save" | "skip" | "undo", reason?: SkipReason) => Promise<boolean>;
}) {
  const [notice,setNotice] = useState("");
  const send = async (job:Job,reason:string) => {
    try {
      await api("/api/jobs/feedback",{json:{jobId:job.id,direction:job.searchView!.direction,reason}});
      window.dispatchEvent(new Event("job-feedback"));
      setNotice(`${job.title}：反馈已保存，下次搜索生效，可在搜索反馈中撤销。`);
    } catch(e) { setNotice(errorText(e)); }
  };
  const feedbackById = new Map(feedback.map((item) => [item.jobId, item]));
  return (
    <ul className="grid gap-2.5">
      {notice && <li role="status">{notice}</li>}
      {ranked.map(({ job, note }) => {
        const current = feedbackById.get(job.id);
        const skipped = current?.kind === "skipped";
        return (
          <li key={job.id}>
            <div className={`enter rounded-2xl border p-4 text-left transition ${selectedId === job.id && !skipped ? "border-accent bg-[#f0faf6] shadow-[inset_3px_0_0_var(--accent)]" : "border-line bg-card"}`}>
              {skipped ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-muted">{job.title} · {job.company}</p>
                  <JobFeedbackActions job={job} feedback={current} busy={busyId === job.id} onChange={(action, reason) => onFeedback(job, action, reason)} />
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => onSelect(job)} className="block w-full text-left" aria-label={`查看 ${job.company} 的 ${job.title}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold leading-snug tracking-tight">{job.title}</h3>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                          <span className="inline-flex items-center gap-1"><Building2 size={13} aria-hidden />{job.company}</span>
                          {job.location && <span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden />{job.location}</span>}
                        </p>
                      </div>
                      {job.searchView?.match ? <span>精排 {job.searchView.match.match_score}/100</span> : job.quickFit !== undefined && (
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${fitTone(job.quickFit)}`} title="根据职位名称、资历和地点初评；打开岗位后可进行完整匹配分析。">
                          {job.searchView ? `初评 ${job.quickFit}/100` : `初评 ${job.quickFit}%`}
                        </span>
                      )}
                    </div>
                    {job.quickFitReason && <p className="mt-2.5 text-sm text-[#4c4b46]">{job.quickFitReason}</p>}
                  </button>
            {job.searchView?.checks.map(c=><p key={c.field} className="mt-1 text-xs text-muted">{c.field}：<b>{c.state}</b> · {c.evidence}</p>)}
            {job.searchView?.match?.matching_evidence[0] && <p className="mt-2 text-sm">简历证据：{job.searchView.match.matching_evidence[0]}</p>}
            {job.searchView?.match?.missing_requirements[0] && <p className="mt-1 text-sm">缺口：{job.searchView.match.missing_requirements[0]}</p>}
            {!!job.searchView?.feedback.length && <p className="mt-2 text-xs text-muted">按反馈降序：{job.searchView.feedback.join("、")}</p>}

                  <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                    <SourceBadge source={job.source} />
                    {job.postedAt && <span>{timeAgo(job.postedAt)}</span>}
                    <a href={job.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-0.5 hover:text-accent">
                      岗位原文 <ArrowUpRight size={13} aria-hidden />
                    </a>
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-2">
                    <JobFeedbackActions job={job} feedback={current} busy={busyId === job.id} onChange={(action, reason) => onFeedback(job, action, reason)} />
                    {note && <p className={`text-right text-xs font-medium ${note.startsWith("↑") ? "text-accent-dark" : "text-danger"}`}>{note}</p>}
                  </div>
                </>
              )}
            </div>
          {job.searchView && <div className="mt-2 flex flex-wrap items-center gap-3 px-2 text-xs text-muted">
            <label>岗位反馈 <select aria-label={`${job.title}反馈`} value="" onChange={e=>{if(e.target.value) void send(job,e.target.value);}} className="border border-line bg-white p-1">
              <option value="">选择原因</option><option value="公司">不考虑这家公司</option><option value="方向">此方向下职位名称不合适</option><option value="薪资">这个岗位薪资偏低</option>
            </select></label><a href="#resume" className="underline">更正简历信息</a>
          </div>}
          </li>
        );
      })}
    </ul>
  );
}
