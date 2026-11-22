import path from "path";

export const config = {
  openaiKey: () => process.env.OPENAI_API_KEY?.trim() || "",
  baseUrl: () => process.env.OPENAI_BASE_URL?.trim() || undefined,
  qwenKey: () => process.env.QWEN_API_KEY?.trim() || "",
  get qwenBaseURL() {
    return process.env.QWEN_BASE_URL?.trim() || (config.qwenKey().startsWith("sk-sp-")
      ? "https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1"
      : "https://maas.qianwenaiapi.com/compatible-mode/v1");
  },
  model: () => config.qwenKey() ? process.env.QWEN_MODEL?.trim() || "qwen3.7-plus" : process.env.OPENAI_MODEL?.trim() || "gpt-5.5",
  agentModel: () => config.qwenKey() ? process.env.QWEN_AGENT_MODEL?.trim() || config.model() : process.env.OPENAI_AGENT_MODEL?.trim() || config.model(),
  webSearchEnabled: () => process.env.QWEN_WEB_SEARCH === "true",
  // chrome | msedge | chromium
  browserChannel: () => process.env.BROWSER_CHANNEL?.trim() || "chrome",
  headless: () => process.env.HEADLESS === "true",
  maxAgentSteps: () => Number(process.env.AGENT_MAX_STEPS || 40),
  maxRunTokens: () => Number(process.env.AGENT_MAX_RUN_TOKENS || 150_000),
  // turbopackIgnore keeps private data out of build file tracing.
  get dataDir() {
    return process.env.NEXTROLE_DATA_DIR?.trim() || process.env.ROLEFLOW_DATA_DIR?.trim() || path.join(/* turbopackIgnore: true */ process.cwd(), "data");
  },
};

export const dataPath = (...parts: string[]) => path.join(config.dataDir, ...parts);
