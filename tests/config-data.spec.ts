import path from "node:path";
import { expect, test } from "@playwright/test";
import { config, dataPath } from "../lib/config";

test("data paths follow the currently configured storage directory after module import", () => {
  const previous = process.env.ROLEFLOW_DATA_DIR;
  try {
    const first = path.join(process.cwd(), "test-results", "storage-first");
    const second = path.join(process.cwd(), "test-results", "storage-second");
    process.env.ROLEFLOW_DATA_DIR = first;
    expect(config.dataDir).toBe(first);
    expect(dataPath("profile.json")).toBe(path.join(first, "profile.json"));
    process.env.ROLEFLOW_DATA_DIR = second;
    expect(dataPath("resumes", "fixture.pdf")).toBe(path.join(second, "resumes", "fixture.pdf"));
  } finally {
    if (previous === undefined) delete process.env.ROLEFLOW_DATA_DIR;
    else process.env.ROLEFLOW_DATA_DIR = previous;
  }
});
