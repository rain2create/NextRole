import { promises as fs } from "fs";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { config, dataPath } from "../config";
import { isPublicHttpUrl } from "../url-safety";
import { UserFacingError } from "../ai";
import { clearManualLogin, launchManualLogin, manualLoginStatus, rememberBrowserChannel, savedBrowserChannel } from "./manual-login";

type BrowserState = { context?: Promise<BrowserContext>; headless?: Promise<Browser>; manualStarting?: boolean };
// On globalThis so dev-server reloads never launch a second browser on the same profile.
const state = ((globalThis as { __roleflowBrowser?: BrowserState }).__roleflowBrowser ??= {});

function channels() {
  const preferred = config.browserChannel();
  return [...new Set([preferred, "chrome", "msedge", "chromium"])];
}

async function withChannelFallback<T>(launch: (channel: string) => Promise<T>, choices = channels()) {
  let last: unknown;
  for (const channel of choices) {
    try {
      return await launch(channel);
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

// Persistent profile: the user's own sign-ins (LinkedIn, ATS accounts) carry over between runs.
export function agentContext() {
  if (state.manualStarting) return Promise.reject(new UserFacingError("正在切换到手动登录，请完成登录并关闭窗口后再填表。"));
  state.context ??= (async () => {
    await assertBrowserAvailable();
    const pinned = await savedBrowserChannel();
    return withChannelFallback(async (channel) => {
      const ctx = await chromium.launchPersistentContext(dataPath("browser-profile"), {
      channel,
      headless: config.headless(),
      viewport: { width: 1280, height: 860 },
      acceptDownloads: false,
      });
      await rememberBrowserChannel(channel).catch(() => {});
      return ctx;
    }, pinned ? [pinned] : channels());
  })().then(async (ctx) => {
    ctx.on("close", () => {
      state.context = undefined;
    });
    // A page (or a prompt-injected link) must not reach this machine or the local network.
    await ctx.route(
      (url) => (url.protocol === "http:" || url.protocol === "https:") && !isPublicHttpUrl(url.href),
      (route) => route.abort("blockedbyclient"),
    );
    return ctx;
  });
  state.context.catch(() => {
    state.context = undefined;
  });
  return state.context;
}

export async function assertBrowserAvailable() {
  if (state.manualStarting || (await manualLoginStatus()).manualOpen) {
    throw new UserFacingError("请先完成手动登录，并关闭全部 NextRole 登录窗口，再开始检查或填表。若仍提示窗口打开，请在该浏览器菜单中选择退出。");
  }
}

export async function startManualLogin() {
  if (state.manualStarting) throw new UserFacingError("正在打开登录窗口，请稍候。");
  state.manualStarting = true;
  try {
    if ((await manualLoginStatus()).manualOpen) throw new UserFacingError("登录窗口已经打开，请切换到该窗口完成登录。");
    await closeAgentBrowser();
    await launchManualLogin();
  } finally { state.manualStarting = false; }
}

export async function browserStatus() {
  const manual = await manualLoginStatus();
  return { open: isAgentBrowserOpen(), linkedin: manual.manualPending ? false : await linkedInSignedIn(), ...manual };
}

export async function checkManualLogin() {
  await assertBrowserAvailable();
  const ctx = await agentContext();
  // Inspect the saved session, without submitting a form or starting an agent run.
  const cookies = await ctx.cookies("https://www.linkedin.com");
  const signedIn = cookies.some(c => c.name === "li_at" && c.value);
  await clearManualLogin();
  await linkedInSignedIn();
  return { ...(await browserStatus()), linkedin: Boolean(signedIn) };
}

export function isAgentBrowserOpen() {
  return Boolean(state.context);
}

export async function closeAgentBrowser() {
  const ctx = await state.context?.catch(() => undefined);
  state.context = undefined;
  await ctx?.close().catch(() => {});
}

export function headlessBrowser() {
  state.headless ??= withChannelFallback((channel) => chromium.launch({ channel, headless: true })).then((b) => {
    b.on("disconnected", () => {
      state.headless = undefined;
    });
    return b;
  });
  state.headless.catch(() => {
    state.headless = undefined;
  });
  return state.headless;
}

const linkedInMarker = () => dataPath("linkedin-session.json");

// With the browser closed, report the last observed state; the session persists on disk.
export async function linkedInSignedIn() {
  const ctx = state.context ? await state.context.catch(() => undefined) : undefined;
  if (!ctx) {
    try {
      return (JSON.parse(await fs.readFile(linkedInMarker(), "utf8")) as { signedIn: boolean }).signedIn;
    } catch {
      return false;
    }
  }
  const cookies = await ctx.cookies("https://www.linkedin.com").catch(() => []);
  const signedIn = cookies.some((c) => c.name === "li_at" && c.value);
  await fs.mkdir(dataPath(), { recursive: true }).catch(() => {});
  await fs.writeFile(linkedInMarker(), JSON.stringify({ signedIn, checkedAt: new Date().toISOString() })).catch(() => {});
  return signedIn;
}
