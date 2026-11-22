"use client";
import { AlertTriangle, CheckCircle2, CircleDot, Hand, MonitorPlay, MousePointerClick, RotateCcw, Send, Square, UserRound, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ApplicationRun, RunEvent } from "@/lib/types";
import { api, errorText } from "./api";
import { Button, Card, Eyebrow, inputCls, Notice } from "./ui";

export const STATUS_TEXT: Record<ApplicationRun["status"], string> = {
  running: "正在填写申请",
  needs_input: "需要补充信息",
  blocked: "等待你在浏览器中操作",
  awaiting_approval: "等待检查与确认",
  submitted: "申请已提交",
  skipped: "未投递",
  failed: "未能完成",
  cancelled: "已停止",
};

const ACTIVE = ["running", "needs_input", "blocked", "awaiting_approval"];

function EventIcon({ kind }: { kind: RunEvent["kind"] }) {
  const cls = "h-4 w-4";
  if (kind === "success") return <CheckCircle2 className={`${cls} text-accent`} />;
  if (kind === "error") return <XCircle className={`${cls} text-danger`} />;
  if (kind === "warning") return <AlertTriangle className={`${cls} text-warn`} />;
  if (kind === "user") return <UserRound className={`${cls} text-warn`} />;
  if (kind === "action") return <MousePointerClick className={`${cls} text-accent`} />;
  return <CircleDot className={`${cls} text-muted`} />;
}

