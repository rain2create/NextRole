"use client";
import { CheckCircle2, Linkedin, LoaderCircle, PlugZap, Rocket, Search } from "lucide-react";
import EmailWorkspace from "./_components/email-workspace";
import { AppHeader } from "./_components/AppHeader";
import { JourneyArtwork } from "./_components/JourneyArtwork";
import { BrowserLogin, type BrowserStatus } from "./_components/BrowserLogin";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AutopilotState } from "@/lib/agent/autopilot";
import type { ApplicationRun, Job, Profile, ResumeDirection, ResumeTranslationDraft, ResumeVersion } from "@/lib/types";
import type { JobFeedback, SkipReason } from "@/lib/jobs/feedback";
import { rankJobs, type JobSort } from "@/lib/jobs/personalize";
import { api, errorText } from "./_components/api";
import { AutopilotPanel } from "./_components/AutopilotPanel";
import { History } from "./_components/History";
import { JobList } from "./_components/JobList";
import { JobPanel } from "./_components/JobPanel";
import { ResumePanel } from "./_components/ResumePanel";
import type { GenerationMode } from "./_components/ResumeGenerationPanel";
import { RunPanel } from "./_components/RunPanel";
import { SearchPanel } from "./_components/SearchPanel";
import { Card, Eyebrow, Notice } from "./_components/ui";

type ProfileResponse = { profile: Profile; versions: ResumeVersion[]; translationDrafts?: ResumeTranslationDraft[]; ai: { keyKind: "missing" | "token-plan" | "application"; configured: boolean; issue: string | null; model: string; agentModel: string; webSearch: boolean } };
type FeedbackResponse = { feedback: JobFeedback[]; savedJobs: Job[] };
const ACTIVE = ["running", "needs_input", "blocked", "awaiting_approval"];
const DETAIL_LABELS: [keyof Profile["preferences"], string][] = [
  ["workAuthorization", "工作许可"],
  ["requiresSponsorship", "签证支持"],
  ["noticePeriod", "到岗时间"],
  ["expectedCompensation", "期望薪资"],
];

