"use client";

import { useState } from "react";
import { CheckCircle2, LogIn, ShieldCheck } from "lucide-react";
import { api, errorText } from "./api";
import { Button, Card, Notice } from "./ui";

export type BrowserStatus = { open: boolean; linkedin: boolean; manualOpen: boolean; manualPending: boolean };

export function BrowserLogin({ status, busy, onChange }: {
  status: BrowserStatus; busy: boolean; onChange: (status: BrowserStatus) => void;
}) {
  const [action, setAction] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function run(next: "linkedin-login" | "check-login") {
    setAction(next); setMessage(""); setFailed(false);
    try {
      const result = await api<BrowserStatus>("/api/browser", { json: { action: next } });
      onChange(result);
      setMessage(next === "linkedin-login"
        ? "登录窗口已打开。请在那个窗口完成 LinkedIn 登录，然后关闭它的全部窗口，回到这里检查。"
        : result.linkedin
          ? "已检测到保存的 LinkedIn 登录凭据。现在可以选择岗位开始填表；若网站要求再次验证，仍需你完成。"
          : "没有检测到 LinkedIn 登录凭据。请重新打开登录窗口，确认已进入 LinkedIn 首页；只登录 Google 还不够。");
    } catch (error) { setMessage(errorText(error)); setFailed(true); }
    finally { setAction(""); }
  }
  return <Card id="browser-login" className="mt-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck size={20} className="text-accent" />先登录，再交给助手填表</h2>
      <span role="status" className="text-sm text-muted">{status.manualOpen ? "等待你完成登录" : status.manualPending ? "窗口已关闭，可以检查" : status.linkedin ? "已保存 LinkedIn 登录" : "尚未确认登录"}</span>
    </div>
    <p className="mt-2 text-sm text-muted">请使用下面打开的专用窗口。它和你平时的 Chrome / Edge 分开保存登录资料，登录时由你手动操作。</p>
    <div className="mt-5 grid gap-5 md:grid-cols-2">
      <div className="rounded-2xl border border-line bg-paper/60 p-4">
        <h3 className="font-semibold">1. 手动登录</h3>
        <p className="mb-4 mt-2 text-sm text-muted">打开普通浏览器窗口，完成 LinkedIn 登录。可以使用邮箱和密码，也可以尝试 Google 登录；以成功进入 LinkedIn 首页为准。</p>
        <Button variant="secondary" busy={action === "linkedin-login"} disabled={busy || Boolean(action) || status.manualOpen} onClick={() => void run("linkedin-login")}><LogIn size={16} />打开登录窗口</Button>
      </div>
      <div className="rounded-2xl border border-line bg-paper/60 p-4">
        <h3 className="font-semibold">2. 关闭窗口，检查登录</h3>
        <p className="mb-4 mt-2 text-sm text-muted">关闭刚才打开的全部登录窗口，再点击下方按钮。助手会重新打开浏览器，读取保存的登录状态，此时不会投递。</p>
        <Button variant="secondary" busy={action === "check-login"} disabled={busy || Boolean(action) || status.manualOpen} onClick={() => void run("check-login")}><CheckCircle2 size={16} />已关闭窗口，检查登录</Button>
      </div>
    </div>
    {status.manualOpen && <p className="mt-3 text-sm text-muted">如果关闭窗口后仍显示等待，请在这个专用浏览器的菜单中选择“退出”，再等几秒。</p>}
    {busy && <p className="mt-3 text-sm text-warn">请先完成或停止当前投递任务，再切换登录窗口。</p>}
    {message && <div role="status" className="mt-4"><Notice tone={failed ? "error" : "info"}>{message}</Notice></div>}
    <p className="mt-4 text-sm text-muted">检查完成后，先选 1 个岗位测试，保留“提交前确认”。企业官网可能还需要单独登录；Google 是否允许登录，需要实际测试。</p>
  </Card>;
}