export function RunPanel({
  initial,
  onUpdate,
  canRestart,
  onRestart,
}: {
  initial: ApplicationRun;
  onUpdate: (run: ApplicationRun) => void;
  canRestart: boolean;
  onRestart: (run: ApplicationRun) => Promise<void>;
}) {
  const [run, setRun] = useState(initial);
  const [frame, setFrame] = useState(0);
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const timeline = useRef<HTMLOListElement>(null);
  const active = ACTIVE.includes(run.status);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  const runId = run.id;
  useEffect(() => {
    if (!active) return;
    const tick = async () => {
      try {
        const { run: next } = await api<{ run: ApplicationRun }>(`/api/applications/${runId}`);
        setRun(next);
        onUpdateRef.current(next);
        setFrame(Date.now());
      } catch {
        /* transient; keep polling */
      }
    };
    const timer = setInterval(tick, 1500);
    return () => clearInterval(timer);
  }, [runId, active]);

  useEffect(() => {
    timeline.current?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [run.events.length]);

  const reply = async (type: string, text?: string) => {
    setSending(type);
    setError("");
    try {
      const { run: next } = await api<{ run: ApplicationRun }>(`/api/applications/${run.id}/reply`, { json: { type, answer: text } });
      if (next) {
        setRun(next);
        onUpdateRef.current(next);
      }
      setAnswer("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(null);
    }
  };

  const pending = run.pending;
  const tone =
    run.status === "submitted" ? "text-accent" : run.status === "failed" ? "text-danger" : ACTIVE.includes(run.status) && run.status !== "running" ? "text-warn" : "text-ink";

  return (
    <Card id="agent" className="enter">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>投递助手</Eyebrow>
          <h2 className={`mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight ${tone}`}>
            {run.status === "running" && <span className="pulse-dot inline-block h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />}
            {STATUS_TEXT[run.status]}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {run.job.title} · {run.job.company} · 第 {run.steps} 步 · {(run.usage.inputTokens + run.usage.outputTokens).toLocaleString()} tokens
          </p>
        </div>
        {active ? (
          <Button variant="danger" onClick={() => reply("cancel")} busy={sending === "cancel"}>
            <Square size={14} /> 停止填写
          </Button>
        ) : (
          run.status !== "submitted" && (
            <Button
              variant="secondary"
              disabled={!canRestart}
              busy={sending === "restart"}
              title={canRestart ? "重新打开岗位页面，从头填写" : "另一个申请正在进行"}
              onClick={async () => {
                setSending("restart");
                setError("");
                try {
                  await onRestart(run);
                } catch (err) {
                  setError(errorText(err));
                } finally {
                  setSending(null);
                }
              }}
            >
              <RotateCcw size={14} /> 重新开始
            </Button>
          )
        )}
      </div>

      {pending?.type === "question" && (
        <div className="enter mt-5 rounded-2xl border border-[#ecdcb5] bg-warn-soft p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-warn"><UserRound size={16} /> 请补充以下申请信息</p>
          <p className="mt-2 text-[15px]">{pending.question}</p>
          {pending.fields.length > 0 && <p className="mt-1 text-xs text-muted">对应字段：{pending.fields.join(", ")}</p>}
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void reply("answer", answer);
            }}
          >
            <input autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} className={inputCls} placeholder="填写回答，下次申请时可复用" aria-label="你的回答" />
            <Button type="submit" busy={sending === "answer"} disabled={!answer.trim()}>
              <Send size={15} /> 发送回答
            </Button>
          </form>
        </div>
      )}

      {pending?.type === "user_action" && (
        <div className="enter mt-5 rounded-2xl border border-[#ecdcb5] bg-warn-soft p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-warn"><Hand size={16} /> 请在 Chrome 窗口中完成操作</p>
          <p className="mt-2 text-[15px]">{pending.message}</p>
          <p className="mt-1 text-xs text-muted">请在助手打开的浏览器中完成登录或验证，再点击继续。</p>
          <Button className="mt-3" onClick={() => reply("continue")} busy={sending === "continue"}>已完成，继续</Button>
        </div>
      )}

      {pending?.type === "approval" && (
        <div className="enter mt-5 rounded-2xl border border-accent/30 bg-soft p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-accent-dark"><CheckCircle2 size={16} /> 表格已填写，请检查后确认提交。</p>
          <p className="mt-2 text-[15px]">{pending.summary}</p>
          {pending.unresolved.length > 0 && (
            <p className="mt-2 text-sm text-warn"><strong>留空或待确认：</strong> {pending.unresolved.join("; ")}</p>
          )}
          <p className="mt-2 text-xs text-muted">可在 Chrome 窗口检查并修改表格，确认无误后提交。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => reply("approve")} busy={sending === "approve"}>
              <Send size={15} /> 确认并提交
            </Button>
            <Button variant="secondary" onClick={() => reply("cancel")} busy={sending === "cancel"}>
              取消提交
            </Button>
          </div>
        </div>
      )}

      {run.outcome && !active && (
        <div className="mt-5">
          <Notice tone={run.status === "submitted" ? "info" : run.status === "failed" ? "error" : "warn"}>{run.outcome}</Notice>
        </div>
      )}
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

      <div className="mt-6 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <ol ref={timeline} className="max-h-[520px] space-y-3 overflow-y-auto pr-1" aria-label="助手执行进度">
          {run.events.map((e, i) => (
            <li key={i} className="flex gap-2.5 text-sm">
              <span className="mt-0.5"><EventIcon kind={e.kind} /></span>
              <div className="min-w-0">
                <p className="font-medium leading-snug">{e.label}</p>
                {e.detail && <p className="mt-0.5 whitespace-pre-line break-words text-xs text-muted">{e.detail}</p>}
                <p className="mt-0.5 text-[11px] text-[#a3a29c]">{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
              </div>
            </li>
          ))}
        </ol>
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            <MonitorPlay size={14} /> {active ? "浏览器实时画面" : "最后一次浏览器画面"}
            {run.currentUrl && <span className="truncate">· {run.currentUrl}</span>}
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-paper">
            {/* eslint-disable-next-line @next/next/no-img-element -- live JPEG frames from the agent, not a static asset */}
            <img
              src={`/api/applications/${run.id}/screen?t=${frame}`}
              alt="助手浏览器画面"
              className="block aspect-[1280/860] w-full object-cover object-top"
              onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
              onLoad={(e) => ((e.target as HTMLImageElement).style.visibility = "visible")}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
