import { z } from "zod";
import type { Job } from "../types";

export const degrees = ["大专", "本科", "硕士", "博士"] as const;
export const fields = ["地点", "相关经验", "学历", "薪资", "工作类型", "办公方式", "发布日期"] as const;
export const criteriaSchema = z.object({
  years: z.number().min(0).max(70).optional(),
  degree: z.enum(degrees).optional(),
  min: z.number().positive().max(1e9).optional(),
  max: z.number().positive().max(1e9).optional(),
  currency: z.enum(["CNY", "USD"]).default("CNY"),
  period: z.enum(["月", "年"]).default("月"),
  payKind: z.enum(["不限", "底薪", "总包"]).default("不限"),
  work: z.enum(["全职", "兼职", "实习", "合同"]).optional(),
  mode: z.enum(["现场", "远程", "混合"]).optional(),
  days: z.number().int().positive().max(365).optional(),
  must: z.array(z.enum(fields)).max(fields.length).default([]),
  confirmedOnly: z.boolean().default(false),
}).refine(c => c.min === undefined || c.max === undefined || c.min <= c.max, "薪资下限不能高于上限");
export type Criteria = z.infer<typeof criteriaSchema>;
export type Check = { field: typeof fields[number]; state: "符合" | "不符" | "待确认" | "部分重叠"; evidence: string };
export type Pay = { min: number; max: number; currency: "CNY" | "USD"; period: "月" | "年"; months?: number; kind?: "底薪" | "总包" };

const aliases = [
  ["数据分析师", "data analyst"], ["产品经理", "product manager"], ["信贷策略", "信用风险策略"],
  ["软件工程师", "software engineer"], ["后端工程师", "backend engineer", "backend developer"],
];
export const normalize = (s: string) => s.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
export function matchesRole(title: string, query: string) {
  const q = normalize(query), t = normalize(title);
  return (aliases.find(a => a.includes(q)) ?? [q]).some(name => t.includes(name));
}

export function parsePay(text: string): Pay | undefined {
  const cn = text.match(/(?:月薪[：:\s]*)?(\d+(?:\.\d+)?)\s*[-~至–]\s*(\d+(?:\.\d+)?)\s*[kK千](?:\s*(?:[·×*x]\s*)?(\d{2})\s*薪)?/);
  const annual = text.match(/(?:USD\s*|\$)([\d,]+)\s*[-–~]\s*(?:USD\s*|\$)?([\d,]+)\s*(?:\/\s*year|per year|annually|年薪)/i);
  const kind = /底薪|base salary/i.test(text) ? "底薪" : /总包|total compensation/i.test(text) ? "总包" : undefined;
  if (cn && !/USD|\$|年薪|annual|hourly/i.test(cn.input ?? "") && +cn[1] <= +cn[2])
    return { min: +cn[1]*1000, max: +cn[2]*1000, currency: "CNY", period: "月", months: cn[3] ? +cn[3] : undefined, kind };
  if (annual) {
    const [min, max] = annual.slice(1, 3).map(s => Number(s.replaceAll(",", "")));
    if (min <= max) return { min, max, currency: "USD", period: "年", kind };
  }
}

