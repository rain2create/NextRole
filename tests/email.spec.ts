import { test, expect } from "@playwright/test";
import { mkdtemp, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { createDraft, sendDraft, draftSchema } from "../lib/email/service";
import { config } from "../lib/config";
import { trackingService } from "../lib/tracking/service";

test("email draft uses the common run and tracking pipeline; confirmation required", async () => {
  const original = process.env.ROLEFLOW_DATA_DIR;
  const root = await mkdtemp(path.join(tmpdir(), "nextrole-email-"));
  process.env.ROLEFLOW_DATA_DIR = root;
  try {
    await writeFile(path.join(root,"jobs.json"), JSON.stringify({j:{id:"j",title:"Analyst",company:"Example",location:"",url:"https://example.com",source:"web"}}));
    await writeFile(path.join(root,"resume-versions.json"), JSON.stringify([{id:"v",fileName:"test.pdf",mimeType:"application/pdf"}]));
    const run = await createDraft({jobId:"j",resumeVersionId:"v",to:"test@example.com",subject:"Application",body:"Test draft"});
    expect(run.status).toBe("awaiting_approval"); expect(run.channel).toBe("email");
    const records = await trackingService().list({}); expect(records.summary.applied).toBe(0); expect(records.records[0].runIds).toContain(run.id);
    await expect(sendDraft(run.id,false)).rejects.toThrow("confirmation");
    expect(draftSchema.safeParse({jobId:"j",resumeVersionId:"v",to:"bad",subject:"bad\r\nBcc: x",body:"Test"}).success).toBe(false);
  } finally { restoreDir(original); }
});

test("recipient extraction requires a single valid address and permits explicit correction", async () => {
  const { validateRecipient } = await import("../lib/email/prepare");
  expect(validateRecipient("jobs@example.com", "")).toBe("jobs@example.com");
  expect(validateRecipient("ocr-unclear", "confirmed@example.com")).toBe("confirmed@example.com");
  expect(() => validateRecipient("", "")).toThrow("confirmed recruiting");
  expect(() => validateRecipient("a@example.com,b@example.com", "")).toThrow();
  expect(() => validateRecipient("a@example.com\r\nBcc:other@example.com", "")).toThrow();
});

test("recruiting text generates an editable email from the chosen attachment without sending", async () => {
  const { config } = await import("../lib/config");
  const { openai } = await import("../lib/ai");
  const { prepareEmail } = await import("../lib/email/prepare");
  const { chromium } = await import("playwright");
  const prevDir=process.env.ROLEFLOW_DATA_DIR, prevKey=process.env.OPENAI_API_KEY, prevUrl=process.env.OPENAI_BASE_URL;
  const root=await mkdtemp(path.join(tmpdir(),"email-prepare-"));process.env.ROLEFLOW_DATA_DIR=root;process.env.OPENAI_API_KEY="test-only";process.env.OPENAI_BASE_URL="https://example.com/v1";
  const prevMode=process.env.OPENAI_API_MODE;process.env.OPENAI_API_MODE="chat";
  const client=openai();const original=client.chat.completions.create;let calls=0;
  try {
    const { mkdir }=await import("fs/promises");await mkdir(path.join(root,"resumes"));
    const b=await chromium.launch({channel:process.env.PW_CHANNEL||"chrome",headless:true});
    try{const p=await b.newPage();await p.setContent('<h1>Fictional Candidate</h1><p>Python, SQL and data analysis experience for a fictional workflow test.</p>');await p.pdf({path:path.join(root,"resumes","test.pdf")});}finally{await b.close();}
    await writeFile(path.join(root,"resume-versions.json"),JSON.stringify([{id:"chosen",fileName:"test.pdf",mimeType:"application/pdf"}]));
    Object.assign(client.chat.completions,{create:async(request:{messages:unknown})=>{
      calls++;if(calls===1)return {choices:[{message:{tool_calls:[{type:"function",function:{name:"report_job",arguments:JSON.stringify({company:"Test Co",role:"Analyst",location:"HK",description:"Python analytics",recipient:"test@example.com",requirements:"Send PDF",warnings:[]})}}]}}]};
      expect(JSON.stringify(request.messages)).toContain("Fictional Candidate");
      return {choices:[{finish_reason:"stop",message:{content:JSON.stringify({subject:"Test Application",body:"A fictional application based on Python and SQL experience.",questions:[]})}}]};
    }});
    const f=new FormData();f.set("text","Test Co seeks Analyst. Send resume to test@example.com.");f.set("resumeVersionId","chosen");
    const result=await prepareEmail(f);expect(result.draft.to).toBe("test@example.com");expect(result.draft.resumeVersionId).toBe("chosen");expect(calls).toBe(2);
    calls=0;const pdfForm=new FormData();pdfForm.set("resumeVersionId","chosen");pdfForm.set("file",new File([await readFile(path.join(root,"resumes","test.pdf"))],"posting.pdf",{type:"application/pdf"}));
    const pdfResult=await prepareEmail(pdfForm);expect(pdfResult.draft.to).toBe("test@example.com");expect(calls).toBe(2);
    const { listRuns }=await import("../lib/store");expect(await listRuns()).toEqual([]);
  } finally {client.chat.completions.create=original;if(prevMode===undefined)delete process.env.OPENAI_API_MODE;else process.env.OPENAI_API_MODE=prevMode;restoreDir(prevDir);if(prevKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=prevKey;if(prevUrl===undefined)delete process.env.OPENAI_BASE_URL;else process.env.OPENAI_BASE_URL=prevUrl;}
});

test("mailbox status never exposes authorization secrets",async()=>{
  const { config }=await import("../lib/config");const { publicMailSettings,settingsSchema }=await import("../lib/email/settings");
  const old=process.env.ROLEFLOW_DATA_DIR;process.env.ROLEFLOW_DATA_DIR=await mkdtemp(path.join(tmpdir(),"email-settings-"));
  try{await writeFile(path.join(config.dataDir,"mail-settings.json"),JSON.stringify({host:"smtp.163.com",port:465,user:"test@163.com",from:"test@163.com",pass:"private-test-secret"}));
    const status=await publicMailSettings();expect(status.configured).toBe(true);expect(JSON.stringify(status)).not.toContain("private-test-secret");
    expect(settingsSchema.safeParse({host:"bad/host",port:25,user:"test@163.com",from:"test@163.com",pass:"x"}).success).toBe(false);
  }finally{restoreDir(old);}
});

function restoreDir(value:string|undefined){if(value===undefined)delete process.env.ROLEFLOW_DATA_DIR;else process.env.ROLEFLOW_DATA_DIR=value;}
