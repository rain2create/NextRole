"use client";
import { ChevronDown, Download, FileText, Github, Linkedin, Mail, MapPin, Phone, Trash2, Upload } from "lucide-react";
import { useState, type DragEvent, type RefObject } from "react";
import type { Preferences, Profile, ResumeData, ResumeVersion } from "@/lib/types";
import { api, errorText } from "./api";
import { ResumeGenerationPanel, type ResumeGenerationProps } from "./ResumeGenerationPanel";
import { Button, Card, Eyebrow, Field, inputCls, Notice, Spinner } from "./ui";



type Contact = ResumeData["contact"];
const CONTACT_FIELDS: { key: keyof Contact; label: string; placeholder: string }[] = [
  { key: "location", label: "当前所在地", placeholder: "例如：中国上海" },
  { key: "phone", label: "电话（含国家区号）", placeholder: "例如：+86 138 0000 0000" },
  { key: "linkedin", label: "LinkedIn 个人主页", placeholder: "https://www.linkedin.com/in/…" },
  { key: "website", label: "作品集 / 个人网站", placeholder: "选填" },
];

const PREF_FIELDS: { key: keyof Preferences; label: string; placeholder: string; long?: boolean }[] = [
  { key: "workAuthorization", label: "工作许可", placeholder: "例如：中国公民，可在中国工作" },
  { key: "requiresSponsorship", label: "是否需要签证支持", placeholder: "是 / 否" },
  { key: "yearsOfExperience", label: "工作年限", placeholder: "例如：2 年" },
  { key: "noticePeriod", label: "离职通知期 / 到岗时间", placeholder: "例如：30 天内可到岗" },
  { key: "currentCompensation", label: "当前薪资", placeholder: "例如：税前月薪 15,000 元" },
  { key: "expectedCompensation", label: "期望薪资", placeholder: "例如：税前月薪 20,000 元" },
  { key: "willingToRelocate", label: "是否愿意异地工作", placeholder: "愿意 / 不愿意 / 仅限国内" },
  { key: "pronouns", label: "人称代词（选填）", placeholder: "不填写可跳过" },
  { key: "demographics", label: "平等就业 / 人口统计问题", placeholder: "例如：不愿提供" },
  { key: "extraNotes", label: "其他申请偏好", placeholder: "例如：倾向混合办公，工作日 18 点后可面试", long: true },
];

