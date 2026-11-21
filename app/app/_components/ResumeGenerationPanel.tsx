"use client";
import { Download, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { RESUME_DIRECTIONS } from "@/lib/resume/directions";
import { detectJobLanguage, resolveResumeLanguage } from "@/lib/resume/language";
import type { Job, ResumeData, ResumeDirection, ResumeTranslationDraft, ResumeVersion } from "@/lib/types";
import { api, errorText } from "./api";
import { Button, Field, inputCls, Notice } from "./ui";

export type GenerationMode = "direction" | "job";

export type ResumeGenerationProps = {
  hasResume: boolean;
  aiConfigured: boolean;
  jobs: Job[];
  selectedJob: Job | null;
  onSelectJob: (job: Job | null) => void;
  direction: ResumeDirection | "";
  onDirectionChange: (direction: ResumeDirection | "") => void;
  generationMode: GenerationMode;
  onGenerationModeChange: (mode: GenerationMode) => void;
  onChange: () => Promise<void>;
  translationDrafts?: ResumeTranslationDraft[];
  onTranslationDraft?: (draft: ResumeTranslationDraft) => void;
};

type Generated = { version: ResumeVersion; gaps: string[] };
type NeedsConfirmation = { status: "needs_confirmation"; draft: ResumeTranslationDraft };

export function ResumeGenerationPanel({ hasResume, aiConfigured, jobs, selectedJob, onSelectJob, direction, onDirectionChange, generationMode, onGenerationModeChange, onChange, versions, sourceResumeId, sourceResume, sourceResumeText, translationDrafts = [], onTranslationDraft }: ResumeGenerationProps & { versions: ResumeVersion[]; sourceResumeId: string | null; sourceResume: ResumeData | null; sourceResumeText: string }) {
  const [loaded, setLoaded] = useState<{ id: string; job?: Job; error?: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [resumingDraft, setResumingDraft] = useState(false);
  const [error, setError] = useState<{ context: string; message: string } | null>(null);
  const [result, setResult] = useState<Generated | null>(null);
  const [localDraft, setLocalDraft] = useState<ResumeTranslationDraft | null>(null);
  const [completedDrafts, setCompletedDrafts] = useState<string[]>([]);
  const [reviewEdits, setReviewEdits] = useState<Record<string, Record<string, string>>>({});
  const selectedId = selectedJob?.id;
  const resolvedJob = loaded?.id === selectedId ? loaded?.job : undefined;
  const outputLanguage = generationMode === "job"
    ? resolvedJob?.description?.trim() ? detectJobLanguage(resolvedJob.description) : undefined
    : sourceResume && direction ? resolveResumeLanguage(sourceResume, sourceResumeText, undefined, direction) : undefined;
  const languageLabel = outputLanguage === "en" ? "英文" : "中文";
  const contextKey = [sourceResumeId, direction, generationMode, generationMode === "job" ? selectedId : "", outputLanguage].join("|");
  const pendingDraft = outputLanguage === "en" && sourceResumeId
    ? [localDraft, ...translationDrafts].find((draft) => draft && !completedDrafts.includes(draft.id) && draft.sourceResumeId === sourceResumeId && draft.direction === direction && (draft.outputLanguage ?? "en") === outputLanguage && (
      generationMode === "job" ? draft.jobId === selectedId : !draft.jobId
    ))
    : undefined;
  const otherDrafts = translationDrafts.filter((draft) => draft.sourceResumeId === sourceResumeId && !completedDrafts.includes(draft.id) && draft.id !== pendingDraft?.id && !(
    generationMode === "job" && draft.jobId === selectedId && draft.direction === direction && outputLanguage && (draft.outputLanguage ?? "en") !== outputLanguage
  ));
  const activeVersion = !pendingDraft && direction && sourceResumeId
    ? [result?.version, ...versions].find((version) => version?.sourceResumeId === sourceResumeId && version.direction === direction && (
      generationMode === "job" ? Boolean(outputLanguage) && version.outputLanguage === outputLanguage : direction === "foreign_company" ? version.outputLanguage === "en" : !version.outputLanguage || version.outputLanguage === outputLanguage
    ) && (
      generationMode === "job" ? version.kind === "tailored" && version.jobId === selectedId : version.kind === "base"
    ))
    : undefined;

  useEffect(() => {
    if (generationMode !== "job" || !selectedId) return;
    const controller = new AbortController();
    setLoaded(null);
    api<{ job: Job }>(`/api/jobs/${encodeURIComponent(selectedId)}`, { signal: controller.signal })
      .then(({ job }) => { if (!controller.signal.aborted) setLoaded({ id: selectedId, job }); })
      .catch((err) => { if (!controller.signal.aborted) setLoaded({ id: selectedId, error: errorText(err) }); });
    return () => controller.abort();
  }, [generationMode, selectedId]);

  const jobLoaded = loaded?.id === selectedId;
  const loadingJob = generationMode === "job" && Boolean(selectedId) && !jobLoaded;
  const jobError = jobLoaded ? loaded?.error : undefined;
  const job = jobLoaded ? loaded?.job : undefined;
  const disabledReason = !hasResume
    ? "请先上传简历或粘贴简历文本并读取信息。"
    : !direction
      ? "请选择修改方向。"
      : !aiConfigured
        ? "请先配置模型 API，再重启服务。"
        : generationMode === "job" && !selectedId
          ? "请选择目标岗位 JD。"
          : loadingJob
            ? "正在读取岗位 JD，请稍候。"
            : generationMode === "job" && jobError
              ? `岗位 JD 读取失败：${jobError}`
              : generationMode === "job" && !job?.description?.trim()
                ? "该岗位暂无可用 JD，请选择其他岗位，或切换到方向版。"
                : pendingDraft
                  ? `英文草稿已生成，待确认 ${pendingDraft.translationReviews.length} 项译名；确认后即可下载 PDF。`
                  : "";
  const availableJobs = selectedJob && !jobs.some((j) => j.id === selectedJob.id) ? [selectedJob, ...jobs] : jobs;
  const selectedDirection = RESUME_DIRECTIONS.find((item) => item.value === direction);

  const generate = async () => {
    if (disabledReason || generating || confirming) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const out = await api<Generated | NeedsConfirmation>("/api/resume/generate", {
        json: { direction, mode: generationMode, ...(generationMode === "job" ? { jobId: selectedId } : {}) },
      });
      if ("draft" in out) {
        setLocalDraft(out.draft);
        onTranslationDraft?.(out.draft);
      } else {
        setResult(out);
      }
      await onChange();
    } catch (err) {
      setError({ context: contextKey, message: errorText(err) });
    } finally {
      setGenerating(false);
    }
  };

  const reviewValues = pendingDraft
    ? Object.fromEntries(pendingDraft.translationReviews.map((review) => [review.id, reviewEdits[pendingDraft.id]?.[review.id] ?? review.suggested]))
    : {};
  const reviewError = pendingDraft?.translationReviews.some((review) => {
    const value = reviewValues[review.id].trim();
    return !value || value.length > 500 || /[\p{Script=Han}\r\n]/u.test(value);
  }) ? "请为每个词条填写英文译名或拼音，最多 500 个字符。" : "";

  const confirmTranslations = async () => {
    if (!pendingDraft || reviewError || confirming || generating || !hasResume) return;
    const draftId = pendingDraft.id;
    setConfirming(true);
    setError(null);
    try {
      const out = await api<Generated>(`/api/resume/drafts/${encodeURIComponent(draftId)}/confirm`, {
        json: { translations: Object.fromEntries(Object.entries(reviewValues).map(([id, value]) => [id, value.trim()])) },
      });
      setCompletedDrafts((previous) => [...previous, draftId]);
      setResult(out);
      await onChange();
    } catch (err) {
      setError({ context: contextKey, message: errorText(err) });
    } finally {
      setConfirming(false);
    }
  };

  const resumeTranslationDraft = async (draft: ResumeTranslationDraft) => {
    if (resumingDraft || generating || confirming) return;
    setResumingDraft(true);
    setError(null);
    try {
      if (draft.jobId) {
        const { job: draftJob } = await api<{ job: Job }>(`/api/jobs/${encodeURIComponent(draft.jobId)}`);
        if (!draftJob.description?.trim() || detectJobLanguage(draftJob.description) !== (draft.outputLanguage ?? "en")) {
          throw new Error("岗位 JD 语言与此草稿不同，请按当前 JD 重新生成岗位专属简历。");
        }
        onSelectJob(draftJob);
      }
      setLocalDraft(draft);
      onDirectionChange(draft.direction);
      onGenerationModeChange(draft.jobId ? "job" : "direction");
    } catch (err) {
      setError({ context: contextKey, message: errorText(err) });
    } finally {
      setResumingDraft(false);
    }
  };

  return (
    <div id="resume-generation" data-testid="resume-generation" className="mt-6 scroll-mt-6 border-t border-line pt-5">
      <h3 className="flex items-center gap-2 font-semibold"><Wand2 size={17} className="text-accent" />简历定制</h3>
      <p className="mt-1 text-sm text-muted">选择修改方向，再决定是否结合具体岗位 JD。岗位专属版按 JD 语言生成；每次都根据完整的原始简历生成独立版本。</p>
      {otherDrafts.length > 0 && <div className="mt-3 grid gap-1 text-sm"><p className="font-medium">有待确认的专有名词译法</p>{otherDrafts.map((draft) => <button key={draft.id} className="text-left text-accent underline" disabled={resumingDraft || generating || confirming} onClick={() => void resumeTranslationDraft(draft)}>继续确认：{draft.label}</button>)}</div>}
      <fieldset className="mt-4 grid gap-2 sm:grid-cols-2" disabled={generating || confirming}>
        <legend className="mb-2 text-sm font-medium">生成目标</legend>
        {([
          ["direction", "方向版（无需 JD）", "适合先准备简历，按投递方向优化表达。"],
          ["job", "岗位专属版（需 JD）", "结合所选方向和岗位要求，生成专属简历。"],
        ] as const).map(([value, label, hint]) => (
          <label key={value} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${generationMode === value ? "border-accent bg-soft" : "border-line"}`}>
            <input type="radio" name="resume-generation-mode" aria-label={label} className="mt-1" value={value} checked={generationMode === value} onChange={() => onGenerationModeChange(value)} />
            <span><span className="font-medium">{label}</span><span className="mt-1 block text-xs text-muted">{hint}</span></span>
          </label>
        ))}
      </fieldset>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="修改方向" hint={generationMode === "job" && direction === "foreign_company" ? "保留外企方向的表达侧重，输出语言按岗位 JD 确定。" : selectedDirection?.description ?? "必须选择；通用方向也需要明确选中。"}>
          <select aria-label="修改方向" className={inputCls} value={direction} disabled={generating || confirming} onChange={(e) => onDirectionChange(e.target.value as ResumeDirection | "")}>
            <option value="">请选择修改方向</option>
            {RESUME_DIRECTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
        {generationMode === "job" && (
          <Field label="目标岗位 JD" hint="从已搜索或导入的岗位中选择；选择空项可清除。">
            <select aria-label="目标岗位 JD" className={inputCls} value={selectedId ?? ""} disabled={generating || confirming} onChange={(e) => onSelectJob(availableJobs.find((item) => item.id === e.target.value) ?? null)}>
              <option value="">未选择岗位 JD</option>
              {availableJobs.map((item) => <option key={item.id} value={item.id}>{item.company} · {item.title}</option>)}
            </select>
          </Field>
        )}
      </div>
      {generationMode === "job" && job?.description?.trim() && (
        <details className="mt-3 rounded-xl border border-line bg-paper p-3 text-sm">
          <summary className="cursor-pointer font-medium">已读取 JD：{job.company} · {job.title}</summary>
          <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line text-muted">{job.description}</p>
        </details>
      )}
      {outputLanguage && <p data-testid="resume-output-language" className="mt-3 text-sm font-medium text-accent-dark">
        {generationMode === "job" ? `JD 语言：${languageLabel}；本次生成：${languageLabel}简历。` : `本次生成：${languageLabel}简历（${direction === "foreign_company" ? "外企方向" : "沿用原简历语言"}）。`}
      </p>}
      <p className="mt-3 text-sm text-muted" aria-live="polite" id="resume-generation-readiness">
        {generating ? "正在生成简历，请稍候。" : disabledReason || (generationMode === "job" ? `本次生成：${selectedDirection?.label} · ${job?.company} · ${job?.title}` : `本次生成：${selectedDirection?.label}方向版，不使用岗位 JD。`)}
      </p>
      <Button className="mt-3" data-testid="generate-resume" aria-describedby="resume-generation-readiness" onClick={generate} busy={generating} disabled={Boolean(disabledReason) || confirming}>
        <Wand2 size={16} />{pendingDraft ? "草稿已生成，等待译名确认" : generationMode === "job" ? "生成岗位专属简历" : "生成方向版简历"}
      </Button>
      {error?.context === contextKey && <div className="mt-3"><Notice tone="error">{error.message}</Notice></div>}
      {pendingDraft && (
        <div data-testid="translation-review" className="mt-4 rounded-2xl border border-line p-4">
          <h4 className="font-semibold">以下专有名词译法需确认</h4>
          <p className="mt-1 text-sm text-muted">{pendingDraft.label}。核对下方 {pendingDraft.translationReviews.length} 项译名，需要时直接修改；接受当前译法时，可点击“确认译名并生成 PDF”。</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button data-testid="confirm-translations" onClick={confirmTranslations} busy={confirming} disabled={Boolean(reviewError) || !hasResume || generating}>确认译名并生成 PDF</Button>
            <Button variant="secondary" data-testid="pending-pdf-download" disabled><Download size={15} />下载 PDF（待译名确认）</Button>
          </div>
          <p className="mt-2 text-xs text-muted">确认后将在此处显示可用的下载和打印入口，无需重新点击生成。</p>
          {reviewError && <p className="mt-3 text-sm text-warn" role="status">{reviewError}</p>}
          <div className="mt-4 grid gap-4">
            {pendingDraft.translationReviews.map((review) => (
              <Field key={review.id} label={`英文译名：${review.source}`} hint={review.reason}>
                <span className="text-xs font-normal text-muted">原文：{review.source} · 建议：{review.suggested}</span>
                <input
                  aria-label={`英文译名：${review.source}`}
                  className={inputCls}
                  value={reviewValues[review.id]}
                  maxLength={500}
                  disabled={confirming}
                  onChange={(event) => setReviewEdits((previous) => ({ ...previous, [pendingDraft.id]: { ...previous[pendingDraft.id], [review.id]: event.target.value } }))}
                />
              </Field>
            ))}
          </div>
        </div>
      )}
      {activeVersion && (
        <div className="mt-4 rounded-2xl border border-line p-4">
          <p className="font-medium">已生成：{activeVersion.label}</p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <a className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent" href={`/api/resume/${activeVersion.id}?download`}><Download size={15} />下载简历 PDF</a>
            <a className="text-sm text-accent" href={`/api/resume/${activeVersion.id}`} target="_blank" rel="noreferrer">打开 PDF / 打印</a>
            {activeVersion.coverLetterFile && <a className="text-sm text-accent" href={`/api/resume/${activeVersion.id}?file=cover&download`}>下载求职信</a>}
          </div>
          <iframe title="定制简历预览" src={`/api/resume/${activeVersion.id}#view=FitH`} className="mt-4 h-[520px] w-full rounded-xl border border-line bg-white" />
        </div>
      )}
    </div>
  );
}
