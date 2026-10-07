import { afterEach, describe, expect, it, vi } from "vitest";
import { SubtitleToggle } from "../../src/content/features/subtitle/player-toggle";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("subtitle switch placement", () => {
  it("hides behind an X-style image modal and returns when the modal closes", () => {
    document.body.innerHTML =
      '<div data-testid="videoPlayer"><video></video></div><div role="dialog"><img></div>';
    const video = document.querySelector("video")!;
    const photo = document.querySelector("img")!;
    vi.spyOn(video, "getBoundingClientRect").mockReturnValue(
      new DOMRect(10, 10, 600, 350),
    );
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => [photo, video]),
    });
    const toggle = new SubtitleToggle(video, () => undefined);
    try {
      expect(toggle.host.hidden).toBe(true);
      vi.mocked(document.elementsFromPoint).mockReturnValue([video]);
      toggle.updatePlacement();
      expect(toggle.host.hidden).toBe(false);
    } finally {
      toggle.dispose();
    }
  });

  it("hides videos outside the horizontal viewport or made invisible by CSS", () => {
    const video = document.createElement("video");
    document.body.append(video);
    const bounds = vi
      .spyOn(video, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(-800, 10, 600, 350));
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => [video]),
    });
    const toggle = new SubtitleToggle(video, () => undefined);
    try {
      expect(toggle.host.hidden).toBe(true);
      bounds.mockReturnValue(new DOMRect(10, 10, 600, 350));
      video.style.visibility = "hidden";
      toggle.updatePlacement();
      expect(toggle.host.hidden).toBe(true);
      video.style.visibility = "visible";
      toggle.updatePlacement();
      expect(toggle.host.hidden).toBe(false);
    } finally {
      toggle.dispose();
    }
  });
});
