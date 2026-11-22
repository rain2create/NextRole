import { test, expect } from "@playwright/test";
import { searchZhaopin } from "../lib/jobs/chinese-boards";

const original = process.env.APISH_KEY;
test.beforeEach(()=>{process.env.APISH_KEY="fixture";});
test.afterEach(()=>{if(original===undefined) delete process.env.APISH_KEY; else process.env.APISH_KEY=original;});
test("Zhaopin uses header authentication and distinguishes day from month",async()=>{
  const base={title:"分析师",company:{name:"测试"},salary_min:100,salary_max:200};
  let header:string|null=null, query="";
  const result=await searchZhaopin("分析师","",async(u,init)=>{
    header=new Headers(init?.headers).get("x-api-key");query=new URL(String(u)).search;
    return Response.json({jobs:["month","day"].map((period,i)=>({...base,salary_period:period,url:`https://www.zhaopin.com/jobdetail/CC${i}.htm`}))});
  });
  expect(header).toBe("fixture");expect(query).not.toContain("fixture");
  expect(result.jobs[0].pay?.period).toBe("月");expect(result.jobs[1].pay).toBeUndefined();
});
test("missing credentials, upstream errors and empty results are distinct",async()=>{
  delete process.env.APISH_KEY;
  let calls=0;
  const missing=await searchZhaopin("q","",async()=>{calls++;throw Error();});
  expect(calls).toBe(0);expect(missing.errors[0]).toContain("APISH_KEY");
  process.env.APISH_KEY="fixture";
  for(const response of [new Response(null,{status:403}),Response.json({})]){
    expect((await searchZhaopin("q","",async()=>response)).errors).toHaveLength(1);
  }
  expect(await searchZhaopin("q","",async()=>Response.json({jobs:[]}))).toEqual({jobs:[],errors:[]});
});
