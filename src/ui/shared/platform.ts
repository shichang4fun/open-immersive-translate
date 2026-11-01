import browser from "webextension-polyfill";
import { isIOSBuild } from "../../shared/platform";

if (isIOSBuild() && typeof document !== "undefined") {
  document.documentElement.dataset.imtPlatform = "ios";
}

export function isSafari(): boolean {
  return browser.runtime.getURL("").startsWith("safari-web-extension:");
}

export function shortcutsUrl(): string {
  return isSafari()
    ? `${browser.runtime.getURL("options.html")}#shortcuts`
    : "chrome://extensions/shortcuts";
}