export function ResumePanel({
  profile,
  versions,
  onChange,
  generation,
  inputRef,
  uploading,
  setUploading,
  mutationDisabled,
}: {
  profile: Profile | null;
  versions: ResumeVersion[];
  onChange: () => Promise<void>;
  generation: Omit<ResumeGenerationProps, "hasResume" | "onChange">;
  inputRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;
  setUploading: (busy: boolean) => void;
  mutationDisabled: boolean;
}) {
  const input = inputRef;
  const unavailable = uploading || mutationDisabled;
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(false);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [inputMode, setInputMode] = useState<"file" | "text">("file");
  const [resumeText, setResumeText] = useState("");
  const resume = profile?.resume;
  const draft = prefs ?? profile?.preferences ?? null;
  const contactDraft = contact ?? resume?.contact ?? null;

  const upload = async (file?: File) => {
    if (!file || unavailable) return;
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("resume", file);
      await api("/api/resume", { method: "POST", body });
      await onChange();
      setPrefs(null);
      setContact(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  const readText = async () => {
    if (!resumeText.trim() || unavailable) return;
    setUploading(true);
    setError("");
    try {
      await api("/api/resume", { json: { text: resumeText } });
      await onChange();
      setPrefs(null);
      setContact(null);
      setResumeText("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (version: ResumeVersion) => {
    if (unavailable) return;
    const current = version.id === profile?.originalResumeId;
    if (!window.confirm(current
      ? "移除当前简历？移除后需要重新上传才能启动自动投递。历史投递附件仍保留。"
      : "从简历版本列表移除此版本？历史投递附件仍保留。")) return;
    setUploading(true);
    setError("");
    try {
      await api(`/api/resume/${version.id}`, { method: "DELETE" });
      await onChange();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void upload(e.dataTransfer.files[0]);
  };

  const savePrefs = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await api("/api/profile", { method: "PUT", json: { preferences: draft, contact: contactDraft ?? undefined } });
      await onChange();
      setPrefs(null);
      setContact(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const missing = draft
    ? [...(["workAuthorization", "requiresSponsorship", "noticePeriod", "expectedCompensation"] as const).filter((k) => !draft[k]), ...(contactDraft?.location ? [] : ["location"])]
    : [];

  return (
    <Card id="resume" className="enter">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>我的简历</Eyebrow>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            {resume ? resume.name : <>从一份简历开始</>}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {resume
              ? resume.headline || "助手会使用简历和申请资料中的真实信息来填写表格。"
              : "上传 PDF / DOCX，或直接粘贴中文、英文简历，读取后可按方向或岗位 JD 定制。"}
          </p>
        </div>
        {resume && (
          <Button variant="secondary" onClick={() => input.current?.click()} busy={uploading} disabled={unavailable}>
            <Upload size={15} /> 更换简历文件
          </Button>
        )}
      </div>

      <input ref={input} aria-label="上传简历文件" type="file" accept=".pdf,.docx" className="hidden" disabled={unavailable} onChange={(e) => void upload(e.target.files?.[0])} />

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="简历输入方式">
        <Button variant={inputMode === "file" ? "secondary" : "ghost"} disabled={unavailable} aria-pressed={inputMode === "file"} onClick={() => { setInputMode("file"); input.current?.click(); }}>上传简历文件</Button>
        <Button variant={inputMode === "text" ? "secondary" : "ghost"} disabled={uploading} aria-pressed={inputMode === "text"} onClick={() => setInputMode("text")}>粘贴简历文本</Button>
      </div>

      {inputMode === "text" && (
        <div className="mt-3 grid gap-3 rounded-2xl border border-line bg-paper p-4">
          <Field label="中文或英文简历文本" hint={resume ? "读取后将替换当前基础简历；已生成的历史版本仍会保留。" : "可直接输入姓名、联系方式、教育经历、工作经历、项目和技能，保持原有段落即可。"}>
            <textarea aria-label="中文或英文简历文本" rows={8} maxLength={30000} className={inputCls} value={resumeText} disabled={uploading} onChange={(e) => setResumeText(e.target.value)} placeholder="张三\n求职意向：后端开发工程师\n教育经历：……\n工作经历：……\n项目经历：……\n专业技能：……" />
          </Field>
          <div><Button onClick={readText} busy={uploading} disabled={!resumeText.trim() || unavailable}>读取简历信息</Button></div>
        </div>
      )}

      {!resume && inputMode === "file" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={`mt-4 grid place-items-center rounded-2xl border border-dashed px-4 py-9 text-center transition ${drag ? "border-accent bg-soft" : "border-line-strong bg-paper"}`}
        >
          {uploading ? (
            <Spinner label="正在读取简历…" />
          ) : (
            <>
              <FileText className="text-accent" />
              <p className="mt-2 text-sm font-medium">拖入中文或英文简历</p>
              <p className="text-xs text-muted">PDF 或 DOCX，最大 8 MB；扫描件请先转为可复制文字的文档</p>
              <Button className="mt-3" disabled={unavailable} onClick={() => input.current?.click()}>
                <Upload size={15} /> 选择文件
              </Button>
            </>
          )}
        </div>
      )}

      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

      <ResumeGenerationPanel key={profile?.originalResumeId ?? "empty"} {...generation} versions={versions} sourceResumeId={profile?.originalResumeId ?? null} sourceResume={resume ?? null} sourceResumeText={profile?.resumeText ?? ""} hasResume={Boolean(resume) && !uploading} onChange={onChange} />

      {resume && (
        <>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            {resume.contact.email && <span className="inline-flex items-center gap-1.5"><Mail size={14} />{resume.contact.email}</span>}
            {resume.contact.phone && <span className="inline-flex items-center gap-1.5"><Phone size={14} />{resume.contact.phone}</span>}
            {resume.contact.location && <span className="inline-flex items-center gap-1.5"><MapPin size={14} />{resume.contact.location}</span>}
            {resume.contact.linkedin && <a className="inline-flex items-center gap-1.5 hover:text-accent" href={resume.contact.linkedin} target="_blank" rel="noreferrer"><Linkedin size={14} />LinkedIn</a>}
            {resume.contact.github && <a className="inline-flex items-center gap-1.5 hover:text-accent" href={resume.contact.github} target="_blank" rel="noreferrer"><Github size={14} />GitHub</a>}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {resume.skills.flatMap((g) => g.items).slice(0, 18).map((s) => (
              <span key={s} className="rounded-full bg-soft px-2.5 py-1 text-xs font-medium text-accent-dark">{s}</span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            {resume.experience.length} 段工作经历 · {resume.projects.length} 个项目 ·{" "}
            {resume.education.length} 段教育经历已解析
          </p>

          {missing.length > 0 && !open && (
            <div className="mt-4">
              <Notice tone="warn">
                补全所在地、工作许可、到岗时间和期望薪资，可减少自动填表时的询问。
              </Notice>
            </div>
          )}

          <button
            onClick={() => setOpen(!open)}
            className="mt-4 flex w-full items-center justify-between rounded-xl border border-line px-4 py-3 text-left text-sm font-semibold hover:border-line-strong"
            aria-expanded={open}
          >
            申请资料 · 用于自动填表
            <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
          </button>
          {open && draft && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {contactDraft &&
                CONTACT_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <input className={inputCls} placeholder={f.placeholder} value={contactDraft[f.key]} onChange={(e) => setContact({ ...contactDraft, [f.key]: e.target.value })} />
                  </Field>
                ))}
              {PREF_FIELDS.map((f) => (
                <div key={f.key} className={f.long ? "sm:col-span-2" : ""}>
                  <Field label={f.label}>
                    {f.long ? (
                      <textarea rows={2} className={inputCls} placeholder={f.placeholder} value={draft[f.key]} onChange={(e) => setPrefs({ ...draft, [f.key]: e.target.value })} />
                    ) : (
                      <input className={inputCls} placeholder={f.placeholder} value={draft[f.key]} onChange={(e) => setPrefs({ ...draft, [f.key]: e.target.value })} />
                    )}
                  </Field>
                </div>
              ))}
              <div className="flex items-center gap-3 sm:col-span-2">
                <Button onClick={savePrefs} busy={saving} disabled={!prefs && !contact}>保存资料</Button>
                {saved && <span className="text-sm text-accent">已保存</span>}
              </div>
              {profile!.answers.length > 0 && (
                <div className="sm:col-span-2">
                  <p className="mt-2 text-sm font-semibold">已保存的问答</p>
                  <ul className="mt-2 grid gap-2">
                    {profile!.answers.slice(-6).reverse().map((a) => (
                      <li key={a.savedAt} className="rounded-xl bg-paper px-3 py-2 text-xs text-muted">
                        <span className="font-medium text-ink">{a.question}</span>
                        <br />
                        {a.answer}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

        </>
      )}
          {versions.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-semibold">简历版本</p>
              <ul className="mt-2 grid min-w-0 gap-2">
                {versions.slice(0, 6).map((v) => (
                  <li key={v.id} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm" data-testid={`resume-version-${v.id}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{v.label}</span>
                      <span className="text-xs text-muted">
                        {v.id === profile?.originalResumeId ? "当前使用 · " : ""}{v.kind === "tailored" ? "岗位专属 PDF + 求职信" : v.kind === "base" ? "方向版 PDF" : "原始简历"} · {new Date(v.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                    <a href={`/api/resume/${v.id}?download`} className="shrink-0 rounded-lg p-2 text-muted hover:bg-paper hover:text-accent" aria-label={`下载${v.label}`}>
                      <Download size={16} />
                    </a>
                    <button type="button" disabled={unavailable} onClick={() => void remove(v)} aria-label={`移除 ${v.label}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg p-2 text-muted hover:bg-paper hover:text-danger disabled:opacity-40">
                      <Trash2 size={15} /> 移除
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
    </Card>
  );
}
