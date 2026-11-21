import { createServer, type RequestListener } from "node:http";
import { test, expect } from "@playwright/test";
import { z } from "zod";
import { openai, structured } from "../lib/ai";

test("custom API settings reach Responses and the client refreshes only when its key or endpoint changes", async () => {
  const previous = { key: process.env.OPENAI_API_KEY, url: process.env.OPENAI_BASE_URL, model: process.env.OPENAI_MODEL };
  const received: { path?: string; auth?: string; model?: string }[] = [];
  const handler: RequestListener = async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    received.push({ path: req.url, auth: req.headers.authorization, model: JSON.parse(body).model });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: "resp_test", object: "response", created_at: 0, status: "completed", model: "custom-model",
      output: [{ id: "msg_test", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: '{"name":"Example"}', annotations: [] }] }],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    }));
  };
  const server = createServer(handler);
  const anotherServer = createServer(handler);
  await Promise.all([server, anotherServer].map((item) => new Promise<void>((resolve) => item.listen(0, "127.0.0.1", resolve))));
  try {
    const address = server.address();
    const anotherAddress = anotherServer.address();
    if (!address || typeof address === "string" || !anotherAddress || typeof anotherAddress === "string") throw new Error("Missing test server port");
    process.env.OPENAI_API_KEY = "test-placeholder-key";
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
    process.env.OPENAI_MODEL = "custom-model";
    const result = await structured({ schema: z.object({ name: z.string() }), name: "sample", instructions: "Return sample JSON", input: "sample" });
    expect(result).toEqual({ name: "Example" });
    expect(received[0]).toEqual({ path: "/v1/responses", auth: "Bearer test-placeholder-key", model: "custom-model" });
    const originalClient = openai();
    expect(openai()).toBe(originalClient);

    process.env.OPENAI_API_KEY = "second-fixture-key";
    await structured({ schema: z.object({ name: z.string() }), name: "sample", instructions: "Return sample JSON", input: "sample" });
    const changedKeyClient = openai();
    expect(changedKeyClient).not.toBe(originalClient);
    expect(received[1]).toEqual({ path: "/v1/responses", auth: "Bearer second-fixture-key", model: "custom-model" });

    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${anotherAddress.port}/other/v1`;
    process.env.OPENAI_MODEL = "another-model";
    await structured({ schema: z.object({ name: z.string() }), name: "sample", instructions: "Return sample JSON", input: "sample" });
    const changedEndpointClient = openai();
    expect(changedEndpointClient).not.toBe(changedKeyClient);
    expect(openai()).toBe(changedEndpointClient);
    expect(received[2]).toEqual({ path: "/other/v1/responses", auth: "Bearer second-fixture-key", model: "another-model" });
  } finally {
    for (const [name, value] of [["OPENAI_API_KEY", previous.key], ["OPENAI_BASE_URL", previous.url], ["OPENAI_MODEL", previous.model]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
    await Promise.all([server, anotherServer].map((item) => new Promise<void>((resolve) => item.close(() => resolve()))));
  }
});