export default function Workspace() {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const resumeInput = useRef<HTMLInputElement>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [feedback, setFeedback] = useState<JobFeedback[]>([]);
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);
  const [jobView, setJobView] = useState<"all" | "saved">("all");
  const [jobSort, setJobSort] = useState<JobSort>("fit");
  const [feedbackBusyId, setFeedbackBusyId] = useState<string>();
  const [feedbackError, setFeedbackError] = useState("");
  const [searched, setSearched] = useState("");
  const [searchErrors, setSearchErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [runs, setRuns] = useState<ApplicationRun[]>([]);
  const [shownRun, setShownRun] = useState<ApplicationRun | null>(null);
  const [browser, setBrowser] = useState<BrowserStatus>({ open: false, linkedin: false, manualOpen: false, manualPending: false });
  const [loginExpanded, setLoginExpanded] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"search" | "autopilot">("search");
  const [autopilot, setAutopilot] = useState<AutopilotState | null>(null);
  const [directionSelection, setDirectionSelection] = useState<ResumeDirection | "" | undefined>(undefined);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("direction");
  const direction = directionSelection ?? data?.profile.resumeDirection ?? "";

  const loadProfile = useCallback(async () => setData(await api<ProfileResponse>("/api/profile")), []);
  const loadRuns = useCallback(async () => {
    const { applications } = await api<{ applications: ApplicationRun[] }>("/api/applications");
    setRuns(applications);
    return applications;
  }, []);

  useEffect(() => {
    loadProfile().catch((err) => setNotice(errorText(err)));
    loadRuns()
      .then((all) => {
        const live = all.find((r) => r.channel !== "email" && ACTIVE.includes(r.status));
        if (live) setShownRun(live);
      })
      .catch(() => {});
    api<typeof browser>("/api/browser").then(setBrowser).catch(() => {});
    api<{ autopilot: AutopilotState | null }>("/api/autopilot")
      .then(({ autopilot: a }) => {
        setAutopilot(a);
        if (a && (a.status === "searching" || a.status === "running")) setMode("autopilot");
      })
      .catch(() => {});
    api<FeedbackResponse>("/api/job-feedback")
      .then((result) => { setFeedback(result.feedback); setSavedJobs(result.savedJobs); })
      .catch((err) => setFeedbackError(errorText(err)));
  }, [loadProfile, loadRuns]);

  const autopilotActive = autopilot?.status === "searching" || autopilot?.status === "running";
  const autopilotRunId = autopilot?.currentRunId;
  useEffect(() => {
    if (!autopilotActive) return;
    const t = setInterval(() => {
      api<{ autopilot: AutopilotState | null }>("/api/autopilot")
        .then(({ autopilot: a }) => {
          setAutopilot(a);
          if (a && !(a.status === "searching" || a.status === "running")) void loadRuns();
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(t);
  }, [autopilotActive, loadRuns]);
  useEffect(() => {
    if (!autopilotRunId) return;
    api<{ run: ApplicationRun }>(`/api/applications/${autopilotRunId}`)
      .then(({ run }) => {
        setShownRun(run);
        setRuns((all) => [run, ...all.filter((r) => r.id !== run.id)]);
        void loadProfile();
      })
      .catch(() => {});
  }, [autopilotRunId, loadProfile]);

  // Manual windows are never inspected while the user is entering credentials.
  useEffect(() => {
    if (!browser.manualPending && (!browser.open || browser.linkedin)) return;
    const t = setInterval(() => api<typeof browser>("/api/browser").then(setBrowser).catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [browser.open, browser.linkedin, browser.manualPending]);

  const start = async (jobId: string, resumeVersionId: string, autoSubmit: boolean) => {
    const { run } = await api<{ run: ApplicationRun }>("/api/applications", { json: { jobId, resumeVersionId, autoSubmit } });
    setShownRun(run);
    setRuns((all) => [run, ...all]);
    setBrowser((b) => ({ ...b, open: true }));
    setTimeout(() => document.getElementById("agent")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const onRunUpdate = useCallback((run: ApplicationRun) => {
    setRuns((all) => all.map((r) => (r.id === run.id ? run : r)));
  }, []);

  const onFeedback = async (job: Job, action: "save" | "skip" | "undo", reason?: SkipReason) => {
    setFeedbackBusyId(job.id);
    setFeedbackError("");
    try {
      const result = await api<FeedbackResponse>("/api/job-feedback", { json: { jobId: job.id, action, reason, query: searched } });
      setFeedback(result.feedback);
      setSavedJobs(result.savedJobs);
      if (selected?.id === job.id && action === "skip") {
        const next = (jobView === "saved" ? result.savedJobs : jobs).find((candidate) => candidate.id !== job.id && !result.feedback.some((item) => item.jobId === candidate.id && item.kind === "skipped"));
        setSelected(next ?? null);
      } else if (selected?.id === job.id && action === "undo" && jobView === "saved") {
        setSelected(result.savedJobs[0] ?? null);
      }
      return true;
    } catch (err) {
      setFeedbackError(errorText(err));
      return false;
    } finally {
      setFeedbackBusyId(undefined);
    }
  };

  const profile = data?.profile ?? null;
  const planKey = data?.ai?.keyKind === "token-plan";
  const keyPresent = data?.ai?.configured;
  const hasResume = Boolean(profile?.resume);
  const agentBusy = runs.some((r) => r.channel !== "email" && ACTIVE.includes(r.status)) || autopilotActive;
  const missingDetails = [
    ...(profile?.resume && !profile.resume.contact.location ? ["当前所在地"] : []),
    ...DETAIL_LABELS.filter(([k]) => profile && !profile.preferences[k]).map(([, label]) => label),
  ];
  const displayedJobs = jobView === "saved" ? savedJobs.map((job) => ({ job })) : rankJobs(jobs, feedback, searched, jobSort);

  return (
    <main className="app-shell">
      <AppHeader active="workspace" />
      <div className="workspace-heading">
        <div className="hero-copy"><span className="hero-eyebrow"><span /> 每一个下一步，都有新可能</span><h1>下一站，<br /><span>去更适合你的地方。</span></h1><p>发现心动岗位，准备一份好简历。<br className="sm:hidden" />你的下一程，从这里轻松开始。</p></div>
        <JourneyArtwork />
      </div>
      <div className="workspace-toolbar">
        <nav className="workspace-shortcuts" aria-label="工作台快捷导航">
          <a href="#search" onClick={() => setMode("search")}>发现岗位</a><a href="#resume">我的简历</a><a href="#jobs">匹配与投递</a><a href="#history">执行记录</a>
        </nav>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span title={data ? `${planKey ? "千问 Token Plan" : "模型"} · ${data.ai.model}（本地配置）` : undefined} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium ${keyPresent ? "bg-soft text-accent-dark" : "bg-danger-soft text-danger"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${keyPresent ? "bg-accent" : "bg-danger"}`} />
            {data ? (data.ai.configured ? "模型已配置" : "模型密钥未就绪") : "正在连接…"}
          </span>
          <button type="button" title="测试千问模型连接（一次模型调用）" aria-label="测试千问连接" disabled={!data?.ai?.configured || checking}
            className="p-2 text-accent disabled:opacity-40" onClick={async () => {
              setChecking(true);
              try {
                const result = await api<{model:string}>("/api/model/check",{method:"POST"});
                setNotice(`连接成功：${result.model} 已返回有效的结构化结果。`);
              } catch (err) { setNotice(errorText(err)); } finally { setChecking(false); }
            }}>{checking ? <LoaderCircle className="animate-spin" size={16}/> : <PlugZap size={16}/>}</button>
          <button type="button" aria-expanded={loginExpanded || browser.manualPending} aria-controls="browser-login" onClick={() => setLoginExpanded(v => !v)} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-white px-3 py-1.5 font-medium hover:border-accent hover:text-accent">
            {browser.linkedin ? <CheckCircle2 size={13} /> : <Linkedin size={13} />}{browser.linkedin ? "LinkedIn 已连接 · 管理" : "连接 LinkedIn"}
          </button>
        </div>
      </div>

      {(loginExpanded || browser.manualPending) && <BrowserLogin status={browser} busy={agentBusy} onChange={status => { setBrowser(status); setLoginExpanded(true); }} />}

      {data?.ai?.issue && (
        <div className="mt-5"><Notice tone="error">{data.ai.issue}</Notice></div>
      )}
      {notice && <div className="mt-5"><Notice>{notice}</Notice></div>}

      <div className="mt-6 flex">
        <div role="tablist" aria-label="投递方式" className="mode-tabs inline-flex rounded-2xl p-1 text-sm">
          {([["search", "搜索并挑选岗位", Search], ["autopilot", "自动投递", Rocket]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold transition ${mode === key ? "bg-white text-accent shadow-sm" : "text-muted hover:text-ink"}`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "autopilot" ? (
        <AutopilotPanel
          direction={direction}
          onDirectionChange={setDirectionSelection}
          webSearchEnabled={Boolean(data?.ai?.configured && data.ai.webSearch)}
          onUploadResume={() => resumeInput.current?.click()}
          resumeBusy={resumeBusy}
          resumeLabel={data?.versions.find(v => v.id === profile?.originalResumeId)?.label}
          state={autopilot}
          defaultLocation={profile?.resume?.contact.location ?? ""}
          linkedInSignedIn={browser.linkedin}
          readiness={{ resume: hasResume && Boolean(profile?.originalResumeId), aiConfigured: Boolean(data?.ai?.configured), missingDetails }}
          onChange={setAutopilot}
        />
      ) : (
      <SearchPanel
        onUploadResume={() => resumeInput.current?.click()}
        resumeBusy={resumeBusy}
        uploadDisabled={agentBusy || !data?.ai?.configured}
        profileLoaded={data!==null}
        hasResume={hasResume}
        aiReady={Boolean(data?.ai?.configured && data.ai.webSearch)}
        defaultLocation={profile?.resume?.contact.location ?? ""}
        onResults={(found, errors, q) => {
          setJobs(found);
          setSearchErrors(errors);
          setSearched(q);
          setJobView("all");
          setSelected(found.find((job) => !feedback.some((item) => item.jobId === job.id && item.kind === "skipped")) ?? null);
          setTimeout(() => document.getElementById("jobs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
        }}
        onImported={(job) => {
          setJobs((all) => [job, ...all.filter((j) => j.id !== job.id)]);
          setSearched((s) => s || "导入的岗位");
          setJobView("all");
          setSelected(job);
          setTimeout(() => document.getElementById("jobs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
        }}
      />
      )}

      <ResumePanel
        key={profile?.originalResumeId ?? "no-resume"}
        inputRef={resumeInput}
        uploading={resumeBusy}
        setUploading={setResumeBusy}
        mutationDisabled={agentBusy}
        profile={profile}
        versions={data?.versions ?? []}
        onChange={loadProfile}
        generation={{
          aiConfigured: Boolean(data?.ai?.configured),
          jobs,
          selectedJob: selected,
          onSelectJob: setSelected,
          direction,
          onDirectionChange: setDirectionSelection,
          generationMode,
          onGenerationModeChange: setGenerationMode,
          translationDrafts: data?.translationDrafts ?? [],
          onTranslationDraft: (draft) => setData((current) => current ? { ...current, translationDrafts: [draft, ...(current.translationDrafts ?? []).filter((item) => item.id !== draft.id)] } : current),
        }}
      />

      {shownRun && (
        <div className="mt-6">
          <RunPanel
            key={shownRun.id}
            initial={shownRun}
            onUpdate={onRunUpdate}
            canRestart={!agentBusy}
            onRestart={(r) => start(r.jobId, r.resumeVersionId, r.autoSubmit)}
          />
        </div>
      )}

      <section id="jobs" className="mt-6 grid scroll-mt-6 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.95fr)]">
        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <Eyebrow>{jobView === "saved" ? "我的收藏" : "搜索结果"}</Eyebrow>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">{jobView === "saved" ? "感兴趣的机会" : searched ? `“${searched}”` : "从搜索开始，发现下一份工作"}</h2>
            </div>
            <span className="text-sm text-muted">{displayedJobs.length} 个岗位</span>
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="inline-flex rounded-lg border border-line-strong bg-white p-0.5" role="group" aria-label="岗位列表">
              <button type="button" aria-pressed={jobView === "all"} className={`rounded-md px-2.5 py-1.5 ${jobView === "all" ? "bg-soft text-accent-dark" : "text-muted hover:text-ink"}`} onClick={() => { setJobView("all"); setSelected(jobs.find((job) => !feedback.some((item) => item.jobId === job.id && item.kind === "skipped")) ?? null); }}>全部岗位</button>
              <button type="button" aria-pressed={jobView === "saved"} className={`rounded-md px-2.5 py-1.5 ${jobView === "saved" ? "bg-soft text-accent-dark" : "text-muted hover:text-ink"}`} onClick={() => { setJobView("saved"); setSelected(savedJobs[0] ?? null); }}>已收藏 ({savedJobs.length})</button>
            </div>
            {jobView === "all" && jobs.length > 0 && (
              <div className="inline-flex rounded-lg border border-line-strong bg-white p-0.5" role="group" aria-label="岗位排序">
                <button type="button" aria-pressed={jobSort === "fit"} className={`rounded-md px-2.5 py-1.5 ${jobSort === "fit" ? "bg-soft text-accent-dark" : "text-muted hover:text-ink"}`} onClick={() => setJobSort("fit")}>匹配优先</button>
                <button type="button" aria-pressed={jobSort === "for-you"} className={`rounded-md px-2.5 py-1.5 ${jobSort === "for-you" ? "bg-soft text-accent-dark" : "text-muted hover:text-ink"}`} onClick={() => setJobSort("for-you")}>为你推荐</button>
              </div>
            )}
          </div>
          {feedbackError && <div className="mb-3"><Notice tone="error">{feedbackError}</Notice></div>}
          {searchErrors.length > 0 && <div className="mb-3"><Notice tone="warn">{searchErrors.join(" · ")}</Notice></div>}
          {displayedJobs.length ? (
            [...new Set(displayedJobs.map(({job}) => job.searchView?.direction ?? ""))].map(group => <div key={group}>
              {group && <h3 className="my-2 font-medium">{group}</h3>}
              <JobList ranked={displayedJobs.filter(({job}) => (job.searchView?.direction ?? "") === group)} feedback={feedback} selectedId={selected?.id} busyId={feedbackBusyId} onSelect={setSelected} onFeedback={onFeedback} />
            </div>)
          ) : (
            <Card className="text-center">
              <p className="text-sm text-muted">
                {jobView === "saved" ? "还没有收藏。搜索后，点击岗位上的“收藏”即可在这里查看。" : searched ? "暂无符合条件的岗位，试试更宽泛的职位名称或其他地点。" : "搜索结果会显示在这里，并结合你的简历评估匹配度。"}
              </p>
            </Card>
          )}
        </div>
        <div>
          {selected ? (
            <JobPanel
              key={`${selected.id}:${selected.searchView?.direction ?? ""}:${selected.searchView?.match?.match_score ?? ""}`}
              job={selected}
              hasResume={hasResume}
              versions={data?.versions ?? []}
              originalId={profile?.originalResumeId ?? null}
              agentBusy={agentBusy}
              linkedInSignedIn={browser.linkedin}
              direction={direction}
              translationDrafts={data?.translationDrafts ?? []}
              onStart={start}
            />
          ) : (
            <Card className="lg:sticky lg:top-5">
              <Eyebrow>四步开始求职</Eyebrow>
              <ol className="mt-3 grid gap-3 text-sm text-muted">
                <li><strong className="text-ink">1. 准备简历。</strong> 上传文件或粘贴文本，整理你的经历与技能。</li>
                <li><strong className="text-ink">2. 发现岗位。</strong> 搜索招聘信息，也可以直接导入岗位链接。</li>
                <li><strong className="text-ink">3. 定制材料。</strong> 根据真实经历，生成适合岗位的简历与求职信。</li>
                <li><strong className="text-ink">4. 辅助投递。</strong> 助手在浏览器里填写申请，缺少信息时询问你，默认提交前由你确认。</li>
              </ol>
            </Card>
          )}
        </div>
      </section>

      <section id="email-applications" className="mt-8 scroll-mt-5"><EmailWorkspace embedded/></section>
      <div className="mt-6">
        <History
          runs={runs}
          selectedId={shownRun?.id}
          onOpen={(r) => {
            if (r.channel === "email") {
              document.getElementById("email-applications")?.scrollIntoView({ behavior: "smooth", block: "start" });
              return;
            }
            setShownRun(r);
            setTimeout(() => document.getElementById("agent")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
          }}
        />
      </div>
    </main>
  );
}
