import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { agentResponse, qwenClient } from "../ai";
import { config } from "../config";
import { AGENT_INSTRUCTIONS, AGENT_TOOLS } from "./prompts";

export async function planStep(text: string, screenshot: Buffer | undefined, signal: AbortSignal) {
  if (!config.qwenKey() && config.openaiKey()) {
    const result = await agentResponse({
      model: config.agentModel(), store: false, instructions: AGENT_INSTRUCTIONS,
      tools: AGENT_TOOLS.map(tool => ({ type: "function" as const, ...tool.function, parameters: tool.function.parameters ?? {}, strict: tool.function.strict ?? false })),
      input: [{ role: "user", content: [
        { type: "input_text", text },
        ...(screenshot ? [{ type: "input_image" as const, image_url: `data:image/jpeg;base64,${screenshot.toString("base64")}`, detail: "low" as const }] : []),
      ] }],
    }, { signal });
    return { calls: result.output.filter(item => item.type === "function_call"), inputTokens: result.usage?.input_tokens ?? 0, outputTokens: result.usage?.output_tokens ?? 0 };
  }
  const content: ChatCompletionContentPart[] = [{ type: "text", text }];
  if (screenshot) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${screenshot.toString("base64")}` } });
  const body = {
    enable_thinking: false,
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
