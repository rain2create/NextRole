"use client";

import { ArrowUpRight, Building2, MapPin } from "lucide-react";
import type { Job } from "@/lib/types";
import type { JobFeedback, SkipReason } from "@/lib/jobs/feedback";
import type { JobRank } from "@/lib/jobs/personalize";
import { timeAgo } from "./api";
import { JobFeedbackActions } from "./JobFeedbackActions";
import { SourceBadge } from "./ui";

export function fitTone(score?: number) {
  if (score === undefined) return "bg-paper text-muted";
  if (score >= 75) return "bg-soft text-accent-dark";
  if (score >= 55) return "bg-warn-soft text-warn";
  return "bg-[#f1efea] text-muted";
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
  const feedbackById = new Map(feedback.map((item) => [item.jobId, item]));
  return (
    <ul className="grid gap-2.5">
      {ranked.map(({ job, note }) => {
        const current = feedbackById.get(job.id);
        const skipped = current?.kind === "skipped";
        return (
          <li key={job.id}>
            <div className={`enter rounded-2xl border p-4 text-left transition ${selectedId === job.id && !skipped ? "border-accent bg-[#f6f9f7] shadow-[inset_3px_0_0_var(--accent)]" : "border-line bg-card"}`}>
              {skipped ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-muted">{job.title} · {job.company}</p>
                  <JobFeedbackActions job={job} feedback={current} busy={busyId === job.id} onChange={(action, reason) => onFeedback(job, action, reason)} />
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => onSelect(job)} className="block w-full text-left" aria-label={`View ${job.title} at ${job.company}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold leading-snug tracking-tight">{job.title}</h3>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                          <span className="inline-flex items-center gap-1"><Building2 size={13} aria-hidden />{job.company}</span>
                          {job.location && <span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden />{job.location}</span>}
                        </p>
                      </div>
                      {job.quickFit !== undefined && (
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${fitTone(job.quickFit)}`} title="Quick fit from title, seniority and location. Open the job for a full match analysis.">
                          {job.quickFit}% fit
                        </span>
                      )}
                    </div>
                    {job.quickFitReason && <p className="mt-2.5 text-sm text-[#4c4b46]">{job.quickFitReason}</p>}
                  </button>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                    <SourceBadge source={job.source} />
                    {job.postedAt && <span>{timeAgo(job.postedAt)}</span>}
                    <a href={job.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-0.5 hover:text-accent">
                      Original <ArrowUpRight size={13} aria-hidden />
                    </a>
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-2">
                    <JobFeedbackActions job={job} feedback={current} busy={busyId === job.id} onChange={(action, reason) => onFeedback(job, action, reason)} />
                    {note && <p className={`text-right text-xs font-medium ${note.startsWith("↑") ? "text-accent-dark" : "text-danger"}`}>{note}</p>}
                  </div>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
