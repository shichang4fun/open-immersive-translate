# Open Immersive Translate · 独立维护版

本仓库是由 [shichang4fun](https://github.com/shichang4fun) 独立维护的开源双语翻译扩展，**直接 fork 自 [ymcwiki/open-immersive-translate](https://github.com/ymcwiki/open-immersive-translate)**，沿用 MIT 许可证。感谢原作者 ymcwiki 及上游贡献者提供的代码与文档基础。

它按段落提取网页正文，在原文旁显示译文，并支持 ChatGPT 账号授权翻译、PDF、视频字幕和多种翻译服务。首次安装默认使用免密钥的 Google 翻译服务，目标语言为简体中文。主要维护和验证环境为 Chromium 扩展；仓库也保留上游的 Firefox 与油猴构建入口，具体能力见 [功能对照](docs/FEATURE_PARITY.md)。

## 项目来源与引用声明

| 来源 | 本项目中的用途 |
|---|---|
| [ymcwiki/open-immersive-translate](https://github.com/ymcwiki/open-immersive-translate) | 直接上游和主要代码来源，包括扩展架构、翻译服务、ChatGPT OAuth、PDF、字幕和初始文档；保留原 Git 历史与 [MIT 许可证](LICENSE) 中的原作者署名。 |
| [Immersive Translate](https://immersivetranslate.com/) | 上游的功能对照对象；上游还转换了其扩展包中的部分站点配置，具体来源见文末“第三方参考与致谢”。 |
| [Sider](https://sider.ai/) | 本分支设置页布局及视频双语开关的交互设计参考，相关界面由本分支实现。 |
| [hermes-agent](https://github.com/nousresearch/hermes-agent) | 上游 README 声明的 ChatGPT OAuth 设备码登录实现参考。 |

本仓库是社区独立维护的衍生项目，与上述产品及 OpenAI 不存在官方隶属或背书关系。源码继承、功能参考和 UI 设计参考的范围如上表所示。

## 本分支的主要修改

- 修复 X 文章正文提取与翻译。
- 自动保存网页翻译记录，支持 JSONL / CSV 导出及配对本机程序后的每周备份。
- 增加 ChatGPT Fast 请求选项、账号模型列表刷新及译文字号百分比缩放。
- 重设计设置页和快捷弹窗，改善字号、深色模式与窄窗口布局。
- 增加独立视频字幕开关，修复 YouTube 字幕加载、译文显示延迟和大段字幕遮挡问题。
- 修复输入框语言菜单误触发等交互问题，补充单元测试和浏览器回归测试。

开发、功能边界和同步上游的方法见 [独立维护说明](docs/FORK_DEVELOPMENT.md)。本分支功能反馈请提交到 [本仓库 Issues](https://github.com/shichang4fun/open-immersive-translate/issues)；适合上游的通用修复会单独提交给原项目。

> 上游保留了 AI 编码代理在人工编排下开发时使用的 [任务书](docs/prompts/)；本分支后续修改也使用了 OpenAI Codex 辅助开发。

## 原版是怎么闭源的

沉浸式翻译最初是开源的，后来把源码收了回去，这是可以在 GitHub 上核对的公开事实：

| 时间 | 事件 |
|---|---|
| 2022-11-04 | 作者创建开源仓库 [old-immersive-translate](https://github.com/immersive-translate/old-immersive-translate)，许可证 MPL-2.0，发布到 v0.0.41 |
| 2022-12-07 | 新建现在的 [immersive-translate/immersive-translate](https://github.com/immersive-translate/immersive-translate) 仓库 |
| 2023-01-16 | 旧开源仓库最后一次推送 |
| 2023-01-17 | 旧开源仓库被归档（按官方 README 的说法） |
| 此后至今 | 新仓库只放 `dist/`（打包产物）、`docs/` 和 README，没有 `src/`，没有许可证文件；README 明确写着「沉浸式翻译并非开源软件，这个仓库并不包含沉浸式翻译的源代码」 |

也就是说，开源状态只维持了大约两个半月、到 v0.0.41 为止。现在 GitHub 上那 1.8 万个 star 挂在一个只有发布产物的仓库上。装到浏览器里的扩展包（以 1.32.7 为例）是 12 MB 压缩混淆过的 JavaScript，没有 source map，`content_main.js` 单文件 3.5 MB。它后来加入了账号体系、Pro 订阅、活动运营和埋点上报，这些逻辑同样无法审计。

本项目不评价这个商业选择，只是给需要可审计、可修改版本的人一个选项。

## 用自己的 ChatGPT 账号登录（OAuth，不需要 API key）

这是本项目区别于原版最实用的一点：**你有 ChatGPT Plus / Pro / Team 订阅，就能直接用它翻译，不用再去 platform.openai.com 买 API 额度。** 原理和 OpenAI 官方 Codex CLI、[hermes-agent](https://github.com/nousresearch/hermes-agent) 一样，走 OpenAI 的设备码 OAuth 流程，拿到的令牌调用 ChatGPT 的 Codex 后端，用的是你订阅里包含的模型额度。

### 登录步骤

1. 设置页 →「翻译服务」→ 选「ChatGPT 账号（OAuth）」。
2. 点「登录 ChatGPT」。设置页会显示一串**设备码**（形如 `XXXX-XXXXX`），旁边有复制按钮。
3. 点「打开登录页面」，浏览器打开 `https://auth.openai.com/codex/device`，登录你的 ChatGPT 账号，把设备码填进去，点授权。
4. 回到设置页，它会自动轮询，几秒内显示「已登录」以及账号邮箱、套餐类型、令牌有效期。
5. 点「测试连接」确认能翻，然后在弹窗里把当前服务切成 ChatGPT 即可。

整个过程不需要输入密码到插件里，授权全部在 OpenAI 自己的登录页完成。设备码 15 分钟内有效，过期重新点登录即可。

### 已经装了 Codex CLI 的话

展开「从 Codex CLI 导入」，把 `~/.codex/auth.json` 的完整内容粘贴进去，直接复用 CLI 已登录的凭据，不用再走一遍设备码。

### 背后发生了什么

| 步骤 | 请求 |
|---|---|
| 申请设备码 | `POST auth.openai.com/api/accounts/deviceauth/usercode` |
| 轮询授权结果 | `POST auth.openai.com/api/accounts/deviceauth/token`（未完成返回 403/404） |
| 换取令牌 | `POST auth.openai.com/oauth/token`（`authorization_code` + PKCE `code_verifier`） |
| 翻译 | `POST chatgpt.com/backend-api/codex/responses`（Responses API，流式 SSE） |
| 模型列表 | `GET chatgpt.com/backend-api/codex/models` |
| 续期 | `POST auth.openai.com/oauth/token`（`refresh_token`，到期前 2 分钟自动刷新） |

请求头带 `Authorization: Bearer <access_token>` 和从 JWT 里解出的 `ChatGPT-Account-ID`，并按 OpenAI 对第三方客户端的要求用 `originator` 标识本插件。401 会自动刷新令牌重试一次，429 按 `Retry-After` 退避。

### 思考强度

ChatGPT 服务可分别设置翻译和助手的思考强度，默认是「低」和「中」。批量翻译格式固定、重复度高，使用「低」通常能兼顾质量与速度；追求速度可选「无」。`max` 只适用于 `gpt-5.6*` 模型，其他模型会自动降到「极高」。助手设置同时用于侧边栏对话、词典和 AI 写作。

### 安全与边界

- 访问令牌和刷新令牌只存在 `chrome.storage.local` 的独立条目里，**不会随配置导出**，也不会发给任何第三方。「退出登录」即清除。
- 这是 OpenAI 面向 Codex 客户端开放的流程，额度受你订阅计划的限制，和网页版 ChatGPT 共用。用量大时可能触发 429，属正常限流。
- 油猴脚本版不含此 provider（GM 请求层不支持流式 SSE），Chrome / Edge / Firefox 扩展版都支持。
- 全部实现在 [src/background/services/chatgpt-oauth/](src/background/services/chatgpt-oauth/)，可自行审阅。

## 主要入口

- 网页：弹窗、悬浮球、划词、悬停、输入框、右键菜单和浏览器快捷键。
- PDF：内置 pdf.js 阅读器可打开本地或在线 PDF，按段显示双语译文，并可导出双语 PDF。
- 视频字幕：支持 YouTube、通用 WebVTT `<track>` 和多类流媒体/课程站点适配器；部分第三方站点适配器仍属实验性兼容。
- 字幕文件：独立页面可导入 SRT、WebVTT、ASS/SSA，翻译后下载双语或仅译文字幕。
- 侧边栏：可翻译文字、保留本地历史，并提供对话和页面操作入口。
- AI 写作：在可编辑区域中执行总结、润色、翻译和建议提示词。

翻译控制器会把当前页面的空闲、翻译中、完成或错误状态及段落计数同步给后台。扩展图标按标签页显示对应角标，并在主框架导航时清除旧状态。

弹窗的“更多”菜单可以打开设置、快捷键、反馈、PDF 阅读器、字幕文件页、侧边栏和配置导入/导出，并在显示缓存条目数和确认后清除缓存。右键菜单提供翻译网页、翻译选中文本、翻译本地 PDF、翻译字幕文件和打开侧边栏。所有新增设置位于设置页，包括服务字段、字幕、PDF、搜索增强、远程规则、侧边栏、AI 写作、术语表领域和缓存策略。

## 构建

需要 Node.js 和 pnpm。

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e
```

构建结果位于 `dist/`。

另有两个分发构建：

```bash
pnpm build:firefox
pnpm build:userscript
```

## 在 Chrome 中加载

1. 打开 `chrome://extensions/`。
2. 开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本项目的 `dist/` 目录。
4. 打开普通网页，点击扩展图标或按 `Alt+A` 开始翻译。

修改代码后重新运行 `pnpm build`，再到扩展管理页点击刷新按钮。

## 配置 OpenAI 兼容服务

1. 在扩展弹窗中点击“设置”，进入“翻译服务”。
2. 找到 OpenAI 兼容服务并启用。
3. 填写 API Key、Base URL 和模型名。OpenAI 官方接口的 Base URL 可填写 `https://api.openai.com/v1`，模型名按账号可用模型填写。
4. 如服务使用不同路径，可在导出的配置中设置 `apiPath`；默认路径为 `/chat/completions`。
5. 点击“测试连接”。设置页会显示请求延迟和返回样例，或直接显示认证、超时等错误。测试通过后，在扩展弹窗的服务列表中选择该服务。

API Key 保存在浏览器的扩展本地存储中，不会写入项目文件。兼容服务必须接受 Chat Completions 格式并返回 `choices[0].message.content`。

设置页也可配置 Google、Bing、DeepL、Azure Translator、Gemini、Claude、国内机器翻译服务、OpenAI 兼容预设及自定义 HTTP 服务。未填写凭据的收费服务不会自动启用。

调度器会先检查所选服务是否支持当前源语言和目标语言。如果不支持，会跳过该服务并尝试它配置的备用服务；没有可用服务时返回明确错误。设置页会在当前服务卡片中直接提示不支持的语言对。

侧边栏对话、词典和 AI 写作需要选择 ChatGPT 账号、OpenAI 兼容、Azure OpenAI、Claude 或 Gemini 服务；这些请求只由后台适配器发出，页面脚本不会直接访问服务端接口。

## 编写站点规则

在设置页的“站点规则”中填写 JSON 数组。下面的规则只扫描 `example.com` 的文章区域，跳过广告和补充的代码区域，并在访问时自动翻译：

```json
[
  {
    "id": "example-article",
    "matches": ["*://*.example.com/*"],
    "selectors": ["article"],
    "additionalExcludeSelectors": [".advertisement", "pre", "code"],
    "autoTranslate": true
  }
]
```

- `matches` 是必填的 URL glob 数组；`*` 可匹配任意字符。
- `excludeMatches` 可排除特定 URL。
- `selectors` 限定扫描区域；不填写时沿用通用规则。
- `additionalExcludeSelectors` 在通用排除列表上追加 CSS 选择器；`excludeSelectors` 会替换该列表。
- `autoTranslate` 为 `true` 时自动翻译，但“从不翻译的网站”设置仍有最高优先级。
- `service`、`translationMode` 和 `theme` 可覆盖该站点的全局设置。

保存前，设置页会校验 JSON 和规则字段。

规则合并顺序为：通用规则 → 内置规则 → 远程规则 → 用户规则。后面的普通字段覆盖前面的字段，`additional*` 字段按追加语义合并。远程订阅只接受 HTTP(S) URL，每 24 小时刷新；拉取失败时保留最近一次有效缓存。

### 翻译记录与分析导出

新记录使用 `first_saved_at` 保留首次保存时间，`last_seen_at` 记录最近一次显示译文的时间；重复保存同一记录不会覆盖首次时间。`saved_at` 保留原有的最近保存含义。旧记录无法恢复的首次时间为 `null`；旧缓存没有浏览记录，因此两个新时间字段均为 `null`。这些字段以兼容方式加入现有 JSONL / CSV，记录 ID 不变。

本地版本默认自动保存成功显示的网页段落原文、译文、网址、标题、段落顺序、请求语言和翻译服务、保存时间。记录使用独立的 `bilingual-translator-history` IndexedDB 数据库；刷新页面会去重，清空翻译缓存不会删除这些记录。可在“缓存 / 导入导出”中关闭自动保存，或通过设置页及网页“译”悬浮球右键菜单导出 JSONL / CSV。JSONL 保持精确文本，CSV 对公式字符加保护前缀。

已配对本机存档程序的构建默认启用每周备份：每周日北京时间 23:00，插件后台把同一份已保存记录快照交给本机 Node 程序，直接写出 translations.jsonl、translations.csv 和含 SHA256 的 manifest.json。只监听 127.0.0.1:24198，使用本机私有令牌验证请求，拒绝普通网页来源；文件先写入临时目录，完整写入后才发布。无需网页、Codex 或模型调用；Chrome 关闭时错过的周期在下次启动后补一次，失败至多每小时重试一次。设置页可关闭每周导出并查看失败原因，悬浮球菜单的“立即保存每周备份”可执行同一程序。未配对的普通构建默认关闭每周导出。

存档程序为 scripts/local-archive-server.mjs，只使用 Node 内置模块。启动时通过 IMT_ARCHIVE_TOKEN（至少 32 字符）和 IMT_ARCHIVE_DIR 指定私有令牌及存档根目录；构建扩展时通过 VITE_LOCAL_ARCHIVE_TOKEN 配置相同令牌。不要把令牌提交到 Git。每次备份保存在存档根目录/北京时间日期/独立时间戳目录中，保留旧备份。程序与插件必须配套更新。

导出还会尝试恢复旧缓存译文，缺失的原文、网址和服务等字段为空，并标记为 `recovered_cache`；其中可能包含富文本占位符。用于成对语料分析时，应筛选原文非空的记录。保存范围是网页段落，不包括独立 PDF、视频字幕和仅划词翻译。卸载扩展或清除扩展浏览器数据仍会删除本机记录，长期资料应定期导出。

## 常用快捷键

- `Alt+A`：切换页面翻译。
- `Alt+W`：切换整页翻译。
- `Alt+M`：切换正文翻译。
- `Alt+T`：切换双语/仅译文模式。

其他命令已注册，可在 `chrome://extensions/shortcuts` 中自行分配，包含立即翻译到底部、遮罩、悬停直接翻译、字幕预翻译、服务切换、输入框翻译、侧边栏和 AI 写作。设置页的“快捷键”标签会通过 `chrome.commands.getAll` 列出全部命令及当前绑定，并提供快捷键管理页入口。

## 端到端测试

首次运行先安装 Playwright 的 Chromium：

```bash
pnpm exec playwright install chromium
```

然后运行：

```bash
pnpm e2e
```

测试会构建扩展并以 `dist/` 启动 Chromium。端到端用例只使用确定性的 `mock` 服务，覆盖普通网页翻译与 DOM 恢复、术语表、遮罩、仅译文模式、PDF 阅读器、三条字幕的 SRT 文件页，以及侧边栏文字翻译。

Netflix、Prime Video、Disney+、HBO Max、Hulu、课程平台和社交视频字幕适配器均有捕获格式 fixture 的解析单测。真实第三方站点的登录态、DRM、当前字幕接口和播放器版本仍需在线验证，因此这些兼容项继续标记为实验性。

## 第三方参考与致谢

- **直接上游**：[ymcwiki/open-immersive-translate](https://github.com/ymcwiki/open-immersive-translate)。本分支在其代码上继续开发，原作者与贡献者的工作保留在 Git 历史中。
- **站点配置来源**：继承的上游说明记载，144 条内置站点规则由 Immersive Translate 扩展包的 `default_config.json`（CSS 选择器等配置数据）经 [scripts/port-rules.ts](scripts/port-rules.ts) 转换而来；本仓库保留此来源声明。
- **OAuth 实现参考**：上游说明记载，ChatGPT 设备码登录流程参考了 [hermes-agent](https://github.com/nousresearch/hermes-agent)（MIT）的实现。
- **UI 设计参考**：[Sider](https://sider.ai/) 的设置布局与视频双语开关交互。
- **PDF 依赖**：渲染使用 [PDF.js](https://github.com/mozilla/pdf.js)，双语 PDF 导出使用 [pdf-lib](https://github.com/Hopding/pdf-lib)。其他直接依赖见 [package.json](package.json)，锁定版本见 [pnpm-lock.yaml](pnpm-lock.yaml)。

## 许可证

本仓库代码沿用上游的 MIT 许可证，完整条款见 [LICENSE](LICENSE)，其中保留 `Copyright (c) 2026 ymcwiki` 原始版权声明。本分支新增和修改的代码也按 MIT 许可证提供。

复制、修改或再分发本项目代码时，请按 MIT 条款保留原版权声明和许可文本。第三方依赖及其他来源材料适用各自的许可证或授权条件；上述来源署名不替代相应授权。
