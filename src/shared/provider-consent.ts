import browser from "webextension-polyfill";
import type { ServiceConfig } from "./types";
import { isIOSBuild } from "./platform";

const RECEIVERS: Record<string, string> = {
  google: "Google · translate.googleapis.com",
  chatgpt: "OpenAI · chatgpt.com",
  openai: "OpenAI · api.openai.com",
  claude: "Anthropic · api.anthropic.com",
  gemini: "Google · generativelanguage.googleapis.com",
  bing: "Microsoft · bing.com",
  deepl: "DeepL · api-free.deepl.com",
  "deepl-pro": "DeepL · api.deepl.com",
};

export function providerReceiver(id: string, config?: ServiceConfig): string {
  // These adapters use fixed endpoints, even if stale settings contain a URL.
  if (config?.kind === "chatgpt") return RECEIVERS.chatgpt!;
  if (config?.kind === "google") return RECEIVERS.google!;
  const endpoint = config?.baseUrl;
  if (typeof endpoint === "string" && endpoint) {
    try {
      return `${id} · ${new URL(endpoint).host}`;
    } catch {
      /* Show provider below. */
    }
  }
  return RECEIVERS[config?.kind ?? id] ?? id;
}

function consentKey(id: string, config?: ServiceConfig): string {
  // A new provider or endpoint requires a new decision. No URL credentials persist.
  return `ios.providerConsent.v1:${providerReceiver(id, config)}`;
}

export async function hasProviderConsent(
  id: string,
  config?: ServiceConfig,
): Promise<boolean> {
  if (!isIOSBuild()) return true;
  const key = consentKey(id, config);
  return (await browser.storage.local.get(key))[key] === true;
}

export async function setProviderConsent(
  id: string,
  config: ServiceConfig | undefined,
  allow: boolean,
): Promise<void> {
  const key = consentKey(id, config);
  if (allow) await browser.storage.local.set({ [key]: true });
  else await browser.storage.local.remove(key);
}

export async function requireProviderConsent(
  id: string,
  config?: ServiceConfig,
): Promise<void> {
  if (!(await hasProviderConsent(id, config))) {
    throw new Error(
      `请先在扩展设置中允许将待翻译文本发送至 ${providerReceiver(id, config)}。Approve text sharing in extension settings before translating.`,
    );
  }
}
