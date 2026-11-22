import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { qwenClient } from "../ai";
import { config } from "../config";
import { AGENT_INSTRUCTIONS, AGENT_TOOLS } from "./prompts";

export async function planStep(text: string, screenshot: Buffer | undefined, signal: AbortSignal) {
  const content: ChatCompletionContentPart[] = [{ type: "text", text }];
  if (screenshot) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${screenshot.toString("base64")}` } });
  const body = {
    model: config.agentModel(),
    messages: [{ role: "system" as const, content: AGENT_INSTRUCTIONS }, { role: "user" as const, content }],
    tools: AGENT_TOOLS, tool_choice: "auto" as const,
  };
  const res = await qwenClient().chat.completions.create(body, { signal });
  const choice = res.choices[0];
  const calls = choice?.finish_reason === "tool_calls" || choice?.finish_reason === "stop"
    ? (choice.message.tool_calls ?? []).flatMap(c => c.type === "function" ? [c.function] : []) : [];
  return { calls, inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0 };
}
