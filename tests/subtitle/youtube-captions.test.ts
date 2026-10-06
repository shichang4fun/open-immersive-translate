import { afterEach, describe, expect, it, vi } from "vitest";
import { YouTubeCaptions } from "../../src/content/features/subtitle/youtube-captions";

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

function player(on = false) {
  document.body.innerHTML = `<div class="html5-video-player"><video></video><button class="ytp-subtitles-button" aria-pressed="${on}"></button></div>`;
  const button = document.querySelector("button")!;
  button.onclick = () =>
    button.setAttribute(
      "aria-pressed",
      String(button.getAttribute("aria-pressed") !== "true"),
    );
  const video = document.querySelector("video")!;
  Object.defineProperty(video, "readyState", { configurable: true, value: 2 });
  return { button, video };
}

describe("YouTube caption activation", () => {
  it("retries a stalled caption activation once and cancels retry after capture", () => {
    vi.useFakeTimers();
    const { video, button } = player();
    const click = vi.spyOn(button, "click");
    const captions = new YouTubeCaptions();
    captions.ensure(video, () => false);
    vi.advanceTimersByTime(5000);
    expect(click).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(10000);
    expect(click).toHaveBeenCalledTimes(3);
    captions.dispose();
    click.mockClear();
    captions.ensure(video, () => true);
    vi.advanceTimersByTime(5000);
    expect(click).toHaveBeenCalledTimes(1);
    captions.dispose();
  });
  it("waits for a playable video before activating its caption control", () => {
    const { button, video } = player();
    Object.defineProperty(video, "readyState", {
      configurable: true,
      value: 0,
    });
    const captions = new YouTubeCaptions();
    captions.ensure(video);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    Object.defineProperty(video, "readyState", { value: 2 });
    captions.ensure(video);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    captions.dispose();
  });
  it("enables CC to trigger caption loading and restores it when disabled", () => {
    const { button, video } = player();
    const captions = new YouTubeCaptions();
    captions.ensure(video);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    captions.dispose();
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("preserves CC that was already enabled and respects manual changes", () => {
    const { button, video } = player(true);
    const captions = new YouTubeCaptions();
    captions.ensure(video);
    captions.dispose();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    const second = new YouTubeCaptions();
    button.click();
    second.ensure(video);
    button.click();
    second.ensure(video);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    second.dispose();
  });
});
