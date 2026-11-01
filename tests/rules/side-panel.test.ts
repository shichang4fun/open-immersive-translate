import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(async () => ({})) }));
vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      getURL: (path: string) => `safari-web-extension://test/${path}`,
    },
    windows: { create: mocks.create },
  },
}));
import { openSidePanel } from "../../src/background/side-panel";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("side panel compatibility", () => {
  it("keeps Chrome's native panel", async () => {
    const open = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", { sidePanel: { open } });
    await openSidePanel(42);
    expect(open).toHaveBeenCalledWith({ tabId: 42 });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("opens the Safari assistant in a standalone window", async () => {
    vi.stubGlobal("chrome", {});
    await openSidePanel(42);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "safari-web-extension://test/src/ui/sidepanel/index.html?tabId=42",
        type: "popup",
      }),
    );
  });
});
