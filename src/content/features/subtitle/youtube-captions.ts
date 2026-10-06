/** Activate YouTube's caption request without changing the user's CC preference. */
export class YouTubeCaptions {
  private readonly buttons = new Map<
    HTMLButtonElement,
    { originallyOn: boolean; retry: ReturnType<typeof setTimeout> }
  >();

  ensure(media: HTMLVideoElement, hasTrack: () => boolean = () => false): void {
    if (media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    const button = media
      .closest(".html5-video-player")
      ?.querySelector<HTMLButtonElement>(".ytp-subtitles-button");
    if (
      !button ||
      button.disabled ||
      button.getAttribute("aria-disabled") === "true" ||
      this.buttons.has(button)
    )
      return;
    const pressed = button.getAttribute("aria-pressed");
    if (pressed !== "true" && pressed !== "false") return;
    // YouTube can initially show CC as enabled without loading its captions.
    // Retry once, also covering captions fetched before the interceptor loaded.
    const retry = setTimeout(() => {
      if (
        !button.isConnected ||
        !media.isConnected ||
        hasTrack() ||
        button.getAttribute("aria-pressed") !== "true"
      )
        return;
      button.click();
      button.click();
    }, 5000);
    this.buttons.set(button, { originallyOn: pressed === "true", retry });
    if (pressed === "false") button.click();
  }

  dispose(): void {
    for (const [button, { originallyOn, retry }] of this.buttons) {
      clearTimeout(retry);
      if (
        !originallyOn &&
        button.isConnected &&
        button.getAttribute("aria-pressed") === "true"
      )
        button.click();
    }
    this.buttons.clear();
  }
}
