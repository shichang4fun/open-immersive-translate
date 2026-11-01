# iPhone / iPad Safari 版本

移动版包含 SwiftUI 引导 App 和 Safari Web Extension，支持 iOS/iPadOS 17 及以上。翻译正文、设置、服务适配器和历史记录复用本项目代码，来源和 MIT 许可见 [项目 README](../README.md) 与 [LICENSE](../LICENSE)。

## 安装和使用

App Store 条目已创建，当前仍在准备提交，尚未公开上架。开发构建可通过 Xcode 安装到自己的设备；模拟器产物不能直接安装到 iPhone。

1. 打开“设置 → App → Safari 浏览器 → 扩展”，启用 Bilingual Translator。
2. 在 Safari 页面菜单中打开“管理扩展”，按需将 Bilingual Translator 加入菜单。
3. 打开网页，从页面菜单选择本扩展，允许访问当前网站；无需允许所有网站。
4. 阅读所选翻译服务的文本处理提示，明确同意后开始翻译。更换服务或自定义地址主机需要重新授权；可以在服务设置中撤销授权。
5. 使用“显示原文”恢复页面。ChatGPT 是可选服务，需要在此设备中单独完成账号授权；桌面浏览器的凭据不会打包或迁移到 App。

## 本地构建

需要 macOS、完整 Xcode、Node.js、pnpm 和 XcodeGen。项目内不包含证书、描述文件或 API 密钥。

```bash
pnpm install --frozen-lockfile
pnpm package:safari:ios
open native/ios/BilingualTranslator.xcodeproj
```

在 Xcode 中选择 `BilingualTranslator` scheme、自己的开发团队和目标设备，再运行。维护者默认的 Bundle ID 和团队写在 `native/ios/project.yml`；其他开发者需改为自己的标识与团队。用 `SAFARI_DEVELOPMENT_TEAM` 可以覆盖命令行归档团队。

```bash
SAFARI_DEVELOPMENT_TEAM=YOUR_TEAM_ID pnpm package:safari:ios --archive
```

归档在 `build-safari-ios/BilingualTranslator.xcarchive`。首次配置签名时，可在 Xcode 中登录 Apple 开发者账号并配置自动签名。上架还需要 App Store Connect 资料、隐私声明、对应设备截图、签名与 Apple 审核；生成归档不代表已经上架。

`native/ios/project.yml`、Swift 源码、图标和 PrivacyInfo 是维护源；Xcode 工程、App/Info.plist 和 Extension/Info.plist 由 XcodeGen 生成。修改工程设置后应同步修改 YAML，再生成工程。`dist-safari-ios/`、`build-safari-ios/` 和生成的 `.xcodeproj` 不提交 Git。

## 平台差异

| 功能 | 移动端行为 |
| --- | --- |
| 网页翻译 | 保留双语、仅译文、恢复原文和译文字号比例设置；首次发送文本前按服务授权。 |
| 翻译服务 | 默认 Google；ChatGPT 与自定义服务需使用自己的账号或配置。第三方模型、额度和可用性由提供商决定。 |
| 快捷菜单 | 适配手机宽度、触控字号与按钮；无桌面右键菜单和键盘快捷键注册。 |
| 翻译助手 | 在 Safari 新标签中打开，并关联原网页。 |
| 历史记录 | 可选保存于本机；保留手动 JSONL / CSV 导出。移动端隐藏依赖 Mac 本地伴随程序的每周自动导出。 |
| 私有服务 | 公共 iOS 构建强制移除维护者本地归档令牌；不会默认上传记录到归档服务器。 |
| 网站权限 | 由 Safari 管理，可仅授权单个网站；系统权限不替代第三方文本发送授权。 |
| 视频与 PDF | 共用逻辑已打包；移动 Safari 上的站点字幕、全屏播放器及文件导出需分别验收，不承诺与桌面完全一致。 |

数据处理、第三方提供商和清除本机记录的方法见 [隐私政策](PRIVACY.md)。

## 验证

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build:safari:ios
xcodebuild -project native/ios/BilingualTranslator.xcodeproj \
  -scheme BilingualTranslator -destination 'platform=iOS Simulator,name=iPhone 17 Pro Max' \
  -parallel-testing-enabled NO test
```

单元测试验证服务授权隔离、撤销、更换地址、备用服务发送前的授权检查，以及 iOS 助手新标签分支。构建检查验证移动端 manifest、同步后台脚本和入口文件。原生 UI 测试使用独立模拟器，配置扩展并验证翻译授权、网页翻译和恢复流程；Chromium 回归测试不能代替该原生测试。

2026-11-01：503 项单元测试通过；iOS 26.5 的 iPhone 模拟器已通过 Google 服务授权、example.com 实际中文双语翻译和恢复原文的原生 UI 测试，中英文引导页也已验证。此结果不代表个人 ChatGPT 账号、全部网站、视频或实体设备均已验收。

参考：[Apple Safari Web Extension 打包说明](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)、[App Store 审核指南](https://developer.apple.com/app-store/review/guidelines/)。
