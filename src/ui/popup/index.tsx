import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import browser from "webextension-polyfill";

import { LANGUAGE_CODES } from "../../shared/lang";
import { sendToBackground, sendToTab } from "../../shared/messages";
import type { LangCode, TranslationMode } from "../../shared/types";
import { Button, Field, Select, Toggle } from "../shared/components";
import {
  languageName,
  serviceName,
  setUiLocaleOverride,
  t,
} from "../shared/i18n";
import { useKConfig } from "../shared/k-config";
import { clearCache, getCacheCount } from "../shared/runtime";
import "../shared/styles.css";
import "./popup.css";

interface ActiveTab {
  id?: number;
  hostname?: string;
}

export function Popup(): preact.JSX.Element {
  const { config, error, updateConfig } = useKConfig();
  const [activeTab, setActiveTab] = useState<ActiveTab>({});
  const [translated, setTranslated] = useState(false);
  const [toggleError, setToggleError] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuStatus, setMenuStatus] = useState<string>();
  const [chatgptLoggedIn, setChatgptLoggedIn] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState<boolean>();
  const [videoBusy, setVideoBusy] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getActiveTab()
      .then(async (tab) => {
        setActiveTab(tab);
        if (tab.id === undefined || !tab.hostname) return;
        const state = (await browser.tabs
          .sendMessage(tab.id, { type: "getPageState" })
          .catch(() => undefined)) as { translated?: boolean } | undefined;
        setTranslated(state?.translated === true);
        if (/(^|\.)youtube\.com$|(^|\.)youtubekids\.com$/.test(tab.hostname)) {
          const video = (await browser.tabs
            .sendMessage(tab.id, { type: "getVideoSubtitleState" })
            .catch(() => undefined)) as { enabled?: boolean } | undefined;
          if (typeof video?.enabled === "boolean")
            setVideoEnabled(video.enabled);
        }
      })
      .catch(console.error);
    void sendToBackground({ type: "chatgptOauth.status" })
      .then((status) => setChatgptLoggedIn(status.state === "authenticated"))
      .catch(() => setChatgptLoggedIn(false));
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !moreRef.current?.contains(event.target)
      )
        setMoreOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMoreOpen(false);
        moreRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [moreOpen]);

  if (!config) {
    return (
      <main class="popup-shell">
        <p class={error ? "ui-status ui-status-error" : "ui-status"}>
          {error ? t("common.saveFailed") : t("common.loading")}
        </p>
      </main>
    );
  }

  setUiLocaleOverride(config.uiLanguage);
  const languageOptions = LANGUAGE_CODES.filter((code) => code !== "auto").map(
    (code) => ({ value: code, label: languageName(code) }),
  );

  const hostname = activeTab.hostname;
  const always = hostname
    ? config.alwaysTranslateSites.includes(hostname)
    : false;
  const never = hostname
    ? config.neverTranslateSites.includes(hostname)
    : false;
  const services = Object.keys(config.services)
    .filter(
      (id) => id !== "chatgpt" || chatgptLoggedIn || config.service === id,
    )
    .map((id) => ({
      value: id,
      label: serviceName(id),
    }));

  const togglePage = async (): Promise<void> => {
    if (activeTab.id === undefined) {
      setToggleError(true);
      return;
    }
    try {
      await sendToTab(activeTab.id, {
        type: "toggleTranslate",
        tabId: activeTab.id,
      });
      setTranslated((value) => !value);
      setToggleError(false);
    } catch {
      setToggleError(true);
    }
  };

  const setSiteRule = (kind: "always" | "never", checked: boolean): void => {
    if (!hostname) return;
    void updateConfig((current) => {
      const withoutHost = (sites: string[]) =>
        sites.filter((site) => site !== hostname);
      return kind === "always"
        ? {
            alwaysTranslateSites: checked
              ? [...withoutHost(current.alwaysTranslateSites), hostname]
              : withoutHost(current.alwaysTranslateSites),
            neverTranslateSites: withoutHost(current.neverTranslateSites),
          }
        : {
            neverTranslateSites: checked
              ? [...withoutHost(current.neverTranslateSites), hostname]
              : withoutHost(current.neverTranslateSites),
            alwaysTranslateSites: withoutHost(current.alwaysTranslateSites),
          };
    }).catch(console.error);
  };

  return (
    <main class="popup-shell">
      <header class="popup-header">
        <span class="popup-brand" aria-hidden="true">
          译
        </span>
        <div class="popup-heading">
          <h1>{t("app.name")}</h1>
          {hostname && <p title={hostname}>{hostname}</p>}
        </div>
        <button
          class="popup-settings"
          type="button"
          aria-label={t("popup.settings")}
          title={t("popup.settings")}
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M4 7h16M4 17h16" />
            <circle cx="9" cy="7" r="3" fill="var(--ui-panel)" />
            <circle cx="15" cy="17" r="3" fill="var(--ui-panel)" />
          </svg>
        </button>
      </header>

      <Button
        variant="primary"
        class="popup-toggle-button"
        onClick={() => void togglePage()}
      >
        {translated ? t("popup.showOriginal") : t("popup.translate")}
      </Button>
      {toggleError && (
        <p role="alert" class="ui-status ui-status-error">
          {t("popup.toggleFailed")}
        </p>
      )}

      {videoEnabled !== undefined && (
        <section class="popup-video">
          <Toggle
            checked={videoEnabled}
            disabled={videoBusy}
            label={t("popup.videoSubtitles")}
            onChange={(checked) => {
              if (activeTab.id === undefined || videoBusy) return;
              setVideoBusy(true);
              setVideoEnabled(checked);
              void browser.tabs
                .sendMessage(activeTab.id, { type: "toggleVideoSubtitles" })
                .then((response) => {
                  const state = response as { enabled?: boolean } | undefined;
                  if (typeof state?.enabled !== "boolean")
                    throw new Error("Subtitle control unavailable");
                  setVideoEnabled(state.enabled);
                  setToggleError(false);
                })
                .catch(() => {
                  setVideoEnabled(videoEnabled);
                  setToggleError(true);
                })
                .finally(() => setVideoBusy(false));
            }}
          />
          <p>{t("popup.videoHint")}</p>
        </section>
      )}

      <div class="popup-fields">
        <Field label={t("popup.service")} htmlFor="popup-service">
          <Select
            id="popup-service"
            value={config.service}
            options={services}
            onChange={(service) => {
              void updateConfig({ service }).catch(console.error);
            }}
          />
        </Field>
        <Field label={t("popup.targetLanguage")} htmlFor="popup-target">
          <Select
            id="popup-target"
            value={config.targetLanguage}
            options={languageOptions}
            onChange={(targetLanguage) => {
              void updateConfig({
                targetLanguage: targetLanguage as LangCode,
              }).catch(console.error);
            }}
          />
        </Field>
      </div>

      <section class="popup-section">
        <h2>{t("popup.mode")}</h2>
        <div class="segmented" role="group" aria-label={t("popup.mode")}>
          {(["dual", "translation"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={config.translationMode === mode}
              onClick={() => {
                void updateConfig({
                  translationMode: mode as TranslationMode,
                }).catch(console.error);
              }}
            >
              {t(mode === "dual" ? "mode.dual" : "mode.translation")}
            </button>
          ))}
        </div>
      </section>

      <section class="popup-section popup-site">
        <h2>{t("popup.currentSite")}</h2>
        {hostname ? (
          <>
            <Toggle
              checked={always}
              label={t("popup.alwaysTranslate")}
              onChange={(checked) => setSiteRule("always", checked)}
            />
            <Toggle
              checked={never}
              label={t("popup.neverTranslate")}
              onChange={(checked) => setSiteRule("never", checked)}
            />
          </>
        ) : (
          <p class="ui-status">{t("popup.noSite")}</p>
        )}
      </section>

      {error && (
        <p role="alert" class="ui-status ui-status-error">
          {t("common.saveFailed")}
        </p>
      )}

      <footer class="popup-footer">
        <div class="popup-more" ref={moreRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            {t("popup.more")}
          </button>
          {moreOpen && (
            <div class="popup-more-menu" role="menu">
              <MenuButton
                label={t("popup.settings")}
                onClick={() => void browser.runtime.openOptionsPage()}
              />
              <MenuButton
                label={t("popup.shortcuts")}
                onClick={() =>
                  void browser.tabs.create({
                    url: "chrome://extensions/shortcuts",
                  })
                }
              />
              <MenuButton
                label={t("popup.clearCache")}
                onClick={() => {
                  void getCacheCount()
                    .then(async (count) => {
                      if (count === undefined) {
                        setMenuStatus(t("data.cacheClearFailed"));
                        return;
                      }
                      if (
                        !window.confirm(t("popup.clearCacheConfirm", { count }))
                      ) {
                        return;
                      }
                      const cleared = await clearCache();
                      setMenuStatus(
                        cleared === undefined
                          ? t("data.cacheClearFailed")
                          : t("popup.cacheCleared", { count: cleared }),
                      );
                    })
                    .catch(() => setMenuStatus(t("data.cacheClearFailed")));
                }}
              />
              <MenuButton
                label={t("popup.feedback")}
                onClick={() =>
                  void browser.tabs.create({
                    url: "https://github.com/ymcwiki/open-immersive-translate/issues",
                  })
                }
              />
              <MenuButton
                label={t("popup.openSidePanel")}
                onClick={() => void openSidePanel(activeTab.id)}
              />
              <MenuButton
                label={t("popup.translatePdf")}
                onClick={() => void openExtensionPage("src/pdf/index.html")}
              />
              <MenuButton
                label={t("popup.translateSubtitle")}
                onClick={() =>
                  void openExtensionPage("src/subtitle-file/index.html")
                }
              />
              <MenuButton
                label={t("popup.configTransfer")}
                onClick={() => void openExtensionPage("options.html#data")}
              />
            </div>
          )}
        </div>
        <span>
          {t("popup.shortcut", {
            shortcut:
              config.shortcuts.toggleTranslatePage || t("shortcuts.unknown"),
          })}
        </span>
      </footer>
      {menuStatus && (
        <p role="status" class="ui-status">
          {menuStatus}
        </p>
      )}
    </main>
  );
}

function MenuButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}): preact.JSX.Element {
  return (
    <button type="button" role="menuitem" onClick={onClick}>
      {label}
    </button>
  );
}

async function openExtensionPage(path: string): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL(path) });
}

async function openSidePanel(tabId: number | undefined): Promise<void> {
  if (tabId === undefined) return;
  const sidePanel = (
    globalThis as unknown as {
      chrome?: {
        sidePanel?: { open(options: { tabId: number }): Promise<void> };
      };
    }
  ).chrome?.sidePanel;
  if (sidePanel) {
    await sidePanel.open({ tabId });
    return;
  }
  await browser.runtime.sendMessage({ type: "openSidePanel", tabId });
}

async function getActiveTab(): Promise<ActiveTab> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return {};

  let hostname: string | undefined;
  if (tab.url) {
    try {
      const url = new URL(tab.url);
      if (url.protocol === "http:" || url.protocol === "https:") {
        hostname = url.hostname;
      }
    } catch {
      hostname = undefined;
    }
  }
  return { id: tab.id, hostname };
}

const root = document.getElementById("app");
if (root) render(<Popup />, root);
