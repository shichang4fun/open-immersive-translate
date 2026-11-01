import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  get: vi.fn(async (key: string): Promise<Record<string, unknown>> => ({
    [key]: storage.values[key],
  })),
  set: vi.fn(async (values: Record<string, unknown>) => {
    Object.assign(storage.values, values);
  }),
  remove: vi.fn(async (key: string) => {
    delete storage.values[key];
  }),
}));
vi.mock("webextension-polyfill", () => ({
  default: { storage: { local: storage } },
}));

import {
  hasProviderConsent,
  providerReceiver,
  requireProviderConsent,
  setProviderConsent,
} from "../../src/shared/provider-consent";
import { DEFAULT_CONFIG } from "../../src/shared/config";
import { TranslationCache } from "../../src/background/cache";
import {
  TranslationScheduler,
  type TranslateParagraphsRequest,
} from "../../src/background/scheduler";
import {
  TranslateError,
  type TranslationService,
} from "../../src/background/services/base";

beforeEach(() => {
  storage.values = {};
  vi.clearAllMocks();
  vi.stubEnv("VITE_SAFARI_PLATFORM", "ios");
});
afterEach(() => vi.unstubAllEnvs());

describe("iOS provider text sharing consent", () => {
  it("requires explicit approval and respects revocation", async () => {
    await expect(requireProviderConsent("google")).rejects.toThrow(
      "Approve text sharing",
    );
    await setProviderConsent("google", undefined, true);
    await expect(requireProviderConsent("google")).resolves.toBeUndefined();
    expect(await hasProviderConsent("chatgpt")).toBe(false);
    await setProviderConsent("google", undefined, false);
    expect(await hasProviderConsent("google")).toBe(false);
  });

  it("requires a new decision for a custom endpoint without storing URL credentials", async () => {
    const config = {
      kind: "custom-http" as const,
      enabled: true,
      baseUrl: "https://name:secret@one.example/api?token=private",
    };
    await setProviderConsent("custom", config, true);
    expect(providerReceiver("custom", config)).toBe("custom · one.example");
    expect(
      await hasProviderConsent("custom", {
        ...config,
        baseUrl: "https://two.example/api",
      }),
    ).toBe(false);
    expect(JSON.stringify(storage.values)).not.toMatch(/secret|private|name/);
  });

  it("describes the actual fixed Google and ChatGPT receivers", () => {
    expect(
      providerReceiver("google", {
        kind: "google",
        enabled: true,
        baseUrl: "https://ignored.example",
      }),
    ).toContain("translate.googleapis.com");
    expect(
      providerReceiver("chatgpt", {
        kind: "chatgpt",
        enabled: true,
        baseUrl: "https://ignored.example",
      }),
    ).toContain("chatgpt.com");
  });

  it("preserves existing desktop behavior without touching storage", async () => {
    vi.stubEnv("VITE_SAFARI_PLATFORM", "macos");
    await expect(requireProviderConsent("google")).resolves.toBeUndefined();
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("never calls translation or fallback until that receiver has consent", async () => {
    const primary = {
      id: "google",
      name: "Google",
      placeholder: { open: "{", close: "}" },
      maxBatchSize: 5,
      maxBatchChars: 1000,
      rateLimit: { rps: 1000, concurrency: 1 },
      translate: vi.fn(async () => {
        throw new TranslateError("network", "offline", { retryable: false });
      }),
    } satisfies TranslationService;
    const fallback = {
      ...primary,
      id: "chatgpt",
      translate: vi.fn(async () => ({ texts: ["译文"] })),
    };
    const scheduler = new TranslationScheduler({
      cache: new TranslationCache({ indexedDB: null }),
      services: [primary, fallback],
      fallbackServices: { google: "chatgpt" },
      configProvider: async () => DEFAULT_CONFIG,
    });
    const request: TranslateParagraphsRequest = {
      tabId: 1,
      items: [{ id: "1", text: "Hello" }],
      from: "en",
      to: "zh-CN",
      serviceId: "google",
      onResult: vi.fn(),
    };
    await expect(scheduler.translateParagraphs(request)).rejects.toThrow(
      "Approve text sharing",
    );
    expect(primary.translate).not.toHaveBeenCalled();
    await setProviderConsent("google", undefined, true);
    await expect(scheduler.translateParagraphs(request)).rejects.toThrow(
      "Approve text sharing",
    );
    expect(primary.translate).toHaveBeenCalled();
    expect(fallback.translate).not.toHaveBeenCalled();
    await setProviderConsent("chatgpt", undefined, true);
    await scheduler.translateParagraphs(request);
    expect(fallback.translate).toHaveBeenCalledTimes(1);
    expect(request.onResult).toHaveBeenCalledWith([{ id: "1", text: "译文" }]);
  });
});
