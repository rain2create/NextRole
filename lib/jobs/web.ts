import { webSearch } from "../ai";
import type { Job } from "../types";
import { fetchAtsJob } from "./ats";
import { FetchError } from "./http";

const ATS_URL = /https?:\/\/(?:job-boards(?:\.eu)?\.greenhouse\.io|boards\.greenhouse\.io|jobs(?:\.eu)?\.lever\.co|jobs\.ashbyhq\.com)\/[^\s"'<>)\]]+/g;

// Web search finds ATS postings; each is verified via the ATS API so closed roles drop out.
export async function searchWeb(query: string, location: string, limit = 12) {
  return (await searchWebReport(query, location, limit)).jobs;
}
export async function searchWebReport(query: string, location: string, limit = 12) {
  const text = await webSearch(
    `You find currently open job postings on applicant tracking systems.
Only return direct posting URLs on job-boards.greenhouse.io, boards.greenhouse.io, jobs.lever.co or jobs.ashbyhq.com.
Prefer postings published recently. Output one URL per line and nothing else.`,
    `Role: ${query}\nLocation preference: ${location || "any"}\nFind up to ${limit + 4} distinct postings.`,
  );
  const urls = [...new Set((text.match(ATS_URL) || []).map((u) => u.replace(/[.,;]+$/, "").replace(/\/application$|\/apply$/, "")))];
  const jobs: Job[] = [], errors = new Set<string>(), stopped = new Set<string>();
  for (const url of urls.slice(0, limit + 4)) {
    const host = new URL(url).hostname;
    if (stopped.has(host)) continue;
    try {
      const job = await fetchAtsJob(url);
      if (job?.title) jobs.push(job);
    } catch (e) {
      if (e instanceof FetchError && [404,410].includes(e.status)) continue;
      if (e instanceof FetchError && [401,403,429].includes(e.status)) {
        stopped.add(host);
        errors.add(`${host} 限流或拒绝访问，本轮已停止该来源`);
      } else errors.add(`${host} 部分职位未能核验`);
    }
    if (jobs.length >= limit) break;
  }
  return {jobs, errors:[...errors]};
}
