import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const messageListeners = new Set<(message: unknown) => unknown>();
const browserMock = vi.hoisted(() => ({
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    sendMessage: vi.fn(async () => ({})),
    onMessage: {
      addListener: vi.fn((listener: (message: unknown) => unknown) =>
        messageListeners.add(listener),
      ),
      removeListener: vi.fn((listener: (message: unknown) => unknown) =>
        messageListeners.delete(listener),
      ),
    },
  },
}));
vi.mock("webextension-polyfill", () => ({ default: browserMock }));

import type { FeatureContext } from "../../src/content/features/context";
import {
  initSubtitles,
  TOGGLE_SUBTITLE_PRETRANSLATION_MESSAGE,
} from "../../src/content/features/subtitle";

beforeEach(() => {
  vi.stubGlobal("location", new URL("https://www.youtube.com/watch?v=test"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  messageListeners.clear();
  browserMock.runtime.sendMessage.mockClear();
  document.body.replaceChildren();
  browserMock.runtime.sendMessage.mockReset().mockResolvedValue({});
});

function player(enabled = true, blocked = false) {
  document.body.innerHTML =
    '<div class="html5-video-player"><video><track kind="subtitles"></video><div class="ytp-right-controls"></div></div>';
  const video = document.querySelector("video")!;
  const native = {
    mode: "showing",
    cues: {
      0: { id: "one", startTime: 0, endTime: 5, text: "Hello." },
      length: 1,
    },
  };
  Object.defineProperty(video, "textTracks", {
    value: { 0: native, length: 1 },
  });
  Object.defineProperty(document.querySelector("track"), "track", {
    value: native,
  });
  const ctx = {
    config: {
      subtitle: { enabled, youtube: true },
      neverTranslateSites: blocked ? [location.hostname] : [],
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
    },
    translateText: vi.fn(async () => "你好。"),
  } as unknown as FeatureContext;
  return { video, native, ctx };
}
const button = () =>
  document
    .querySelector('[data-imt="subtitle-toggle"]')!
    .shadowRoot!.querySelector("button")!;

describe("subtitle feature initialization", () => {
  it("can hide X controls while continuing caption translation", async () => {
    vi.stubGlobal(
      "location",
      new URL("https://x.com/example/status/visibility"),
    );
    const { ctx } = player();
    Object.assign(ctx.config.subtitle, {
      enabledSites: ["x.com"],
      showXVideoToggle: false,
    });
    const dispose = initSubtitles(ctx);
    try {
      expect(document.querySelector('[data-imt="subtitle-toggle"]')).toBeNull();
      await vi.waitFor(() => expect(ctx.translateText).toHaveBeenCalled());
      expect(
        document.querySelector('[data-imt="subtitle-overlay"]'),
      ).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("can show the X switch while translation remains off", () => {
    vi.stubGlobal(
      "location",
      new URL("https://x.com/example/status/visibility-off"),
    );
    const { ctx, native } = player();
    Object.assign(ctx.config.subtitle, { showXVideoToggle: true });
    const dispose = initSubtitles(ctx);
    try {
      expect(button().getAttribute("aria-checked")).toBe("false");
      expect(ctx.translateText).not.toHaveBeenCalled();
      expect(native.mode).toBe("showing");
    } finally {
      dispose();
    }
  });

  it("does not create controls or translate captions outside YouTube by default", () => {
    vi.stubGlobal("location", new URL("https://x.com/example/status/1"));
    const { ctx, native } = player();
    const dispose = initSubtitles(ctx);
    try {
      expect(document.querySelector('[data-imt="subtitle-toggle"]')).toBeNull();
      expect(ctx.translateText).not.toHaveBeenCalled();
      expect(native.mode).toBe("showing");
    } finally {
      dispose();
    }
  });

  it("persists an explicit site opt-in without disabling YouTube when turned off", async () => {
    vi.stubGlobal("location", new URL("https://x.com/example/status/2"));
    const { ctx } = player();
    const dispose = initSubtitles(ctx);
    const send = async (type: string) => {
      for (const listener of messageListeners) {
        const result = listener({ type });
        if (result) return await result;
      }
    };
    try {
      expect(await send("getVideoSubtitleState")).toEqual({ enabled: false });
      expect(await send("toggleVideoSubtitles")).toEqual({ enabled: true });
      expect(browserMock.runtime.sendMessage).toHaveBeenLastCalledWith({
        type: "setConfig",
        patch: {
          subtitle: expect.objectContaining({ enabledSites: ["x.com"] }),
        },
      });
      expect(document.querySelector('[data-imt="subtitle-toggle"]')).toBeNull();
      expect(await send("toggleVideoSubtitles")).toEqual({ enabled: false });
      expect(browserMock.runtime.sendMessage).toHaveBeenLastCalledWith({
        type: "setConfig",
        patch: {
          subtitle: expect.objectContaining({
            enabled: true,
            youtube: true,
            enabledSites: [],
          }),
        },
      });
      expect(document.querySelector('[data-imt="subtitle-toggle"]')).toBeNull();
    } finally {
      dispose();
    }
  });

  it("offers an off switch without translating or hiding native captions, then restores cached tracks", async () => {
    const { native, ctx } = player(false);
    const dispose = initSubtitles(ctx);
    expect(button().getAttribute("aria-checked")).toBe("false");
    expect(ctx.translateText).not.toHaveBeenCalled();
    expect(native.mode).toBe("showing");
    button().click();
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-imt="subtitle-overlay"]'),
      ).not.toBeNull(),
    );
    expect(native.mode).toBe("hidden");
    expect(button().getAttribute("aria-checked")).toBe("true");
    button().click();
    expect(document.querySelector('[data-imt="subtitle-overlay"]')).toBeNull();
    expect(native.mode).toBe("showing");
    await vi.waitFor(() => expect(button().disabled).toBe(false));
    button().click();
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-imt="subtitle-overlay"]'),
      ).not.toBeNull(),
    );
    dispose();
    expect(native.mode).toBe("showing");
    expect(document.querySelector('[data-imt="subtitle-toggle"]')).toBeNull();
  });

  it("rolls back the switch and captions if saving fails", async () => {
    const { native, ctx } = player();
    const dispose = initSubtitles(ctx);
    browserMock.runtime.sendMessage.mockRejectedValueOnce(
      new Error("disk unavailable"),
    );
    button().click();
    expect(native.mode).toBe("showing");
    await vi.waitFor(() =>
      expect(button().getAttribute("aria-checked")).toBe("true"),
    );
    expect(button().title).toMatch(/失败|Could not/);
    expect(native.mode).toBe("hidden");
    dispose();
  });

  it("keeps never-translate sites off until the user explicitly enables video subtitles", async () => {
    const { ctx } = player(true, true);
    const dispose = initSubtitles(ctx);
    expect(button().getAttribute("aria-checked")).toBe("false");
    expect(ctx.translateText).not.toHaveBeenCalled();
    button().click();
    await vi.waitFor(() =>
      expect(button().getAttribute("aria-checked")).toBe("true"),
    );
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({
      type: "setConfig",
      patch: { subtitle: expect.objectContaining({ enabled: true }) },
    });
    dispose();
  });

  it("adds controls to dynamic players and removes detached players", async () => {
    const { ctx, video } = player(false);
    const dispose = initSubtitles(ctx);
    video.parentElement!.remove();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-imt="subtitle-toggle"]')).toBeNull(),
    );
    document.body.append(document.createElement("video"));
    await vi.waitFor(() =>
      expect(
        document.querySelectorAll('[data-imt="subtitle-toggle"]'),
      ).toHaveLength(1),
    );
    dispose();
  });

  it("handles the pre-translation toggle message and persists it", () => {
    const dispose = initSubtitles({
      config: {
        subtitle: { youtube: true },
        sourceLanguage: "en",
        targetLanguage: "zh-CN",
      },
      translateText: vi.fn(),
    } as unknown as FeatureContext);
    for (const listener of messageListeners) {
      listener({ type: TOGGLE_SUBTITLE_PRETRANSLATION_MESSAGE });
    }
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({
      type: "setConfig",
      patch: {
        subtitle: expect.objectContaining({ preTranslation: false }),
      },
    });
    dispose();
  });
});
