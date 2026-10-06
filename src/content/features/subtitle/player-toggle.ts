import { subtitleText } from "./i18n";

/** A player-local control for the extension's persisted subtitle setting. */
export class SubtitleToggle {
  readonly host = document.createElement("div");
  private readonly button = document.createElement("button");
  private readonly resizeObserver?: ResizeObserver;

  constructor(
    private readonly media: HTMLVideoElement,
    onToggle: () => void,
  ) {
    this.host.dataset.imt = "subtitle-toggle";
    const root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host{all:initial;display:inline-flex;vertical-align:middle;pointer-events:auto;align-items:center}:host([hidden]){display:none}
      button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:0 10px;border:1px solid #ffffff30;border-radius:18px;background:rgba(28,28,32,.85);color:#fff;cursor:pointer;font:500 14px/1.3 system-ui,sans-serif;white-space:nowrap}
      button:hover{background:rgba(55,55,62,.95)}button:focus-visible{outline:2px solid #adceff;outline-offset:2px}button:disabled{opacity:.65;cursor:wait}
      .brand{font-size:12px;border:1px solid #ffffff70;border-radius:4px;padding:1px 3px}
      .track{display:inline-flex;align-items:center;width:29px;height:18px;border-radius:12px;background:#62656c;padding:2px;box-sizing:border-box}
      .thumb{width:14px;height:14px;border-radius:50%;background:white;box-shadow:0 1px 3px #0006;transition:transform .12s}
      [aria-checked=true] .track{background:#268b6c}[aria-checked=true] .thumb{transform:translateX(11px)}
      @media(prefers-reduced-motion:reduce){.thumb{transition:none}}
    `;
    this.button.type = "button";
    this.button.setAttribute("role", "switch");
    this.button.setAttribute("aria-label", subtitleText("toggleLabel"));
    this.button.innerHTML =
      '<span class="brand" aria-hidden="true">译</span><span class="label"></span><span class="track" aria-hidden="true"><span class="thumb"></span></span>';
    this.button.querySelector(".label")!.textContent =
      subtitleText("bilingual");
    this.button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onToggle();
    });
    this.button.addEventListener("keydown", (event) => event.stopPropagation());
    root.append(style, this.button);
    this.updatePlacement();
    window.addEventListener("resize", this.updatePlacement);
    window.addEventListener("scroll", this.updatePlacement, true);
    document.addEventListener("fullscreenchange", this.updatePlacement);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(this.updatePlacement);
      this.resizeObserver.observe(media);
    }
  }

  setState(enabled: boolean, busy = false, error = false): void {
    this.button.setAttribute("aria-checked", String(enabled));
    this.button.disabled = busy;
    this.button.title = error
      ? subtitleText("saveFailed")
      : subtitleText(enabled ? "turnOff" : "turnOn");
  }

  readonly updatePlacement = (): void => {
    const controls = this.media
      .closest(".html5-video-player")
      ?.querySelector(".ytp-right-controls");
    if (controls) {
      this.host.hidden = false;
      if (this.host.parentElement !== controls) controls.prepend(this.host);
      this.host.style.cssText = "position:relative;height:100%;margin:0 6px;";
      return;
    }
    const fullscreen = document.fullscreenElement;
    const container =
      fullscreen && fullscreen !== this.media && fullscreen.contains(this.media)
        ? fullscreen
        : document.documentElement;
    if (this.host.parentElement !== container) container.append(this.host);
    const rect = this.media.getBoundingClientRect();
    this.host.style.cssText = `position:fixed;z-index:2147483647;left:${Math.max(8, rect.right - 130)}px;top:${Math.max(8, rect.bottom - 52)}px;`;
    this.host.hidden =
      rect.width < 160 ||
      rect.height < 90 ||
      rect.bottom <= 0 ||
      rect.top >= window.innerHeight;
  };

  dispose(): void {
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.updatePlacement);
    window.removeEventListener("scroll", this.updatePlacement, true);
    document.removeEventListener("fullscreenchange", this.updatePlacement);
    this.host.remove();
  }
}
