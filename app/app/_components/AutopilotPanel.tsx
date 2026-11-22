"use client";
import { CheckCircle2, CircleAlert, MapPin, Play, Rocket, Square, Upload } from "lucide-react";
import { useState } from "react";
import type { AutopilotState } from "@/lib/agent/autopilot";
import type { ResumeDirection } from "@/lib/types";
import { RESUME_DIRECTIONS } from "@/lib/resume/directions";
import { api, errorText } from "./api";
import { Button, Field, inputCls, Notice, SourceBadge } from "./ui";

const ITEM_TEXT: Record<AutopilotState["items"][number]["state"], string> = {
  queued: "等待处理",
  preparing: "读取岗位",
  tailoring: "定制简历",
  applying: "填写申请",
  submitted: "已提交",
  skipped: "已跳过",
  failed: "失败",
  stopped: "未开始",
};
const ITEM_TONE: Record<AutopilotState["items"][number]["state"], string> = {
  queued: "bg-paper text-muted",
  preparing: "bg-soft text-accent-dark",
  tailoring: "bg-soft text-accent-dark",
  applying: "bg-soft text-accent-dark",
  submitted: "bg-accent text-white",
  skipped: "bg-paper text-muted",
  failed: "bg-danger-soft text-danger",
  stopped: "bg-paper text-muted",
};

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-50 ${on ? "border-accent bg-soft text-accent-dark" : "border-line-strong bg-white text-muted hover:border-accent"}`;

export function AutopilotPanel({
  state,
  defaultLocation,
  linkedInSignedIn,
  readiness,
  direction,
  onDirectionChange,
  webSearchEnabled,
  onUploadResume,
  resumeBusy,
  resumeLabel,
  onChange,
}: {
  state: AutopilotState | null;
  defaultLocation: string;
  linkedInSignedIn: boolean;
  readiness: { resume: boolean; aiConfigured: boolean; missingDetails: string[] };
  direction: ResumeDirection | "";
  onDirectionChange: (direction: ResumeDirection | "") => void;
  webSearchEnabled: boolean;
  onUploadResume: () => void;
  resumeBusy: boolean;
  resumeLabel?: string;
  onChange: (s: AutopilotState | null) => void;
}) {
  const [query, setQuery] = useState(state?.input.query ?? "");
  const [location, setLocation] = useState<string | null>(state?.input.location ?? null);
  const [limit, setLimit] = useState(state?.input.limit ?? 3);
  const [minFit, setMinFit] = useState(state?.input.minFit ?? 65);
  const [sources, setSources] = useState(state?.input.sources ?? { linkedin: true, web: webSearchEnabled });
  const [easyApplyOnly, setEasyApplyOnly] = useState(state?.input.easyApplyOnly ?? true);
  const [tailor, setTailor] = useState(state?.input.tailor ?? true);
  const [autoSubmit, setAutoSubmit] = useState(state?.input.autoSubmit ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = state?.status === "searching" || state?.status === "running";
  const loc = location ?? defaultLocation;
  const activeSources = { linkedin: sources.linkedin, web: sources.web && webSearchEnabled };
  const blockers = [
    ...(resumeBusy ? ["等待简历处理完成"] : []),
    ...(!readiness.resume ? ["上传并解析简历"] : []),
    ...(!readiness.aiConfigured ? ["配置可用的模型密钥"] : []),
    ...(!query.trim() ? ["填写目标岗位"] : []),
    ...(tailor && !direction ? ["选择下方的简历修改方向，或取消定制简历"] : []),
    ...(!activeSources.linkedin && !activeSources.web ? ["至少选择一个可用的职位来源"] : []),
  ];

  const start = async () => {
    if (blockers.length) return;
    setBusy(true);
    setError("");
    try {
      const { autopilot } = await api<{ autopilot: AutopilotState }>("/api/autopilot", {
        json: { action: "start", query: query.trim(), location: loc, limit, minFit, sources: activeSources, easyApplyOnly, tailor, autoSubmit, direction: direction || undefined },
      });
      onChange(autopilot);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      onChange((await api<{ autopilot: AutopilotState }>("/api/autopilot", { json: { action: "stop" } })).autopilot);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const submitted = state?.items.filter((i) => i.state === "submitted").length ?? 0;

  return (
    <section id="autopilot" className="enter my-5 scroll-mt-6">
      <div className="surface rounded-2xl border border-line bg-white p-5 sm:p-7">
        <div className="mb-6 border-b border-line pb-5">
          <p className="text-[11px] font-semibold tracking-[.16em] text-muted">AUTOPILOT</p>
          <h2 className="mt-2 text-xl font-semibold">从寻找机会，到准备投递。</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">自动搜索岗位、筛选匹配结果、定制简历并逐一填写申请。遇到缺失信息时会询问你{autoSubmit ? "；当前已开启自动提交。" : "，每次提交前等你确认。"}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
          <Field label="目标岗位">
            <input value={query} onChange={(e) => setQuery(e.target.value)} disabled={running} className={inputCls} placeholder="例如：算法工程师、数据分析师" />
          </Field>
          <Field label="地点">
            <span className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input value={loc} onChange={(e) => setLocation(e.target.value)} disabled={running} className={`${inputCls} pl-9`} placeholder="城市、国家或远程" />
            </span>
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="最多投递几个岗位">
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} disabled={running} className={inputCls}>
              {[1, 2, 3, 5, 8, 10].map((n) => (
                <option key={n} value={n}>{n} 个岗位</option>
              ))}
            </select>
          </Field>
          <Field label="最低匹配分数">
            <select value={minFit} onChange={(e) => setMinFit(Number(e.target.value))} disabled={running} className={inputCls}>
              {[50, 60, 65, 70, 75, 80].map((n) => (
                <option key={n} value={n}>{n}%</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" disabled={running} className={chip(sources.linkedin)} aria-pressed={sources.linkedin} onClick={() => setSources({ ...sources, linkedin: !sources.linkedin })}>
            LinkedIn
          </button>
          {sources.linkedin && (
            <button type="button" disabled={running} className={chip(easyApplyOnly)} aria-pressed={easyApplyOnly} onClick={() => setEasyApplyOnly(!easyApplyOnly)} title="仅选择 LinkedIn 站内快速申请的岗位，需要在助手浏览器中登录">
              仅快速申请
            </button>
          )}
          <button type="button" disabled={running || !webSearchEnabled} className={chip(activeSources.web)} aria-pressed={activeSources.web} onClick={() => setSources({ ...sources, web: !sources.web })}>
            企业招聘官网
          </button>
        </div>
        {!webSearchEnabled && <p className="mt-2 text-xs text-muted">企业招聘页联网搜索尚未启用；当前可使用 LinkedIn。</p>}

        <div className="mt-4 grid gap-2 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={tailor} disabled={running} onChange={(e) => setTailor(e.target.checked)} />
            <span>为每个岗位定制简历和求职信 <span className="text-muted">（每个岗位约 30 秒）</span></span>
          </label>
          {tailor && <Field label="自动投递的简历修改方向">
            <select aria-label="自动投递的简历修改方向" value={direction} onChange={(e) => onDirectionChange(e.target.value as ResumeDirection | "")} disabled={running} className={inputCls}>
              <option value="">请选择修改方向</option>
              {RESUME_DIRECTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>}
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={autoSubmit} disabled={running} onChange={(e) => setAutoSubmit(e.target.checked)} />
            <span>
              填写完成后自动提交
              <span className="block text-xs text-muted">默认关闭：助手完成填表后，等待你检查并确认提交。</span>
            </span>
          </label>
        </div>

        <ul className="mt-5 grid gap-1.5 rounded-2xl bg-paper px-4 py-3 text-sm">
          <li className="flex items-center gap-2">
            {readiness.resume ? <CheckCircle2 size={15} className="text-accent" /> : <CircleAlert size={15} className="text-danger" />}
            {readiness.resume ? "简历已上传" : "请先上传简历"}
          </li>
          <li className="flex items-center gap-2">
            {sources.linkedin && !linkedInSignedIn ? <CircleAlert size={15} className="text-warn" /> : <CheckCircle2 size={15} className="text-accent" />}
            {sources.linkedin ? (linkedInSignedIn ? "LinkedIn 已连接" : "建议先点击上方“连接 LinkedIn”，完成手动登录和检查，再启动自动投递") : "本次不使用 LinkedIn"}
          </li>
          <li className="flex items-start gap-2">
            {readiness.missingDetails.length ? <CircleAlert size={15} className="mt-0.5 shrink-0 text-warn" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-accent" />}
            {readiness.missingDetails.length
              ? `缺少以下资料，填写时会询问你：${readiness.missingDetails.join(", ")}`
              : "申请资料已补全"}
          </li>
        </ul>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={onUploadResume} busy={resumeBusy} disabled={running || !readiness.aiConfigured}>
            <Upload size={16} /> {readiness.resume ? "更换简历" : "上传简历"}
          </Button>
          {running ? (
            <Button variant="danger" onClick={stop} busy={busy}>
              <Square size={14} /> 停止自动投递
            </Button>
          ) : (
            <Button onClick={start} busy={busy} disabled={blockers.length > 0} aria-describedby="autopilot-readiness" className="px-5 py-3">
              <Rocket size={16} /> 开始自动投递
            </Button>
          )}
          {state && (
            <span className="text-sm text-muted">
              {state.status === "searching" && "正在搜索岗位并排序…"}
              {state.status === "running" && `正在处理 ${state.items.length} 个岗位 · 已提交 ${submitted} 个`}
              {state.status === "done" && `已完成 · ${state.items.length} 个岗位中已提交 ${submitted} 个`}
              {state.status === "stopped" && `已停止 · 已提交 ${submitted} 个`}
              {state.status === "failed" && "自动投递失败"}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">{readiness.resume ? `当前使用：${resumeLabel || "已上传的原始简历"}` : "支持 PDF / DOCX，上传后自动同步到下方简历区和 简历版本。"}</p>
        {!running && <p id="autopilot-readiness" role="status" className={`mt-3 text-sm ${blockers.length ? "text-warn" : "text-accent-dark"}`}>
          {blockers.length ? `启动前还需要：${blockers.join("；")}。` : "已满足启动条件。点击 开始自动投递 开始。"}
        </p>}
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        {state?.error && <div className="mt-4"><Notice tone={state.status === "failed" ? "error" : "warn"}>{state.error}</Notice></div>}
      </div>

      {state && state.items.length > 0 && (
        <ol className="mt-5 grid gap-2">
          {state.items.map((item, i) => (
            <li key={item.jobId} className="enter flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line bg-card px-4 py-3 text-sm">
              <span className="w-5 text-muted">{i + 1}.</span>
              <span className="min-w-0 flex-1">
                <a href={item.url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:text-accent">{item.title}</a>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {item.company} · {item.location} <SourceBadge source={item.source} />
                  {item.fit !== undefined && <span>匹配度 {item.fit}%</span>}
                </span>
                {item.note && <span className="mt-0.5 block text-xs text-muted">{item.note}</span>}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${ITEM_TONE[item.state]}`}>
                {["preparing", "tailoring", "applying"].includes(item.state) && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
                {ITEM_TEXT[item.state]}
              </span>
            </li>
          ))}
        </ol>
      )}

      {state && state.log.length > 0 && (
        <details className="mt-3 text-sm text-muted">
          <summary className="cursor-pointer select-none">自动投递日志 ({state.log.length})</summary>
          <ul className="mt-2 grid gap-1">
            {state.log.map((l, i) => (
              <li key={i}>
                <span className="text-[#a3a29c]">{new Date(l.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> {l.label}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!running && !state && (
        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted">
          <Play size={12} /> 建议先补全下方“申请资料”，减少填写过程中的停顿。
        </p>
      )}
    </section>
  );
}
