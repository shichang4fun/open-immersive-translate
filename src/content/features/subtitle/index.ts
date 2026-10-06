import browser from "webextension-polyfill";

import {
  DEFAULT_SUBTITLE_CONFIG,
  type SubtitleConfig,
  type SubtitleCue,
} from "../../../shared/subtitle-types";
import type { FeatureContext } from "../context";
import {
  matchingSubtitleAdapters,
  SubtitleCaptureHub,
  type SubtitleCueTrack,
} from "./adapters";
import { installCaptureBridge } from "./capture-bridge";
import { SubtitleEngine } from "./engine";
import { subtitleText } from "./i18n";
import { SubtitleRenderer } from "./renderer";
import { SubtitleToggle } from "./player-toggle";
import { YouTubeCaptions } from "./youtube-captions";
import { siteMatches } from "../../controller/patterns";

export const TOGGLE_SUBTITLE_PRETRANSLATION_MESSAGE =
  "toggleVideoSubtitlePreTranslation";

interface SubtitleSession {
  engine: SubtitleEngine;
  renderer: SubtitleRenderer;
  fingerprint: string;
  dispose(): void;
}

// Config updates remount features. Keep captured tracks for the same video so
// switching back on does not depend on the player fetching its captions again.
const capturedTracks = new WeakMap<
  HTMLMediaElement,
  { key: string; track: SubtitleCueTrack }
>();
let siteOverride: { key: string; enabled: boolean } | undefined;
function mediaKey(media: HTMLMediaElement): string {
  return `${location.href}\u0000${media.currentSrc || media.getAttribute("src") || ""}`;
}

function resolveConfig(ctx: FeatureContext): SubtitleConfig {
  const raw = ctx.config.subtitle as FeatureContext["config"]["subtitle"] &
    Partial<SubtitleConfig>;
  return { ...DEFAULT_SUBTITLE_CONFIG, ...raw };
}

function cueFingerprint(cues: readonly SubtitleCue[]): string {
  return cues
    .map((cue) => `${cue.start}|${cue.end}|${cue.text}`)
    .join("\u0000");
}

async function persistConfig(config: SubtitleConfig): Promise<void> {
  await browser.runtime.sendMessage({
    type: "setConfig",
    patch: { subtitle: config },
  });
}

