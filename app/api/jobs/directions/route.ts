import { z } from "zod";
import { badRequest, route } from "@/lib/api";
import { GROUNDING_RULES, structured } from "@/lib/ai";
import { getProfile } from "@/lib/store";

export const POST = route(async () => {
  const { resume } = await getProfile();
  if (!resume) return badRequest("先填写目标岗位，或上传简历后获取方向建议。");
  const facts = { skills: resume.skills, experience: resume.experience.map(e => ({ title: e.title, bullets: e.bullets })),
    projects: resume.projects.map(p => ({ name:p.name, tech:p.tech, bullets:p.bullets })), education: resume.education.map(e => ({degree:e.degree, field:e.field})) };
  const result = await structured({
    schema: z.object({ directions: z.array(z.object({ title:z.string(), evidence:z.string(), gap:z.string() })) }),
    name: "search_directions", instructions: `用中文推荐 2 至 3 个具体可搜索的岗位名称，每个给出简历中明确存在的证据和一个需要确认的能力缺口。仅使用职业信息。不要发起搜索。${GROUNDING_RULES}`,
    input: JSON.stringify(facts).slice(0,14000),
  });
  const directions = result.directions.filter((d,i,a) => d.title.trim() && d.evidence.trim() && a.findIndex(x => x.title === d.title) === i).slice(0,3);
  if (!directions.length) return badRequest("简历中没有足够的岗位方向证据，请手动填写岗位。",422);
  return Response.json({ directions });
});
