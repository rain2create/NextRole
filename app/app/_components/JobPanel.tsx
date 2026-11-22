"use client";
import { ArrowUpRight, Bot, Check, ChevronDown, Gauge, Info, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { detectJobLanguage } from "@/lib/resume/language";
import type { Job, Match, ResumeDirection, ResumeTranslationDraft, ResumeVersion } from "@/lib/types";
import { api, errorText, timeAgo } from "./api";
import { Button, Card, Eyebrow, Notice, SourceBadge, Spinner } from "./ui";

export function JobPanel({
  job,
  hasResume,
  versions,
  originalId,
  agentBusy,
  linkedInSignedIn,
  direction,
  translationDrafts = [],
  onStart,
}: {
  job: Job;
  hasResume: boolean;
  versions: ResumeVersion[];
  originalId: string | null;
  agentBusy: boolean;
  linkedInSignedIn: boolean;
  direction: ResumeDirection | "";
  translationDrafts?: ResumeTranslationDraft[];
  onStart: (jobId: string, versionId: string, autoSubmit: boolean) => Promise<void>;
}) {
  // Keyed by job id in the parent, so state resets per job.
  const [detail, setDetail] = useState<Job>(job);
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<Match | null>(job.searchView?.match ?? null);
  const [matching, setMatching] = useState(false);
  const [showDesc, setShowDesc] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const outputLanguage = !loading && detail.description?.trim() ? detectJobLanguage(detail.description) : undefined;
  const translationPending = outputLanguage === "en" && translationDrafts.some((draft) => draft.sourceResumeId === originalId && draft.direction === direction && draft.jobId === job.id && (draft.outputLanguage ?? "en") === outputLanguage);
  const tailoredVersion = direction && outputLanguage && !translationPending ? versions.find((v) => v.kind === "tailored" && v.jobId === job.id && v.sourceResumeId === originalId && v.direction === direction && v.outputLanguage === outputLanguage) : undefined;
  const [useTailored, setUseTailored] = useState(true);
  const chosenVersion = useTailored && tailoredVersion ? tailoredVersion.id : originalId;

  const jobId = job.id;
  useEffect(() => {
    let alive = true;
    api<{ job: Job }>(`/api/jobs/${encodeURIComponent(jobId)}`)
      .then(({ job: full }) => alive && setDetail(full))
      .catch((err) => alive && setError(errorText(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [jobId]);

  const runMatch = async () => {
    setMatching(true);
    setError("");
    try {
      setMatch((await api<{ match: Match }>(`/api/jobs/${encodeURIComponent(job.id)}/match`, { method: "POST" })).match);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setMatching(false);
    }
  };

  const start = async () => {
    if (!chosenVersion) return;
    setStarting(true);
    setError("");
    try {
      await onStart(job.id, chosenVersion, autoSubmit);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setStarting(false);
    }
  };

  return (
    <Card className="enter lg:sticky lg:top-5 lg:max-h-[calc(100vh-2.5rem)] lg:overflow-y-auto">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SourceBadge source={detail.source} />
            {detail.postedAt && <span className="text-xs text-muted">Posted {timeAgo(detail.postedAt)}</span>}
          </div>
          <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">{detail.title || "Job posting"}</h2>
          <p className="mt-1 text-sm text-muted">
            {[detail.company, detail.location, detail.employmentType, detail.seniority].filter(Boolean).join(" · ")}
          </p>
        </div>
        <a href={detail.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-line px-3 py-2 text-sm text-muted hover:border-accent hover:text-accent">
          Open <ArrowUpRight size={14} />
        </a>
      </div>

      {detail.applyNote && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-paper px-3 py-2 text-xs text-muted">
          <Info size={14} className="mt-0.5 shrink-0" />
          {detail.applyNote}
        </p>
      )}

      {loading ? (
        <div className="mt-5"><Spinner label="Loading the full job description…" /></div>
      ) : detail.description ? (
        <div className="mt-4">
          <button onClick={() => setShowDesc(!showDesc)} className="flex items-center gap-1 text-sm font-semibold text-accent" aria-expanded={showDesc}>
            Job description <ChevronDown className={`h-4 w-4 transition ${showDesc ? "rotate-180" : ""}`} />
          </button>
          {showDesc && <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-line rounded-xl bg-paper p-3 text-sm leading-relaxed text-[#45443f]">{detail.description}</div>}
        </div>
      ) : (
        <div className="mt-4"><Notice tone="warn">The description couldn&apos;t be fetched from the server. The agent can still open and apply on the original page.</Notice></div>
      )}

      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

      {!hasResume && (
        <div className="mt-5"><Notice tone="warn">Upload your resume above to analyze the match, tailor a resume and apply.</Notice></div>
      )}

      <div className="mt-6 border-t border-line pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Gauge size={17} className="text-accent" />
            <h3 className="font-semibold">Match analysis</h3>
          </div>
          {!match && (
            <Button variant="secondary" onClick={runMatch} busy={matching} disabled={!hasResume || loading || !detail.description}>
              Analyze
            </Button>
          )}
        </div>
        {match && (
          <div className="enter mt-3">
            <div className="flex items-end gap-3">
              <span className="text-4xl font-semibold tracking-tight text-accent">{match.match_score}</span>
              <span className="mb-1 text-xs text-muted">/ 100 · an estimate, not a verdict</span>
            </div>
            <p className="mt-2 text-sm text-[#45443f]">{match.summary}</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Evidence</p>
                {match.matching_evidence.map((x) => (
                  <p key={x} className="mt-1.5 flex gap-1.5 text-sm text-accent-dark"><Check size={15} className="mt-0.5 shrink-0" />{x}</p>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Gaps</p>
                {match.missing_requirements.map((x) => (
                  <p key={x} className="mt-1.5 flex gap-1.5 text-sm text-muted"><Plus size={15} className="mt-0.5 shrink-0" />{x}</p>
                ))}
              </div>
            </div>
            {match.questions_for_user.length > 0 && (
              <div className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
                <strong>Worth confirming:</strong> {match.questions_for_user.join(" ")}
              </div>
            )}
          </div>
        )}
      </div>

      <div id="apply" className="mt-6 border-t border-line pt-5">
        <div className="flex items-center gap-2">
          <Bot size={17} className="text-accent" />
          <h3 className="font-semibold">Apply with the browser agent</h3>
        </div>
        <p className="mt-2 text-sm text-muted">
          Opens the real application in a visible Chrome window, fills it from your resume and details, uploads your resume, and stops for your approval before submitting.
        </p>
        {detail.source === "linkedin" && !linkedInSignedIn && (
          <div className="mt-3"><Notice tone="warn">LinkedIn jobs need you signed in to LinkedIn in the agent&apos;s browser. Use “Connect LinkedIn” at the top, or the agent will pause and ask you to sign in.</Notice></div>
        )}
        <fieldset className="mt-4 grid gap-2 text-sm">
          <legend className="mb-1 font-medium">Resume to upload</legend>
          {tailoredVersion && (
            <label className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
              <input type="radio" name={`ver-${job.id}`} checked={useTailored} onChange={() => setUseTailored(true)} />
              <span>Tailored PDF for {detail.company} <span className="text-muted">(+ cover letter)</span></span>
            </label>
          )}
          <label className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
            <input type="radio" name={`ver-${job.id}`} checked={!useTailored || !tailoredVersion} onChange={() => setUseTailored(false)} disabled={!originalId} />
            <span>Your original upload</span>
          </label>
        </fieldset>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={autoSubmit} onChange={(e) => setAutoSubmit(e.target.checked)} />
          <span>
            Submit automatically when the form is complete
            <span className="block text-xs text-muted">Off by default: the agent waits for you to review and approve the final click.</span>
          </span>
        </label>
        <Button className="mt-4 w-full py-3" onClick={start} busy={starting} disabled={!hasResume || !chosenVersion || agentBusy || loading}>
          <Bot size={17} /> {agentBusy ? "Another application is running" : "Run application agent"}
        </Button>
      </div>
    </Card>
  );
}
