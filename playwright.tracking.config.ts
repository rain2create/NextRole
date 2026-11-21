import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
export default defineConfig({
  testDir: "./tests", testMatch: ["tracking-ui.spec.ts","discovery-ui.spec.ts"], workers: 1, timeout: 90000,
  use: { baseURL: "http://127.0.0.1:3101", ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL || "chrome" },
  webServer: {
    command: "npm run dev -- -p 3101", url: "http://127.0.0.1:3101/app/tracking",
    timeout: 120000, reuseExistingServer: false,
    env: { ROLEFLOW_DATA_DIR: mkdtempSync(path.join(tmpdir(),"roleflow-ui-")), NEXT_TELEMETRY_DISABLED:"1" },
  },
});
