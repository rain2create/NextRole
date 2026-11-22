# NextRole 展示素材

当前 README 展示的是 NextRole 的实际界面：

| 文件 | 内容 |
| --- | --- |
| `nextrole-demo.gif` | 顶部浮动、薄荷 / 雾紫主题切换、申请表滚动；约 10 秒循环 |
| `nextrole-workspace.png` | 中文求职工作台 |
| `nextrole-tracking.png` | 申请状态总表 |
| `nextrole-login.png` | 两步手动登录流程 |
| `nextrole-autopilot.png` | 自动投递设置 |

全部使用脚本中的虚构简历、公司和申请记录。样本不代表真实职位、投递或录用，也没有实际执行模型调用、发送邮件或提交申请。

## 重新录制

先启动本地 NextRole，安装系统 Chrome 和 FFmpeg，并让 `ffmpeg` 可从命令行使用：

```bash
node scripts/capture-showcase.cjs
```

可使用 `NEXTROLE_PREVIEW_URL` 指定本机地址，`PW_CHANNEL` 指定已安装的浏览器，`FFMPEG_PATH` 指定编码器路径。截图和 GIF 写入本目录；中间帧写入已忽略的 `output/showcase/`。

脚本使用独立浏览器上下文、拦截所有 API 请求并返回合成数据，同时阻止非本机网络请求，不会读取运行中的个人简历或申请数据。修改后发布前仍需目视检查输出。

`roleflow-demo.*` 是保留的上游历史素材，制作说明在 [video/README.md](../../video/README.md)。NextRole 的当前介绍不引用它们。
