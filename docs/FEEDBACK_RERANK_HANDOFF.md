# 职位反馈重排交接说明

## 做了什么

普通搜索的职位列表增加 `Fit / For you` 和 `All / Saved`。用户可收藏职位，或选择 `Too senior`、`Wrong role`、`Not this company`、`Other` 跳过职位；跳过项折叠到列表末尾，可用 `Undo` 恢复。反馈保存在本机 `data/job-feedback.json`，重新搜索和重启网站后仍可使用。`Saved` 按收藏时间显示跨搜索职位。

`Fit` 保持现有 `quickFit` 顺序；`For you` 在该顺序上做有上限的调整，不改变卡片的 `fit%`。只有职位自身受到反馈规则影响且名次确实变化时，才显示上调或下调原因。

## 反馈如何影响职位

| 反馈 | 后续 `For you` 中的作用 |
| --- | --- |
| Save | 收藏职位本身上调；名称核心词相近且级别相同的职位也可小幅上调。 |
| Skip · Too senior | 同级或更高级的高级职位下调；若本次搜索明确包含 Senior、Lead 等高级词，则不应用这条偏好。 |
| Skip · Wrong role | 仅当新搜索方向与原搜索相近时，下调名称与被跳过职位相近的职位。 |
| Skip · Not this company | 下调同一家公司的职位。 |
| Skip · Other | 只折叠当前职位，不推断长期偏好。 |

反馈立即保存：当前列表在 `For you` 下即时重排，以后相关搜索继续使用；`Fit` 和 `For you` 都把已跳过职位折叠在末尾。`Saved` 汇集本机跨搜索收藏的职位；`Undo` 删除该职位的反馈。数据保存在本机，不随 Git 或其他电脑同步。

调整幅度是初版的**排序规则**：以 `quickFit` 为基数，收藏职位暂加 10、相似收藏职位每条暂加 4、匹配跳过原因的职位每条暂减 10；累计上调最多 10、下调最多 12，再相互抵消。数值只用于决定列表位置，不写回 `fit%`，也不是经过训练或校准的推荐分数；可在小组测试后按实际职位分布调整。

## 文件与职责

| 文件 | 本分支的改动 |
| --- | --- |
| `lib/jobs/feedback.ts`（新增） | 反馈类型、独立 JSON 存储、读写队列和撤销。 |
| `lib/jobs/personalize.ts`（新增） | 职位名称、级别、公司与搜索词的有限规则重排；产生排序说明。 |
| `app/api/job-feedback/route.ts`（新增） | `GET` 读取反馈和收藏职位；`POST` 保存、跳过或撤销。 |
| `app/app/_components/JobFeedbackActions.tsx`（新增） | 卡片操作、跳过原因选择及 Undo。 |
| `app/app/_components/JobList.tsx`（修改） | 显示反馈操作、折叠项和排序说明；职位选择与操作按钮分开。 |
| `app/app/page.tsx`（修改） | 管理两组切换、反馈状态，并在普通搜索结果上调用重排。此文件是团队共用工作台，整合时重点检查。 |
| `tests/job-feedback.spec.ts`（新增） | 验证收藏、跨搜索规则、跳过、撤销、提示条件及本地持久化。 |

## 整合与验证

数据路径是「现有搜索与 `quickFit` → 页面收到职位 → 读取本地反馈 → `For you` 展示排序」。搜索 API、`quickFit`、右侧 Match analysis、简历定制和 Autopilot 均未接入这套重排。反馈文件由程序运行时创建，`data/` 已被 Git 忽略。

已运行 `npm run lint`、`npm run typecheck` 和 `npx playwright test tests/job-feedback.spec.ts`；网页交互也已做初步人工检查。组内整合时再复测完整搜索流程。学校 API 适配和本机依赖安装产生的改动不属于本功能 PR。