/** Initialize network and TextTrack subtitle adapters for the current page. */
export function initSubtitles(ctx: FeatureContext): () => void {
  let config = resolveConfig(ctx);
  const isYouTube = /(^|\.)youtube\.com$|(^|\.)youtubekids\.com$/.test(
    window.location.hostname,
  );
  const blockedSites = ctx.config.neverTranslateSites ?? [];
  const blocked = blockedSites.some((site) =>
    siteMatches(location.hostname, site),
  );
  const overrideKey = `${location.href}\u0000${JSON.stringify(blockedSites)}`;
  const enabled = (): boolean =>
    config.enabled &&
    (!isYouTube || config.youtube) &&
    (!blocked || (siteOverride?.key === overrideKey && siteOverride.enabled));

  const adapters = matchingSubtitleAdapters(window.location.href);
  const captureHub = new SubtitleCaptureHub();
  const sessions = new Map<HTMLMediaElement, SubtitleSession>();
  const controls = new Map<HTMLVideoElement, SubtitleToggle>();
  const unsubscribers: Array<() => void> = [];
  let disposed = false;
  let saving = false;
  let bridgeReady = false;
  const youtubeCaptions = new YouTubeCaptions();

  const stopSessions = (): void => {
    for (const session of sessions.values()) session.dispose();
    sessions.clear();
    youtubeCaptions.dispose();
  };

  const toggle = async (): Promise<void> => {
    if (saving || disposed) return;
    saving = true;
    const previous = config;
    const previousOverride = siteOverride;
    const turnOn = !enabled();
    if (blocked) siteOverride = { key: overrideKey, enabled: turnOn };
    config = {
      ...config,
      enabled: turnOn,
      youtube: isYouTube && turnOn ? true : config.youtube,
    };
    if (!turnOn) stopSessions();
    for (const control of controls.values()) control.setState(enabled(), true);
    let failed = false;
    try {
      await persistConfig(config);
    } catch {
      config = previous;
      siteOverride = previousOverride;
      failed = true;
    }
    if (disposed) return;
    saving = false;
    for (const control of controls.values())
      control.setState(enabled(), false, failed);
    if (enabled()) replayTracks();
    scanPlayers();
  };

  const acceptTrack = (track: SubtitleCueTrack): void => {
    const media =
      track.media ??
      document.querySelector<HTMLMediaElement>("video, audio") ??
      undefined;
    if (disposed || !media || !track.cues.length) return;
    capturedTracks.set(media, {
      key: mediaKey(media),
      track: { ...track, media },
    });
    if (!enabled() || saving) return;
    const fingerprint = cueFingerprint(track.cues);
    const existing = sessions.get(media);
    if (existing?.fingerprint === fingerprint) return;
    existing?.dispose();

    const engine = new SubtitleEngine(ctx, {
      preTranslation: config.preTranslation,
    });
    const renderer = new SubtitleRenderer(media, config, {
      experimental: track.experimental,
      experimentalLabel: subtitleText("experimental"),
      onStyleChange: (style) => {
        config = style;
        for (const session of sessions.values()) {
          if (session.renderer !== renderer)
            session.renderer.updateStyle(style);
        }
        void persistConfig(config).catch(() => undefined);
      },
    });
    const unsubscribe = engine.subscribe((cues) => renderer.setCues(cues));
    const updateRollingWindow = (): void => {
      void engine.updateCurrentTime(media.currentTime).catch(() => undefined);
    };
    media.addEventListener("timeupdate", updateRollingWindow);
    media.addEventListener("seeking", updateRollingWindow);

    const session: SubtitleSession = {
      engine,
      renderer,
      fingerprint,
      dispose: () => {
        unsubscribe();
        engine.dispose();
        media.removeEventListener("timeupdate", updateRollingWindow);
        media.removeEventListener("seeking", updateRollingWindow);
        renderer.dispose();
      },
    };
    sessions.set(media, session);
    void engine
      .load(track.cues, media.currentTime)
      .then(updateRollingWindow)
      .catch(() => undefined);
  };

  const replayTracks = (): void => {
    for (const media of document.querySelectorAll<HTMLMediaElement>(
      "video, audio",
    )) {
      const captured = capturedTracks.get(media);
      if (captured?.key === mediaKey(media)) acceptTrack(captured.track);
    }
  };

  const scanPlayers = (): void => {
    if (disposed) return;
    for (const [media, control] of controls) {
      if (!media.isConnected) {
        control.dispose();
        controls.delete(media);
      }
    }
    for (const [media, session] of sessions) {
      if (
        !media.isConnected ||
        capturedTracks.get(media)?.key !== mediaKey(media)
      ) {
        session.dispose();
        sessions.delete(media);
      }
    }
    for (const media of document.querySelectorAll("video")) {
      let control = controls.get(media);
      if (!control) {
        control = new SubtitleToggle(media, () => {
          void toggle();
        });
        control.setState(enabled(), saving);
        controls.set(media, control);
      }
      control.updatePlacement();
      if (isYouTube && bridgeReady && enabled() && !saving)
        youtubeCaptions.ensure(media, () => sessions.has(media));
    }
  };

  for (const adapter of adapters) {
    const source = adapter.hook({ document, captures: captureHub });
    unsubscribers.push(source.subscribe(acceptTrack));
  }
  const capturePatterns = adapters.flatMap(
    (adapter) => adapter.capturePatterns,
  );
  const disposeBridge = installCaptureBridge(
    capturePatterns,
    (capture) => captureHub.emit(capture),
    () => {
      bridgeReady = true;
      scanPlayers();
    },
  );
  const observer = new MutationObserver(scanPlayers);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  document.addEventListener("loadedmetadata", scanPlayers, true);
  document.addEventListener("loadeddata", scanPlayers, true);
  scanPlayers();
  replayTracks();

  const onMessage = (
    message: unknown,
  ): undefined | Promise<{ enabled: boolean }> => {
    if (typeof message === "object" && message !== null && "type" in message) {
      if (message.type === "getVideoSubtitleState")
        return Promise.resolve({ enabled: enabled() });
      if (message.type === "toggleVideoSubtitles")
        return toggle().then(() => ({ enabled: enabled() }));
    }
    if (
      typeof message !== "object" ||
      message === null ||
      !("type" in message) ||
      message.type !== TOGGLE_SUBTITLE_PRETRANSLATION_MESSAGE
    ) {
      return undefined;
    }
    config = { ...config, preTranslation: !config.preTranslation };
    void persistConfig(config).catch(() => undefined);
    for (const session of sessions.values()) {
      void session.engine
        .setPreTranslation(config.preTranslation)
        .catch(() => undefined);
    }
    return undefined;
  };
  const onControllerToggle = (): void => {
    config = { ...config, preTranslation: !config.preTranslation };
    void persistConfig(config).catch(() => undefined);
    for (const session of sessions.values()) {
      void session.engine
        .setPreTranslation(config.preTranslation)
        .catch(() => undefined);
    }
  };
  browser.runtime.onMessage.addListener(onMessage);
  document.addEventListener(
    "imt:video-subtitle-pretranslation",
    onControllerToggle,
  );

  return () => {
    disposed = true;
    observer.disconnect();
    document.removeEventListener("loadedmetadata", scanPlayers, true);
    document.removeEventListener("loadeddata", scanPlayers, true);
    browser.runtime.onMessage.removeListener(onMessage);
    document.removeEventListener(
      "imt:video-subtitle-pretranslation",
      onControllerToggle,
    );
    disposeBridge();
    stopSessions();
    for (const unsubscribe of unsubscribers) unsubscribe();
    for (const control of controls.values()) control.dispose();
    controls.clear();
  };
}

export const init = initSubtitles;
