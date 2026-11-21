import { expect, test } from "@playwright/test";
import { z } from "zod";
import { keyIssue, structured, webSearch } from "../lib/ai";
import { planStep } from "../lib/agent/model";

const schema = z.object({ status: z.literal("ok") });
const probe = () => structured({ name: "probe", schema, instructions: "Return JSON", input: "Synthetic test" });
const originalFetch = globalThis.fetch;
const envNames = ["QWEN_API_KEY","QWEN_MODEL","QWEN_AGENT_MODEL","QWEN_WEB_SEARCH"] as const;
let previous: (string | undefined)[];
test.beforeEach(() => {
  previous = envNames.map(k=>process.env[k]);
  envNames.forEach(k=>delete process.env[k]);
  process.env.QWEN_API_KEY = "local-fixture";
  globalThis.fetch = async () => { throw new Error("unexpected network call"); };
});
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  envNames.forEach((k,i)=> { if(previous[i] === undefined) delete process.env[k]; else process.env[k] = previous[i]; });
});

function mockCompletion(message: object, finish = "stop") {
  let captured: {url:string; body:Record<string,unknown>} | undefined;
  globalThis.fetch = async (input, init) => {
    const req = new Request(input,init);
    captured = {url:req.url,body:await req.json()};
    return Response.json({choices:[{message, finish_reason:finish}], usage:{prompt_tokens:3,completion_tokens:2}});
  };
  return () => captured!;
}
test("structured data goes only to the Qwen chat endpoint, without search or GPT settings", async()=>{
  const read = mockCompletion({role:"assistant",content:'{"status":"ok"}'});
  expect(await probe()).toEqual({status:"ok"});
  expect(read().url).toBe("https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions");
  expect(read().body).toMatchObject({model:"qwen3.7-plus",response_format:{type:"json_schema"}});
  expect(read().body).not.toHaveProperty("tools");
  expect(read().body).not.toHaveProperty("enable_thinking");
});
test("malformed and truncated completions do not pass validation",async()=>{
  mockCompletion({content:'{"status":"no"}'});
  await expect(probe()).rejects.toThrow(/JSON/);
  mockCompletion({content:'{"status":"ok"}'},"length");
  await expect(probe()).rejects.toThrow(/JSON/);
});
test("browser tools carry images, model override, usage and actions", async()=>{
  process.env.QWEN_AGENT_MODEL = "fixture-vision";
  const read = mockCompletion({tool_calls:[{type:"function",function:{name:"ask_user",arguments:'{"question":"Confirm?"}'}}]},"tool_calls");
  const result = await planStep("Test snapshot",Buffer.from("fixture"),new AbortController().signal);
  expect(result).toEqual({calls:[{name:"ask_user",arguments:'{"question":"Confirm?"}'}],inputTokens:3,outputTokens:2});
  expect(read().body).toMatchObject({model:"fixture-vision",messages:[{role:"system"},{role:"user",content:[{type:"text"},{type:"image_url"}]}]});
  expect(read().body.tools).toEqual(expect.arrayContaining([expect.objectContaining({type:"function",function:expect.objectContaining({name:"ready_to_submit"})})]));
});
test("missing key, plan key and disabled web search are caught locally",async()=>{
  delete process.env.QWEN_API_KEY;
  await expect(probe()).rejects.toThrow(/QWEN_API_KEY/);
  process.env.QWEN_API_KEY="sk-sp-local-fixture";
  expect(keyIssue()).toMatch(/Token Plan/);
  await expect(probe()).rejects.toThrow(/Token Plan/);
  await expect(webSearch("x","x")).rejects.toThrow(/未启用/);
});
