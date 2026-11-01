# Bilingual Translator 隐私政策 / Privacy Policy

最后更新 / Last updated: 2026-11-01

本政策适用于 shichang4fun 独立维护的 Bilingual Translator（Open Immersive Translate 分支）及其 Safari 扩展。项目源代码、维护者和反馈渠道见本页末尾。

## 网页内容与第三方翻译

你允许扩展访问的网站内容用于提取待翻译文本、显示译文和恢复原文。发起翻译时，文本及配置所需的上下文（例如网页标题、正文摘要、术语表）会发送给你选择的翻译服务。文本可能包含个人信息；你可以仅允许特定网站，选择服务，停止翻译或撤销网站访问权限。开启自动翻译时，也会根据你设置的站点规则处理内容。

iPhone/iPad 版本在首次向一个服务发送翻译内容之前要求明确授权。更改服务或自定义服务主机后需要重新授权，可在该服务设置中撤销。开发者不运营翻译中转服务器，不接收或出售你的网页文本、浏览历史、翻译记录或账号凭据。

所选服务会接收网络请求（包括网络连接所需的 IP 地址），并可能按其自身政策处理或保留数据。登录第三方账号时，服务可能将请求与你的账号关联。常见服务：

- Google Translate：[Google 隐私政策](https://policies.google.com/privacy)
- ChatGPT / OpenAI：[OpenAI 隐私政策](https://openai.com/policies/privacy-policy/)
- Anthropic：[Anthropic 隐私政策](https://www.anthropic.com/legal/privacy)
- Microsoft：[Microsoft 隐私声明](https://privacy.microsoft.com/privacystatement)
- 自定义服务：由你配置的地址所对应的提供商处理，使用前应查阅其隐私政策。

## 本机存储、账号和删除

设置、缓存和可选翻译历史保存在本机扩展存储中。你可在设置中清除缓存、导出历史、关闭后续历史保存、导入/导出普通配置。第三方 API Key、OAuth 访问令牌和刷新令牌保存在本机扩展存储中；配置导出不包含 ChatGPT OAuth 凭据。第三方账号授权由该服务提供商完成，本项目不获取你的登录密码。

你可以在 ChatGPT 服务设置中退出账号、在服务设置中删除自行填写的 API Key、清除缓存，或使用 Safari 的“清除存储”删除历史等扩展本地数据。卸载 App/扩展会移除本机数据，操作系统备份是否保留副本由系统设置决定。取消第三方账号授权或删除第三方保留的数据，需要使用该服务提供商提供的账号工具。

桌面私有构建可选连接本机伴随服务导出翻译记录；公共 iPhone/iPad 版本不包含维护者的本地服务令牌，不默认向任何本地或远程归档服务器上传记录。

## 分析、广告与联系

本项目没有广告、分析 SDK 或用于跨 App/网站广告追踪的代码。不出售或将你的翻译内容用于开发者的模型训练。你主动提交 GitHub issue 时，提交内容和附件按 GitHub 的政策处理；请勿上传 API Key、OAuth 令牌或私人网页内容。

隐私问题与支持：[项目 Issues](https://github.com/shichang4fun/open-immersive-translate/issues)。[源代码和引用来源](https://github.com/shichang4fun/open-immersive-translate)。本政策会随实际功能变化更新。

---

## English

This policy applies to Bilingual Translator, independently maintained by shichang4fun as a fork of Open Immersive Translate.

Translation sends source text and necessary configured context, such as the page title, summary and glossary, directly to your selected provider. Content may include personal information. Automatic translation also processes content according to your site rules. The iPhone/iPad version requires explicit permission before sending translation content to a provider; changing providers or custom hosts requires a new decision. Permission can be revoked in service settings.

The developer operates no translation relay and does not receive, sell or use your text, browsing history, translations or credentials for developer model training. Providers receive requests, including the IP address necessary for network communication, and may retain or associate data with your provider account under their own policies. Review the provider policies linked above, including the policy of any custom service you configure.

Settings, cache, optional history, API keys and OAuth tokens are stored locally in the extension. You can clear cache, export history, disable future history saving, remove API keys or sign out of ChatGPT. Ordinary configuration exports exclude ChatGPT OAuth credentials. The developer does not receive your provider password. Safari’s Clear Storage feature or uninstalling removes local data, including history, subject to operating-system backup settings. Manage provider-side authorization and data deletion with that provider.

Public iPhone/iPad builds contain no maintainer archive token and do not upload history to an archive server by default. The app includes no advertising or analytics SDK and performs no advertising tracking across apps or websites. Information you voluntarily post in GitHub issues is subject to GitHub’s policies; never include secrets or private webpage content.

For privacy questions, contact the maintainer through [project Issues](https://github.com/shichang4fun/open-immersive-translate/issues). Updates to this policy will reflect actual functionality changes.
