import path from "node:path";
import { expect, test } from "@playwright/test";
import { config, dataPath } from "../lib/config";

test("data paths follow the currently configured storage directory after module import", () => {
  const previous = process.env.ROLEFLOW_DATA_DIR;
  const previousNextRole = process.env.NEXTROLE_DATA_DIR;
  try {
    delete process.env.NEXTROLE_DATA_DIR;
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
    if (previousNextRole === undefined) delete process.env.NEXTROLE_DATA_DIR;
    else process.env.NEXTROLE_DATA_DIR = previousNextRole;
  }
});

test("NextRole data directory takes precedence and old installations retain their storage", () => {
  const previous = { next: process.env.NEXTROLE_DATA_DIR, legacy: process.env.ROLEFLOW_DATA_DIR };
  try {
    const legacy = path.join(process.cwd(), "test-results", "legacy-storage");
    const current = path.join(process.cwd(), "test-results", "nextrole-storage");
    process.env.ROLEFLOW_DATA_DIR = legacy;
    process.env.NEXTROLE_DATA_DIR = current;
    expect(dataPath("profile.json")).toBe(path.join(current, "profile.json"));
    process.env.NEXTROLE_DATA_DIR = " ";
    expect(dataPath("profile.json")).toBe(path.join(legacy, "profile.json"));
  } finally {
    if (previous.next === undefined) delete process.env.NEXTROLE_DATA_DIR;
    else process.env.NEXTROLE_DATA_DIR = previous.next;
    if (previous.legacy === undefined) delete process.env.ROLEFLOW_DATA_DIR;
    else process.env.ROLEFLOW_DATA_DIR = previous.legacy;
  }
});
