import { expect, test } from "@playwright/test";

const appUrl = process.env.ROLEFLOW_UI_TEST_URL;
test.skip(!appUrl, "Set ROLEFLOW_UI_TEST_URL to check a local app's request validation.");

for (const [label, payload] of [
  ["missing direction", { mode: "direction" }],
  ["unrecognised direction", { mode: "direction", direction: "invented" }],
  ["missing mode", { direction: "general" }],
  ["unrecognised mode", { mode: "invented", direction: "general" }],
  ["job mode without a job ID", { mode: "job", direction: "general" }],
  ["blank job ID", { mode: "job", direction: "general", jobId: "   " }],
] as const) {
  test(`generation rejects ${label} before model calls`, async ({ request }) => {
    const response = await request.post(`${appUrl!.replace(/\/$/, "")}/api/resume/generate`, { data: payload });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toEqual(expect.any(String));
  });
}