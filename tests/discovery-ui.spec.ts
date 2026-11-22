import {expect,test} from "@playwright/test";
test("explicit live search and discontinued import",async ({page,baseURL,request})=>{
  test.skip(!baseURL,"Needs an isolated UI server.");
  await page.goto("/app");
  await page.getByRole("button",{name:"推荐方向"}).click();
  await expect(page.getByText("请填写目标岗位，或先上传简历后获取推荐。")).toBeVisible();
  expect((await request.post("/api/jobs/import",{data:{url:"https://www.zhipin.com/job_detail/test.html"}})).status()).toBe(400);
  expect((await request.post("/api/jobs/import",{data:{mode:"manual"}})).status()).toBe(400);
  await expect(page.getByLabel("LinkedIn 公开职位")).toBeChecked();
  await page.route("**/api/jobs/discover",route=>{
    const input=route.request().postDataJSON();
    expect(input.query).toBe("信贷策略");
    expect(input.sources.linkedin).toBe(true);
    return route.fulfill({json:{jobs:[],errors:["LinkedIn 限流或拒绝访问，请稍后重试。"]}});
  });
  await page.getByLabel("目标岗位",{exact:true}).fill("信贷策略");
  await page.getByText("搜索条件",{exact:true}).click();
  await page.getByLabel("可接受薪资下限").fill("25000");
  await page.getByRole("button",{name:"搜索岗位",exact:true}).click();
  await expect(page.locator("#jobs")).toContainText("LinkedIn 限流或拒绝访问");
  expect((await request.post("/api/jobs/directions")).status()).toBe(400);
});

test("resume suggestions require confirmation; explicit title overrides selected suggestions",async({page,baseURL})=>{
  test.skip(!baseURL,"Needs an isolated UI server.");
  const requested:string[]=[];
  await page.setViewportSize({width:390,height:844});
  await page.route("**/api/profile",async route=>{
    const res=await route.fetch(), data=await res.json();
    data.profile.resume={name:"Case",headline:"分析师",contact:{},summary:"",skills:[],experience:[],projects:[],education:[],certifications:[],achievements:[]};
    await route.fulfill({json:data});
  });
  await page.route("**/api/jobs/directions",route=>route.fulfill({json:{directions:[
    {title:"信贷策略",evidence:"额度策略项目",gap:"风险监控经验"},
    {title:"数据分析师",evidence:"SQL 分析",gap:"报表设计"},
  ]}}));
  await page.route("**/api/jobs/discover",route=>{
    requested.push(route.request().postDataJSON().query);
    return route.fulfill({json:{jobs:[],errors:[]}});
  });
  await page.goto("/app");
  await expect(page.getByLabel("LinkedIn 公开职位")).toBeChecked();
  await page.getByRole("button",{name:"推荐方向"}).click();
  await expect(page.getByText("确认搜索方向")).toBeVisible();
  expect(requested).toEqual([]);
  await page.getByLabel(/信贷策略.*额度策略项目/).check();
  await page.getByRole("button",{name:"搜索岗位"}).click();
  await expect.poll(()=>requested.slice()).toEqual(["信贷策略"]);
  await page.getByLabel("目标岗位",{exact:true}).fill("产品经理");
  await page.getByRole("button",{name:"搜索岗位"}).click();
  await expect.poll(()=>requested.slice()).toEqual(["信贷策略","产品经理"]);
  expect(await page.locator("#search").evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});
