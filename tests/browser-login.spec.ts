import { expect, test } from "@playwright/test";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { agentContext, assertBrowserAvailable, browserStatus, checkManualLogin, closeAgentBrowser, startManualLogin } from "../lib/agent/browser";
import { manualLoginStatus, rememberBrowserChannel } from "../lib/agent/manual-login";
import { startAutopilot } from "../lib/agent/autopilot";

let directory: string;
let holder: ChildProcess | undefined;
let manualPid: number | undefined;
let previous: { data?: string; headless?: string; channel?: string };
test.beforeEach(async () => {
  previous = { data: process.env.NEXTROLE_DATA_DIR, headless: process.env.HEADLESS, channel: process.env.BROWSER_CHANNEL };
  directory = await fs.mkdtemp(path.join(tmpdir(), "nextrole-login-test-"));
  process.env.NEXTROLE_DATA_DIR = directory;
  process.env.HEADLESS = "true";
  process.env.BROWSER_CHANNEL = process.env.PW_CHANNEL || (process.platform === "win32" ? "chrome" : "chromium");
});
test.afterEach(async () => {
  await closeAgentBrowser();
  holder?.kill(); holder = undefined;
  // Only a browser launched by this test with its disposable profile can be stopped here.
  if (manualPid) { try { process.kill(manualPid); } catch {} manualPid = undefined; }
  for (const [key, value] of Object.entries({ NEXTROLE_DATA_DIR: previous.data, HEADLESS: previous.headless, BROWSER_CHANNEL: previous.channel })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  if (path.dirname(directory) === tmpdir() && path.basename(directory).startsWith("nextrole-login-test-")) {
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 4 }).catch(() => {});
  }
});

test("manual login owns the profile until its process exits, including after state reload", async () => {
  holder = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  await new Promise<void>((resolve, reject) => { holder!.once("spawn", resolve); holder!.once("error", reject); });
  await fs.writeFile(path.join(directory, "manual-login.json"), JSON.stringify({ pid: holder.pid, channel: "chrome" }));
  // A cached previous sign-in must not make a new manual session look verified.
  await fs.writeFile(path.join(directory, "linkedin-session.json"), JSON.stringify({ signedIn: true }));
  await expect(browserStatus()).resolves.toMatchObject({ manualOpen: true, manualPending: true, linkedin: false });
  await expect(assertBrowserAvailable()).rejects.toThrow("关闭全部");
  await expect(agentContext()).rejects.toThrow("关闭全部");
  await expect(checkManualLogin()).rejects.toThrow("关闭全部");
  await expect(startManualLogin()).rejects.toThrow("已经打开");
  await expect(startAutopilot({ query: "test", location: "", limit: 1, minFit: 0, sources: { linkedin: true, web: false }, easyApplyOnly: false, tailor: false, autoSubmit: false })).rejects.toThrow("关闭全部");
  holder.kill();
  await expect.poll(async () => (await manualLoginStatus()).manualOpen).toBe(false);
  await expect(manualLoginStatus()).resolves.toEqual({ manualOpen: false, manualPending: true });
  await expect(assertBrowserAvailable()).resolves.toBeUndefined();
});

test("handoff reuses dedicated persistent cookies and clears pending state without starting an application", async () => {
  await rememberBrowserChannel(process.env.BROWSER_CHANNEL!);
  const first = await agentContext();
  await first.addCookies([{ name: "handoff-fixture", value: "fixture-only", domain: "example.org", path: "/", expires: Math.floor(Date.now() / 1000) + 3600 }]);
  await closeAgentBrowser();
  await fs.writeFile(path.join(directory, "manual-login.json"), JSON.stringify({ pid: -1, channel: "chrome" }));
  const result = await checkManualLogin();
  expect(result).toMatchObject({ manualOpen: false, manualPending: false, open: true, linkedin: false });
  expect((await (await agentContext()).cookies("https://example.org")).some(cookie => cookie.name === "handoff-fixture")).toBe(true);
  expect(await fs.readdir(directory)).not.toContain("application-runs.json");
});

test("Windows ordinary browser launch has no automation flags and hands its saved profile back", async () => {
  test.skip(process.platform !== "win32", "Native Windows browser smoke test.");
  const first = await agentContext();
  await first.addCookies([{ name: "manual-handoff-fixture", value: "fixture-only", domain: "example.org", path: "/", expires: Math.floor(Date.now() / 1000) + 3600 }]);
  await startManualLogin();
  manualPid = (JSON.parse(await fs.readFile(path.join(directory, "manual-login.json"), "utf8")) as { pid: number }).pid;
  expect(Number.isSafeInteger(manualPid)).toBe(true);
  const powershell = (command: string) => promisify(execFile)("powershell.exe", ["-NoProfile", "-Command", command], { windowsHide: true });
  const { stdout } = await powershell(`(Get-CimInstance Win32_Process -Filter 'ProcessId = ${manualPid}').CommandLine`);
  expect(stdout).toContain(path.join(directory, "browser-profile"));
  expect(stdout).not.toMatch(/enable-automation|remote-debugging|disable-blink-features/);
  await expect(manualLoginStatus()).resolves.toEqual({ manualOpen: true, manualPending: true });
  await expect.poll(async () => (await powershell(`(Get-Process -Id ${manualPid}).CloseMainWindow()`)).stdout.trim(), { timeout: 10000 }).toBe("True");
  await expect.poll(async () => (await manualLoginStatus()).manualOpen, { timeout: 10000 }).toBe(false);
  manualPid = undefined;
  await checkManualLogin();
  expect((await (await agentContext()).cookies("https://example.org")).some(cookie => cookie.name === "manual-handoff-fixture")).toBe(true);
});