export function evaluate(job: Job, c: Criteria, location: string, now = Date.now()) {
  const checks: Check[] = [], text = job.description ?? "";
  const add = (field: Check["field"], state: Check["state"], evidence = "未披露或无法可靠判断") => checks.push({ field, state, evidence });
  if (location) {
    const loc = normalize(job.location), q = normalize(location);
    const cities = [["上海","shanghai"],["北京","beijing"],["深圳","shenzhen"],["杭州","hangzhou"],["广州","guangzhou"]];
    const city = cities.find(a => a.includes(q));
    const knownOther = cities.some(a => a !== city && a.some(n => loc.includes(n)));
    add("地点", (city ?? [q]).some(n => loc.includes(n)) ? "符合" : city && knownOther && !/remote|远程/i.test(loc) ? "不符" : "待确认", job.location || undefined);
  }
  if (c.years !== undefined) {
    const m = text.match(/(\d+)(?:\s*[-~至–]\s*\d+|\+)?\s*年(?:以上|及以上)?(?:的)?(?:相关|工作|开发|行业|岗位|从业){0,2}经验/i)
      ?? text.match(/(?:at least|minimum(?: of)?|requires?)\s+(\d+)\+?\s+years?(?: of)? (?:relevant |professional |work )?experience/i)
      ?? text.match(/(\d+)\+\s*years?(?: of)? (?:relevant |professional |work )?experience/i);
    const optional = m && /优先|加分|preferred|nice to have/i.test(text.split(/[\n。;]/).find(l => l.includes(m[0])) ?? "");
    add("相关经验", !m || optional ? "待确认" : c.years >= +m[1] ? "符合" : "不符", m?.[0]);
  }
  if (c.degree) {
    const patterns = [/大专|专科|associate.?s? degree/i,/本科|学士|bachelor/i,/硕士|master.?s? degree/i,/博士|ph\.?d/i];
    const line = text.split(/[\n。;]/).find(l => /学历|及以上|以上学历|degree.{0,24}required|required.{0,24}degree/i.test(l) && patterns.some(p => p.test(l)) && !/优先|preferred|equivalent|同等|加分/i.test(l));
    const idx = line ? patterns.findIndex(p => p.test(line)) : -1;
    add("学历", idx < 0 ? "待确认" : degrees.indexOf(c.degree) >= idx ? "符合" : "不符", idx < 0 ? undefined : degrees[idx]);
  }
  if (c.min !== undefined || c.max !== undefined) {
    // Never assume an exchange rate or number of pay periods.
    const payLine = text.split(/[\n。;]/).find(l => /薪资|月薪|底薪|总包|salary|compensation|\d\s*[kK千]\s*[·×*]\s*\d+薪/i.test(l));
    const p = job.pay ?? (payLine ? parsePay(payLine) : undefined);
    let state: Check["state"] = "待确认";
    if (p && p.currency === c.currency && (c.payKind === "不限" || p.kind === c.payKind)) {
      const factor = p.period === c.period ? 1 : !p.months ? undefined : p.period === "月" ? p.months : 1 / p.months;
      if (factor !== undefined) {
        const lo = p.min * factor, hi = p.max * factor, floor = c.min ?? 0, cap = c.max ?? Infinity;
        state = hi < floor || lo > cap ? "不符" : lo >= floor && hi <= cap ? "符合" : "部分重叠";
      }
    }
    add("薪资", state, p ? `${p.currency} ${p.min.toLocaleString()}–${p.max.toLocaleString()}/${p.period}${p.months ? ` · ${p.months}薪` : ""}${p.kind ? ` · ${p.kind}` : ""}` : undefined);
  }
  const categories = (field: Check["field"], target: string | undefined, value: string, options: Record<string, RegExp>) => {
    if (!target) return;
    const found = Object.keys(options).filter(k => options[k].test(value));
    add(field, found.includes(target) ? "符合" : found.length ? "不符" : "待确认", found.join(" / ") || undefined);
  };
  categories("工作类型", c.work, job.employmentType ?? "", { "全职": /全职|full[\s_-]?time/i, "兼职": /兼职|part[\s_-]?time/i, "实习": /实习|intern/i, "合同": /合同|contract/i });
  categories("办公方式", c.mode, job.location, { "远程": /远程|remote/i, "现场": /现场|坐班|on[\s-]?site/i, "混合": /混合|hybrid/i });
  if (c.days) {
    const age = now - Date.parse(job.postedAt ?? "");
    add("发布日期", !Number.isFinite(age) || age < 0 ? "待确认" : age <= c.days * 86400000 ? "符合" : "不符", job.postedAt);
  }
  const eligible = checks.every(x => !(x.state === "不符" && c.must.includes(x.field)) && !(c.confirmedOnly && x.state !== "符合"));
  const preference = checks.reduce((n,x) => n + ({符合:2, 部分重叠:1, 待确认:0, 不符:-2}[x.state]),0);
  return { checks, eligible, preference };
}
