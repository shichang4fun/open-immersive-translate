import XCTest
import Vision

@MainActor
final class SafariTranslationTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func capture(_ name: String, app: XCUIApplication) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    // Safari's page text is not consistently exposed through XCUIElement labels.
    // Recognize the actual rendered output locally instead of asserting a UI flag.
    private func chineseCharacterCount(_ app: XCUIApplication) -> Int {
        guard let image = app.screenshot().image.cgImage else { return 0 }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["zh-Hans", "en-US"]
        do {
            try VNImageRequestHandler(cgImage: image).perform([request])
        } catch { return 0 }
        return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
            .joined().unicodeScalars.filter { (0x4E00...0x9FFF).contains($0.value) }.count
    }

    private func tap(_ identifier: String, in app: XCUIApplication, scrolls: Int = 8) {
        let elements = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier == %@ OR label == %@", identifier, identifier)
        )
        for _ in 0..<scrolls {
            if let element = elements.allElementsBoundByIndex.first(where: { $0.isHittable && $0.frame.width > 2 && $0.frame.height > 2 }) {
                element.tap()
                return
            }
            app.swipeUp()
        }
        XCTFail("Could not find button: \(identifier). \(app.debugDescription)")
    }

    func testLocalizedOnboarding() {
        for (language, locale, button) in [
            ("en", "en_US", "Open Safari Extension Settings"),
            ("zh-Hans", "zh_CN", "打开 Safari 扩展设置")
        ] {
            let app = XCUIApplication()
            app.launchArguments = ["-AppleLanguages", "(\(language))", "-AppleLocale", locale]
            app.launch()
            XCTAssertTrue(app.buttons[button].waitForExistence(timeout: 10))
            capture("onboarding-\(language)", app: app)
            app.terminate()
        }
    }

    func testSafariTranslationAndRestore() {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.buttons["Open Safari Extension Settings"].waitForExistence(timeout: 10))
        capture("01-onboarding", app: app)

        let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        settings.launch()
        tap("com.apple.settings.apps", in: settings)
        tap("com.apple.mobilesafari", in: settings)
        tap("WEB_EXTENSIONS", in: settings)
        tap("com.shichang4fun.Bilingual-Translator.Extension", in: settings)
        let toggle = settings.switches["Allow Extension"].firstMatch
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        if toggle.value as? String == "0" { toggle.tap() }
        capture("02-enabled-extension", app: settings)

        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.launch()
        let closeTip = safari.buttons["xmark.circle.fill"].firstMatch
        if closeTip.waitForExistence(timeout: 2) { closeTip.tap() }
        let address = safari.textFields["TabBarItemTitle"]
        XCTAssertTrue(address.waitForExistence(timeout: 10))
        address.tap()
        let url = safari.textFields["URL"]
        XCTAssertTrue(url.waitForExistence(timeout: 5))
        let clear = safari.buttons["ClearTextButton"]
        if clear.exists { clear.tap() }
        url.typeText("https://example.com\n")
        XCTAssertTrue(safari.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'This domain is for use'")).firstMatch.waitForExistence(timeout: 20))
        let menu = safari.buttons.matching(NSPredicate(format: "label == 'Page Menu'")).firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout: 15))
        menu.tap()
        // Safari may ask for its own preferred language before showing page actions.
        if safari.staticTexts["Which Language?"].waitForExistence(timeout: 2) {
            tap("English", in: safari, scrolls: 1)
            menu.tap()
        }
        capture("03-page-menu", app: safari)
        let extensionMenu = safari.descendants(matching: .any).matching(NSPredicate(format: "label == 'Bilingual Translator'")).firstMatch
        if !extensionMenu.waitForExistence(timeout: 3) {
            tap("ManageExtensions", in: safari, scrolls: 1)
            capture("03-manage-extensions", app: safari)
            let visible = safari.switches.matching(NSPredicate(format: "label CONTAINS 'Bilingual Translator'")).firstMatch
            XCTAssertTrue(visible.waitForExistence(timeout: 5), safari.debugDescription)
            if visible.value as? String == "0" { visible.tap() }
            tap("Done", in: safari, scrolls: 1)
            if menu.exists && menu.isHittable { menu.tap() }
        }
        tap("Bilingual Translator", in: safari, scrolls: 1)
        let allow = safari.buttons["Allow for One Day"]
        if allow.waitForExistence(timeout: 3) { allow.tap() }
        capture("03-translation-permission", app: safari)
        print("SAFARI_TRANSLATION_UI: \(safari.debugDescription)")
        let permission = safari.buttons["Allow text sharing with this service"]
        let revoke = safari.buttons["Revoke permission"]
        if !revoke.exists {
            XCTAssertTrue(permission.waitForExistence(timeout: 10), "Text sharing consent must be visible before translating")
            XCTAssertTrue(permission.isEnabled)
            permission.tap()
        }
        XCTAssertTrue(safari.buttons["Revoke permission"].waitForExistence(timeout: 10))
        capture("04-consented", app: safari)
        tap("Done", in: safari, scrolls: 1)
        let originalCount = chineseCharacterCount(safari)
        menu.tap()
        tap("Bilingual Translator", in: safari, scrolls: 1)
        tap("Translate", in: safari, scrolls: 3)
        tap("Done", in: safari, scrolls: 1)
        let translated = NSPredicate { _, _ in self.chineseCharacterCount(safari) > originalCount + 10 }
        expectation(for: translated, evaluatedWith: safari)
        waitForExpectations(timeout: 45)
        capture("05-bilingual-translation", app: safari)
        // Page reflow can collapse Safari's toolbar after dismissing the popup.
        if !menu.exists { safari.swipeDown() }
        XCTAssertTrue(menu.waitForExistence(timeout: 5))
        menu.tap()
        tap("Bilingual Translator", in: safari, scrolls: 1)
        tap("Show original", in: safari, scrolls: 3)
        tap("Done", in: safari, scrolls: 1)
        XCTAssertLessThanOrEqual(chineseCharacterCount(safari), originalCount + 5)
        capture("06-restored", app: safari)
    }
}
