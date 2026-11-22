"use client";

import { useState } from "react";
import type { Job } from "@/lib/types";
import type { JobFeedback, SkipReason } from "@/lib/jobs/feedback";

export const reasonLabels: Record<SkipReason, string> = {
  "too-senior": "资历要求过高",
  "wrong-role": "岗位方向不符",
  "not-this-company": "不考虑这家公司",
  other: "其他原因",
};

type Action = "save" | "skip" | "undo";

export function JobFeedbackActions({
  job,
  feedback,
  busy,
  onChange,
}: {
  job: Job;
  feedback?: JobFeedback;
  busy: boolean;
  onChange: (action: Action, reason?: SkipReason) => Promise<boolean>;
}) {
  const [choosing, setChoosing] = useState(false);
  const actionClass = "rounded-lg border border-line-strong bg-white px-2.5 py-1.5 text-xs font-medium text-muted hover:border-accent hover:text-accent disabled:opacity-50";

  if (feedback?.kind === "skipped") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>已跳过：{reasonLabels[feedback.reason ?? "other"]}</span>
        <button type="button" className="font-semibold text-accent hover:underline disabled:opacity-50" disabled={busy} onClick={() => void onChange("undo")}>撤销</button>
      </div>
    );
  }

  if (choosing) {
    return (
      <div className="grid gap-2 text-xs">
        <p className="text-muted">跳过 {job.company} 的 {job.title}，原因是：</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(reasonLabels) as SkipReason[]).map((reason) => (
            <button key={reason} type="button" className={actionClass} disabled={busy} onClick={() => void onChange("skip", reason).then((ok) => { if (ok) setChoosing(false); })}>
              {reasonLabels[reason]}
            </button>
          ))}
          <button type="button" className="px-2 py-1.5 text-muted hover:text-ink" disabled={busy} onClick={() => setChoosing(false)}>取消</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" aria-pressed={feedback?.kind === "saved"} className={actionClass} disabled={busy} onClick={() => void onChange(feedback?.kind === "saved" ? "undo" : "save")}>
        {feedback?.kind === "saved" ? "已收藏 · 撤销" : "收藏"}
      </button>
      <button type="button" className={actionClass} disabled={busy} onClick={() => setChoosing(true)}>跳过</button>
    </div>
  );
}
