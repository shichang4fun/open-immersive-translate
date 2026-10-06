# 独立维护说明

- 维护仓库：https://github.com/shichang4fun/open-immersive-translate
- 上游仓库：https://github.com/ymcwiki/open-immersive-translate
- `origin` 指向个人 fork；`upstream` 指向原项目。
- `main` 是个人版本的开发基线，新功能使用独立分支，验证后合入 `main`。
- `fix/x-article-translation` 保留提交给上游的修复；对应上游 PR #3：https://github.com/ymcwiki/open-immersive-translate/pull/3

## 已包含的个人功能

- X 文章标题和正文翻译，支持非编辑状态的富文本正文。
- 自动保存网页翻译的原文、译文、网址及元数据，支持 JSONL / CSV 导出。旧缓存能恢复的记录可能缺少原文和来源。
- 配对本机 Node 存档程序后，每周日北京时间 23:00 自动保存全量快照；Chrome 关闭时，下次启动补一次。
- ChatGPT 服务设置新增“请求速度”：默认标准，可选 Fast，同时应用于翻译和助手。Fast 可能更快消耗订阅额度或积分。

Fast 通过当前 Codex OAuth 接口的 `service_tier: "priority"` 请求；该接口目前拒绝 `"fast"`。服务端可能回退到标准速度，选择 Fast 不代表实际获得加速。2026-10-05 的一次账号实测中，`gpt-6.1-sol` 接受了 `priority` 并完成翻译，但响应报告实际档位为 `default`，未验证到加速。

当前每周快照同时包含 JSONL、CSV 和校验清单，保留旧备份。当前接口单次请求上限为 20 MB；增量导出和压缩尚未实现。

## 开发与验证

播放器内提供“译 · 双语”开关（英文界面为 Bilingual），独立控制视频字幕翻译，并保存选择。关闭后移除翻译覆盖层、恢复原字幕状态、停止后续翻译批次；已经发出的请求可能仍会完成。YouTube 开关位于播放器控制栏，其他视频采用浮动按钮，支持全屏。设置了 Never translate 的站点默认关闭视频翻译；主动点击开关可临时允许当前页面，刷新后仍遵守站点排除规则。

字幕显示按最多 80 字符、3 个相邻片段及 6 秒合并窗口分段，与 API 的请求批次分开；长片段按词边界拆分。窄播放器会缩放字幕字号，底部为播放控件留出空间，避免自动字幕无标点时合成整段文字遮挡画面。

输入框语言栏只在输入 `//` 或 `/en ` 等明确翻译命令时显示；普通空格不再弹出语言栏，连续三次空格仍可直接翻译。搜索框（包括 X 搜索框）、密码等非文本输入框及只读字段不会触发输入翻译。语言栏支持 Esc、移除命令前缀、失焦、点击外部、滚动和窗口缩放时收起，选择语言后焦点返回编辑器。

设置页采用白色内容区、浅灰分组导航和紫色选中态，常用偏好以“说明在左、控件在右”的设置行展示，译文主题与预览并排显示。显式设置 body 为 16px，避免 Chrome 扩展页的默认样式缩小描述与开关文字；控件高 44px 以上，支持深色配色。窄窗口使用可横向滚动的导航和单列设置，弹出菜单不随之放大。分类会保留在地址中，支持刷新、浏览器后退和方向键切换；保存中及保存失败会显示状态。查看已登录的 ChatGPT 账号不会重新启用手动关闭的服务，模型列表的较早请求也不会覆盖手动刷新结果。

ChatGPT 模型建议包含 GPT-6.1 Sol 和 GPT-6 系列；设置页优先读取账号目录，并可用“刷新模型列表”绕过 24 小时缓存。刷新失败会保留原列表并提示错误，不会更换已选模型。未指定模型时优先选择账号支持的 GPT-6 Luna，再选择轻量模型或目录中的首个模型。离线内置名单仅作建议，不保证账号权限。

“基本 → 译文主题 → 译文字号缩放”提供 50%–200% 的常用缩放比例，默认 100% 与原文相同，带即时预览。每段译文按该段原文字号缩放，保留标题与正文的大小层级，不改变原文。旧绝对字号配置继续兼容，重新选择后改为百分比；字幕字号仍由字幕设置单独控制。

需要 Node.js 和 pnpm；pnpm 版本以 `package.json` 的 `packageManager` 为准。

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/my-feature
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

构建产物在 `dist/`。在 Chrome 扩展管理页加载该目录；修改后重新构建并刷新扩展。涉及浏览器行为时，补充针对性的 Playwright 集成测试或实际浏览器验证。

普通构建不包含本机配对令牌，每周自动备份默认关闭。启用备份时，构建扩展的 `VITE_LOCAL_ARCHIVE_TOKEN` 与存档程序的 `IMT_ARCHIVE_TOKEN` 必须相同；程序还需设置 `IMT_ARCHIVE_DIR`。具体运行方法见 README 的翻译记录存档说明。

执行 `pnpm e2e` 会自动生成测试令牌，启动随机本机端口的测试存档程序，并在临时目录构建扩展、创建浏览器资料和存档。正常完成或测试失败后会清理临时目录；可与个人存档程序同时运行，不覆盖 `dist/`，也不需要个人凭据。可用 `pnpm e2e --grep "weekly archive"` 运行指定场景。首次运行前需安装 Playwright Chromium：`pnpm exec playwright install chromium`。

## 同步上游

先确保工作区干净，在独立分支合并并验证，避免覆盖个人修改：

```bash
git switch main
git pull --ff-only origin main
git fetch upstream
git switch -c chore/sync-upstream
git merge upstream/main
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

解决冲突、确认个人功能仍正常后，再通过个人仓库的 PR 合入 `main`。上游贡献从 `upstream/main` 建立单独分支，只提交相关修复。

## 私有数据

不要提交 ChatGPT OAuth 凭据、本机配对令牌、个人翻译记录或备份。`.env`、`.env.*`、`local-private/` 和构建产物已忽略；示例配置使用占位符。忽略规则无法保护已经被 Git 跟踪的文件，提交前仍需检查暂存区。

保留上游 MIT 许可证和来源说明。升级源码不会自动更新已安装扩展或正在运行的本机存档程序，需要分别构建、刷新或重启对应组件。
