# macOS Safari 版本

Safari 版本复用本项目的翻译、设置、ChatGPT 设备码授权、翻译历史和视频字幕代码，单独生成 Safari Web Extension 与包含它的 macOS 应用。当前只提供 macOS 构建；不包含 iPhone/iPad 版。

## 构建

安装项目依赖后，生成 Web Extension 文件：

```bash
pnpm build:safari
```

输出为 `dist-safari/`，不修改 Chrome/Arc 使用的 `dist/`。打包原生应用需要完整 Xcode：

```bash
pnpm package:safari
```

命令使用 Apple 的 Safari Web Extension 打包工具生成工程并构建应用：

- 工程：`build-safari/project/Bilingual Translator/Bilingual Translator.xcodeproj`
- 应用：`build-safari/DerivedData/Build/Products/Release/Bilingual Translator.app`

默认以本地 ad-hoc 签名构建。可通过环境变量选择本机已有的 Apple Development 证书和团队供本机测试，脚本不会登录或自动创建证书：

```bash
SAFARI_SIGN_IDENTITY='Apple Development: Your Name (CERTIFICATEID)' \
SAFARI_DEVELOPMENT_TEAM=TEAMID pnpm package:safari
```

也可以选择 Developer ID Application 证书做分发构建，但公开分发还需要 Apple 公证；仅通过签名校验不代表 Safari 已接受该分发构建。生成工程可重复创建，不应手动修改后当作源文件维护；持久修改应加入打包脚本。`build-safari/`、`dist-safari/` 和私有签名材料不提交到 Git。

## 安装与更新

1. 将应用复制到“应用程序”目录后打开。
2. 在 Safari > 设置 > 扩展中启用 Bilingual Translator。
3. 在要翻译的网站允许扩展读取该网站，点击工具栏图标开始翻译。
4. 若使用 ad-hoc 签名，需要在 Safari 的开发者设置中手动允许未签名扩展；Safari 退出后可能需要重新允许。正式签名和分发方式参见 Apple 文档。

Safari 的设置、账号授权、历史记录与 Chrome/Arc 隔离，需要在 Safari 内重新授权 ChatGPT。可以使用配置导入迁移一般设置；配置文件不包含 OAuth 凭据。重新构建后替换应用，保留相同 Bundle ID，再按 Safari 提示更新或重启。

## 平台差异

| 功能 | Safari 处理方式 |
| --- | --- |
| 后台 | MV3 非持久后台页面，以模块脚本加载；保留 alarms 与本地存储恢复机制。 |
| 侧边栏 | Safari 无 Chrome sidePanel API，以独立窗口显示翻译助手，关联打开它的原网页。 |
| PDF 自动接管 | 保留 `.pdf` 链接检测和手动打开 PDF；不申请 webRequest 权限，不按响应 Content-Type 自动接管无后缀 PDF。 |
| 快捷键 | 可查看 Safari 报告的绑定；不打开 Chrome 的快捷键管理网址。 |
| 视频字幕 | 依赖网站提供字幕；保留 YouTube 播放页主播放器限制与 X 独立浮窗设置，Safari 实站兼容性需要单独验收。 |
| 历史与每周导出 | 保存于 Safari 的扩展存储；导出依赖浏览器运行。本地伴随服务需要在私有构建中提供 `VITE_LOCAL_ARCHIVE_TOKEN`，公共构建不包含私人令牌。 |
| 发布 | 构建产物不等于已通过公证或已上架；App Store 分发需独立签名与审核流程。 |

## 验证

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm package:safari
```

这些检查验证构建、平台分支和共用逻辑。Chromium 的端到端测试不能代替 Safari 实站验收。首次启用后应分别验证普通网页双语/恢复原文、设置持久化、ChatGPT 授权、YouTube 字幕与历史导出。

参考：[Apple 打包指南](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)、[运行与启用](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)、[浏览器兼容性](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility)。
