import SafariServices

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        // Translation and credentials stay in the WebExtension, not native logs.
        context.completeRequest(returningItems: [], completionHandler: nil)
    }
}
