# NextRole 申请管理模块

入口：工作台右上角“申请管理”，或直接访问 `/app/tracking`。

## 已实现

- 中文总表、公司/岗位搜索、状态与日期筛选、表内上下滚动、固定表头、分页及统计。
- 手动新增、修改状态、面试安排、备注、简历关联、归档/恢复。
- 详情面板、人工/Agent 变更时间线、各次运行使用的简历。
- Agent 提交结果自动同步，历史记录可通过“同步投递记录”补录。
- CSV 导出全部符合筛选条件的记录，含 UTF-8 BOM、转义及公式防护。

数据保存在 `data/application-records.json`，优先遵循 `NEXTROLE_DATA_DIR`，兼容 `ROLEFLOW_DATA_DIR`。
单用户、单 Node 服务进程使用；运行状态和招聘进度分别存储。
面试、Offer、未通过需要人工更新，未接入邮箱或招聘反馈接口。

## 与填表模块联调

当前接入点在 `lib/store.ts#saveRun`：原始运行记录保存成功后，对
`submitted` 结果调用 `syncApplicationRun(run)`。同步失败只记录错误，
不会触发招聘网站重新提交，可从申请管理页面补同步。

保持 `run.id`、`run.jobId`、`run.resumeVersionId` 稳定。
不同重试使用不同 run ID、相同 job ID。相同 run ID 的提交结果只处理一次。
同一 job ID 的重试关联到一条申请；人工进入面试等后续状态不会被旧提交结果覆盖。
首次历史同步会关联同岗位已有的失败尝试；详情还会按 job ID 查询完整运行历史。
跨来源重复职位和手动记录不自动模糊合并。

只将 Agent 的 `submitted` 解释为“Agent 报告提交成功”，不是独立平台确认。
等待审批、失败或取消不会创建成功投递记录。

## API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | /api/tracking | 列表、分页、统计 |
| POST | /api/tracking | 人工新增 |
| GET | /api/tracking/:id | 详情及关联运行 |
| PATCH | /api/tracking/:id | 更新，必须携带 revision |
| POST | /api/tracking/sync | 幂等补同步 |
| GET | /api/tracking/export | 导出筛选后的全部行 |

筛选参数：`q`、`status`、`archived=active|archived|all`、`from`、
`to`、`page`。每页 20 条。日期筛选按保存时间的 UTC 日期，
页面日期时间按设备时区显示。统计遵循归档范围，不随关键词和状态筛选变化。

状态：saved / applied / interviewing / offer / rejected / withdrawn。
累计投递和 Offer 保留历史事实；面试中为当前状态计数。
手动补录后续状态视为用户确认曾投递，但不推测实际投递时间。
修改冲突返回 409，用户应关闭详情并重新打开；输入错误返回 400。
本地存储串行执行完整读改写，损坏数据会报错，不会当作空文件覆盖。

## 验证

```powershell
$env:PW_CHANNEL='chrome'
npm run check
$env:ROLEFLOW_UI_TEST_URL='http://127.0.0.1:3101'
npm run test:tracking-ui
npm run build
```

普通测试包含存储/状态/同步测试；UI 测试单独启动 3101 端口服务，
使用系统临时目录的独立数据，不读写用户申请。默认测试中的 UI 用例会跳过，
通过 test:tracking-ui 单独运行。运行 UI 测试前应停止同一目录下的开发服务，
避免争用 Next.js 开发锁。

申请管理与工作台、邮件投递共用 NextRole 导航、字体和三种外观；招聘进度与自动填表执行记录仍独立存储。
