import type { Job } from "../types";

const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
function record(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

function toJob(row: unknown): Job | undefined {
  const r = record(row), title = text(r.title), company = text(record(r.company).name);
  let url: URL;
  try { url = new URL(text(r.url)); } catch { return; }
  if (!title || !company || !url || url.protocol !== "https:" || url.username || url.password || url.port) return;
  const host = "zhaopin.com";
  const path = /^\/jobdetail\/([\w-]+)\.htm$/i;
  const id = path.exec(url.pathname)?.[1];
  if (!id || ![host,`www.${host}`].includes(url.hostname)) return;
  const link = url.origin + url.pathname;
  const salary = text(r.salary);
  const monthly = r.salary_period === "month" && typeof r.salary_min === "number" && typeof r.salary_max === "number"
    && r.salary_min > 0 && r.salary_max >= r.salary_min;
  return {
    id:`zhaopin-${id}`, source:"zhaopin", title, company, url:link, applyUrl:link,
    location:[r.city,r.district].map(text).filter(Boolean).join(" "),
    description:[r.summary,r.experience,r.education,r.skills,salary].map(text).filter(Boolean).join("\n"),
    employmentType:text(r.job_kind) || undefined, postedAt:text(r.published_at) || undefined,
    pay:monthly ?
      {min:Number(r.salary_min), max:Number(r.salary_max), period:"月", currency:"CNY"} : undefined,
    fetchedAt:new Date().toISOString(),
  };
}

export async function searchZhaopin(query: string, city: string, request = fetch): Promise<{jobs:Job[];errors:string[]}> {
  const name = "智联招聘（API.SH）";
  const key = process.env.APISH_KEY?.trim();
  const fail = (message:string) => ({ jobs:[], errors:[`${name}：${message}`] });
  if (!key) return fail("未配置 APISH_KEY，请在 .env.local 中设置后重启。");
  const url = new URL("https://api.api.sh/zhaopin/v1/search");
  url.searchParams.set("q",query);
  url.searchParams.set("page","1");
  if (city) url.searchParams.set("city",city);
  url.searchParams.set("sort","newest");
  try {
    const res = await request(url,{headers:{"x-api-key":key},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
    if (!res.ok) return fail(`HTTP ${res.status}，请检查密钥、额度或服务状态。`);
    const body = record(await res.json());
    const rows = body.jobs;
    if (!Array.isArray(rows)) return fail("返回格式异常，未取得职位列表。");
    const jobs = rows.map(toJob).filter((j):j is Job=>!!j);
    return {jobs,errors:jobs.length < rows.length ? [`${name}：已忽略 ${rows.length-jobs.length} 条缺少有效职位信息或详情链接的记录。`] : []};
  } catch {
    return fail("请求失败或超时，请检查网络或稍后再试。");
  }
}
