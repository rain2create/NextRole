import {expect,test} from "@playwright/test";
import {criteriaSchema,evaluate,matchesRole} from "../lib/jobs/criteria";
import {discoverySchema,distinctJobs,feedbackFor} from "../lib/jobs/discovery";
import {parsePay} from "../lib/jobs/criteria";

const url="https://www.linkedin.com/jobs/view/123/";
const job = {id:"li-123",source:"linkedin" as const,title:"高级信贷策略",company:"示例科技",location:"上海",url,applyUrl:url,fetchedAt:"",description:"风险管理岗位，要求3年以上相关工作经验。本科及以上学历。",pay:parsePay("20-30K·13薪"),employmentType:"全职"};
test("explicit live search works without the web source and rejects an empty selection",()=>{
  expect(discoverySchema.safeParse({query:"信贷策略",sources:{linkedin:true,web:false}}).success).toBe(true);
  expect(discoverySchema.safeParse({query:"信贷策略",sources:{linkedin:false,web:false}}).success).toBe(false);
});
test("hard exclusions, soft preferences, unknowns and overlap are distinct",()=>{
  const check = (params:object) => evaluate(job,criteriaSchema.parse(params),"Shanghai");
  expect(check({years:2,degree:"本科",must:["相关经验"]}).eligible).toBe(false);
  expect(check({years:2}).eligible).toBe(true);
  expect(check({min:25000,must:["薪资"]}).checks.at(-1)?.state).toBe("部分重叠");
  expect(check({min:25000,confirmedOnly:true}).eligible).toBe(false);
  expect(check({min:260000,max:390000,period:"年"}).checks.at(-1)?.state).toBe("符合");
  expect(check({min:500,currency:"USD"}).checks.at(-1)?.state).toBe("待确认");
  expect(check({degree:"大专",must:["学历"]}).eligible).toBe(false);
  expect(evaluate({...job,description:"硕士学历优先"},criteriaSchema.parse({degree:"本科",must:["学历"]}),"").checks[0].state).toBe("待确认");
  expect(evaluate({...job,pay:undefined,description:"薪资面议"},criteriaSchema.parse({min:1}),"").checks[0].state).toBe("待确认");
});
test("preserves chosen career, validates inputs, deduplicates by posting not company/title",()=>{
  expect(matchesRole("高级信用风险策略","信贷策略")).toBe(true);
  expect(matchesRole("产品经理","数据分析师")).toBe(false);
  expect(criteriaSchema.safeParse({min:5,max:3}).success).toBe(false);
  expect(discoverySchema.safeParse({query:" ",sources:{web:true,imported:true}}).success).toBe(false);
  expect(distinctJobs([job,{...job,id:"different",applyUrl:`${job.url}?utm_source=x`},{...job,id:"other",applyUrl:`${job.url}?id=2`}])).toHaveLength(2);
});
test("feedback is scoped, not a permanent ban",()=>{
  const base = {id:"1",jobId:job.id,title:job.title,company:job.company,direction:"信贷策略"} as const;
  expect(feedbackFor(job,"产品经理",[{...base,reason:"方向"},{...base,reason:"公司"}])).toEqual(["公司"]);
  expect(feedbackFor({...job,id:"new"},"信贷策略",[{...base,reason:"薪资"}])).toEqual([]);
});
