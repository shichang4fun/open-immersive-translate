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
