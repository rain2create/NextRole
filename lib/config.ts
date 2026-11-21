import path from "path";

export const config = {
  qwenKey: () => process.env.QWEN_API_KEY?.trim() || "",
  qwenBaseURL: "https://maas.qianwenaiapi.com/compatible-mode/v1",
  model: () => process.env.QWEN_MODEL?.trim() || "qwen3.7-plus",
  agentModel: () => process.env.QWEN_AGENT_MODEL?.trim() || config.model(),
  webSearchEnabled: () => process.env.QWEN_WEB_SEARCH === "true",
  // chrome | msedge | chromium
  browserChannel: () => process.env.BROWSER_CHANNEL?.trim() || "chrome",
  headless: () => process.env.HEADLESS === "true",
  maxAgentSteps: () => Number(process.env.AGENT_MAX_STEPS || 40),
  maxRunTokens: () => Number(process.env.AGENT_MAX_RUN_TOKENS || 150_000),
  // turbopackIgnore keeps private data out of build file tracing.
  dataDir: process.env.ROLEFLOW_DATA_DIR?.trim() || path.join(/* turbopackIgnore: true */ process.cwd(), "data"),
};

export const dataPath = (...parts: string[]) => path.join(config.dataDir, ...parts);
