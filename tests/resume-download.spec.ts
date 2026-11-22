import { promises as fs } from "node:fs";
import path from "node:path";
import Module from "node:module";
import { NextRequest } from "next/server";
import { test, expect } from "@playwright/test";
import type { ResumeVersion } from "../lib/types";

test("download headers support Chinese filenames without invalid ByteString values", async () => {
  const { contentDisposition } = await import("../lib/http-files");
  const name = "张三_岗位简历.pdf";
  for (const download of [false, true]) {
    const header = contentDisposition(name, download);
    const response = new Response("fixture", { headers: { "Content-Disposition": header } });
    expect(response.headers.get("Content-Disposition")).toBe(header);
    expect(header).toMatch(download ? /^attachment;/ : /^inline;/);
    expect(header).toMatch(/^[\x20-\x7e]+$/);
    const encodedName = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    expect(encodedName).toBeTruthy();
    expect(decodeURIComponent(encodedName!)).toBe(name);
  }
});

test("ASCII and special filenames cannot introduce malformed response headers", async () => {
  const { contentDisposition } = await import("../lib/http-files");
  const plain = contentDisposition("Alex_Resume.pdf", true);
  expect(plain).toContain('filename="Alex_Resume.pdf"');
  for (const name of ['张三"简历.pdf', "张三\r\nX-Test: injected.pdf", "Résumé (final)'*.pdf"]) {
    const header = contentDisposition(name, true);
    expect(header).not.toMatch(/[\r\n]/);
    expect(() => new Response("fixture", { headers: { "Content-Disposition": header } })).not.toThrow();
  }
});

test("real resume route serves Chinese original, tailored and cover PDFs inline and as downloads", async ({}, testInfo) => {
  const previous = process.env.ROLEFLOW_DATA_DIR;
  const dataDir = testInfo.outputPath("isolated-data");
  process.env.ROLEFLOW_DATA_DIR = dataDir;
  const bytes = Buffer.from("%PDF-1.7\nChinese filename fixture\n%%EOF\n");
  const versions: ResumeVersion[] = [
    { id: "original", kind: "original", label: "原始简历", fileName: "original/张三_原始简历.pdf", mimeType: "application/pdf", createdAt: "2026-11-21T00:00:00.000Z" },
    { id: "tailored", kind: "tailored", label: "岗位专属简历", fileName: "tailored/张三_岗位简历.pdf", coverLetterFile: "tailored/张三_求职信.pdf", mimeType: "application/pdf", createdAt: "2026-11-21T00:00:00.000Z" },
  ];
  try {
    for (const version of versions) {
      for (const name of [version.fileName, version.coverLetterFile].filter((value): value is string => Boolean(value))) {
        const destination = path.join(dataDir, "resumes", name);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, bytes);
      }
    }
    await fs.writeFile(path.join(dataDir, "resume-versions.json"), JSON.stringify(versions));
    // Next.js resolves @/ imports; this direct route test supplies the same root alias.
    const modules = Module as unknown as { _resolveFilename: (request: string, ...args: unknown[]) => string };
    const resolve = modules._resolveFilename;
    modules._resolveFilename = function (request, ...args) {
      return resolve.call(this, request.startsWith("@/") ? path.join(process.cwd(), request.slice(2)) : request, ...args);
    };
    let GET: typeof import("../app/api/resume/[id]/route").GET;
    try { ({ GET } = await import("../app/api/resume/[id]/route")); }
    finally { modules._resolveFilename = resolve; }
    for (const download of [false, true]) {
      for (const [id, cover, filename] of [
        ["original", false, "张三_原始简历.pdf"],
        ["tailored", false, "张三_岗位简历.pdf"],
        ["tailored", true, "张三_求职信.pdf"],
      ] as const) {
        const query = new URLSearchParams();
        if (download) query.set("download", "");
        if (cover) query.set("file", "cover");
        const request = new NextRequest(`http://127.0.0.1:3000/api/resume/${id}?${query}`);
        const response = await GET(request, { params: Promise.resolve({ id }) });
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("application/pdf");
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
        const disposition = response.headers.get("Content-Disposition")!;
        expect(disposition).toMatch(download ? /^attachment;/ : /^inline;/);
        expect(decodeURIComponent(disposition.match(/filename\*=UTF-8''([^;]+)/i)![1])).toBe(filename);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.ROLEFLOW_DATA_DIR;
    else process.env.ROLEFLOW_DATA_DIR = previous;
  }
});
