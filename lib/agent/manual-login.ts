import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config, dataPath } from "../config";
import { UserFacingError } from "../ai";

type LoginSession = { pid: number; channel: string };
const marker = () => dataPath("manual-login.json");
const channelMarker = () => dataPath("browser-channel.json");

export async function savedBrowserChannel(): Promise<string | undefined> {
  try { return (JSON.parse(await fs.readFile(channelMarker(), "utf8")) as { channel: string }).channel; }
  catch { return undefined; }
}

export async function rememberBrowserChannel(channel: string) {
  await fs.mkdir(dataPath(), { recursive: true });
  await fs.writeFile(channelMarker(), JSON.stringify({ channel }));
}

export async function manualLoginStatus() {
  let session: LoginSession;
  try { session = JSON.parse(await fs.readFile(marker(), "utf8")); }
  catch { return { manualOpen: false, manualPending: false }; }
  let manualOpen = false;
  if (Number.isSafeInteger(session.pid) && session.pid > 0) {
    try { process.kill(session.pid, 0); manualOpen = true; }
    catch (error) { manualOpen = (error as NodeJS.ErrnoException).code === "EPERM"; }
  }
  return { manualOpen, manualPending: true };
}

export async function clearManualLogin() { await fs.rm(marker(), { force: true }); }

function executableCandidates(channel: string) {
  if (process.platform === "win32") {
    const suffix = channel === "msedge" ? ["Microsoft", "Edge", "Application", "msedge.exe"] : ["Google", "Chrome", "Application", "chrome.exe"];
    return [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]
      .filter((root): root is string => Boolean(root)).map(root => path.join(root, ...suffix));
  }
  if (process.platform === "darwin") return [channel === "msedge"
    ? "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  return channel === "msedge" ? ["/opt/microsoft/msedge/msedge", "/usr/bin/microsoft-edge"]
    : ["/opt/google/chrome/chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"];
}

export async function launchManualLogin() {
  const pinned = await savedBrowserChannel();
  const candidates = pinned ? [pinned] : [...new Set([config.browserChannel(), "chrome", "msedge"])];
  for (const channel of candidates) {
    if (!["chrome", "msedge"].includes(channel)) continue;
    for (const executable of executableCandidates(channel)) {
      if (!await fs.access(executable).then(() => true, () => false)) continue;
      await fs.mkdir(dataPath("browser-profile"), { recursive: true });
      // A regular interactive browser: no automation or remote-debugging flags.
      // Only NextRole's dedicated profile is used; personal browser profiles are untouched.
      const child = spawn(executable, [
        `--user-data-dir=${dataPath("browser-profile")}`, "--no-first-run", "--no-default-browser-check",
        "--new-window", "https://www.linkedin.com/login",
      ], { detached: true, stdio: "ignore", windowsHide: false });
      await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
      child.unref();
      await rememberBrowserChannel(channel);
      await fs.writeFile(marker(), JSON.stringify({ pid: child.pid, channel }));
      // A launch handed to another process or a locked profile must not look successful.
      await new Promise(resolve => setTimeout(resolve, 700));
      if (child.exitCode !== null) throw new UserFacingError("登录窗口未能保持打开。请先退出之前的 NextRole 登录窗口，再重新打开。");
      return;
    }
  }
  throw new UserFacingError("未找到可用的 Chrome 或 Edge。请安装对应浏览器后再打开登录窗口。");
}
