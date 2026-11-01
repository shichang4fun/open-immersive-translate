import SwiftUI
import SafariServices

@main
struct BilingualTranslatorApp: App {
    var body: some Scene {
        WindowGroup { SetupView() }
    }
}

private struct SetupView: View {
    @Environment(\.locale) private var locale
    @Environment(\.openURL) private var openURL
    @State private var showGuide = false
    private let accent = Color(red: 0.41, green: 0.26, blue: 0.85)
    private var chinese: Bool { locale.language.languageCode?.identifier == "zh" }
    private func text(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("译")
                            .font(.system(size: 42, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 76, height: 76)
                            .background(accent, in: RoundedRectangle(cornerRadius: 20))
                        Text(text("用自己的语言\n阅读世界", "Read the web.\nKeep the original."))
                            .font(.largeTitle.bold())
                        Text(text("Safari 网页双语翻译，保留原文、布局和阅读节奏。", "Bilingual translation for Safari, with the original text and layout preserved."))
                            .font(.body).foregroundStyle(.secondary)
                    }
                    VStack(alignment: .leading, spacing: 20) {
                        step("1", text("启用 Safari 扩展", "Enable the Safari extension"), text("设置 → App → Safari 浏览器 → 扩展 → Bilingual Translator。", "Settings → Apps → Safari → Extensions → Bilingual Translator."))
                        Button(text("打开 Safari 扩展设置", "Open Safari Extension Settings"), action: openExtensionSettings)
                            .buttonStyle(.borderedProminent).controlSize(.large)
                        Divider()
                        step("2", text("选择网站与翻译服务", "Choose a website and service"), text("在 Safari 页面菜单中选择本扩展，允许当前网站访问。先阅读并同意向所选服务发送文本，再开始翻译。", "Open this extension from Safari’s page menu and allow the current website. Review and consent to sharing text with your chosen service before translating."))
                        Divider()
                        step("3", text("翻译，随时恢复原文", "Translate, then restore"), text("选择简体中文或其他目标语言，使用双语或仅译文模式；再次点击网页浮动按钮即可恢复原文。", "Choose a target language and bilingual or translation-only mode. Tap the floating button again to restore the original."))
                    }
                    .padding(20).background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))

                    VStack(alignment: .leading, spacing: 12) {
                        Label(text("使用你自己的翻译服务", "Bring your own translation service"), systemImage: "person.crop.circle.badge.checkmark")
                            .font(.headline)
                        Text(text("可选 Google 翻译或 ChatGPT 账号授权等服务。ChatGPT 需要在 Safari 扩展内单独登录，可用模型与额度由服务商决定；本 App 不包含任何第三方订阅。", "Choose Google Translate, connect a ChatGPT account, or configure another supported service. Sign in inside the Safari extension. Models and quotas depend on the provider; this app does not include a third-party subscription."))
                            .font(.subheadline).foregroundStyle(.secondary)
                        Button(text("打开示例网页", "Open Example Website")) {
                            openURL(URL(string: "https://example.com")!)
                        }.buttonStyle(.bordered).controlSize(.large)
                        Text(text("请使用 Safari 浏览器打开示例网页。此按钮会使用系统默认浏览器。", "Use Safari to try the extension. This button opens your default browser."))
                            .font(.caption).foregroundStyle(.secondary)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        Label(text("你的内容，由你控制", "Your content, your choice"), systemImage: "hand.raised")
                            .font(.headline)
                        Text(text("开发者不运营翻译服务器，不收集浏览历史或账号凭据。翻译时，所选文本及必要网页上下文会发给你同意使用的第三方服务。设置、授权信息和可选历史记录保存在本机。", "The developer operates no translation server and collects no browsing history or account credentials. Translation sends selected text and necessary page context to the third-party service you approve. Settings, authorization and optional history stay on your device."))
                            .font(.subheadline).foregroundStyle(.secondary)
                        Link(text("隐私政策", "Privacy Policy"), destination: URL(string: "https://github.com/shichang4fun/open-immersive-translate/blob/main/docs/PRIVACY.md")!)
                        Link(text("帮助与反馈", "Help & Support"), destination: URL(string: "https://github.com/shichang4fun/open-immersive-translate/issues")!)
                        Link(text("开源项目与引用来源", "Source Code & Attribution"), destination: URL(string: "https://github.com/shichang4fun/open-immersive-translate")!)
                        Text(text("基于 ymcwiki/open-immersive-translate（MIT）独立维护。", "Independently maintained, based on ymcwiki/open-immersive-translate (MIT)."))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }.padding(24)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Bilingual Translator")
            .navigationBarTitleDisplayMode(.inline)
            .tint(accent)
            .alert(text("手动启用扩展", "Enable the Extension"), isPresented: $showGuide) {
                Button(text("知道了", "OK"), role: .cancel) {}
            } message: {
                Text(text("请打开设置 → App → Safari 浏览器 → 扩展，启用 Bilingual Translator，并按需允许网站访问。", "Open Settings → Apps → Safari → Extensions, enable Bilingual Translator, then allow websites as needed."))
            }
        }
    }

    private func step(_ number: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Text(number).font(.headline).foregroundStyle(accent)
                .frame(width: 30, height: 30).background(accent.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.headline)
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    private func openExtensionSettings() {
        if #available(iOS 26.2, *) {
            SFSafariSettings.openExtensionsSettings(forIdentifiers: ["com.shichang4fun.Bilingual-Translator.Extension"]) { error in
                if error != nil { showGuide = true }
            }
        } else {
            showGuide = true
        }
    }
}
