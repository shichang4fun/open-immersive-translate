import browser from "webextension-polyfill";
import { isIOSBuild } from "../shared/platform";

interface NativeSidePanelApi {
  open(options: { tabId: number }): Promise<void>;
  setPanelBehavior(options: { openPanelOnActionClick: boolean }): Promise<void>;
}

export function sidePanelApi(): NativeSidePanelApi | undefined {
  return (
    globalThis as unknown as {
      chrome?: { sidePanel?: NativeSidePanelApi };
    }
  ).chrome?.sidePanel;
}

/** Safari has no Chrome side panel; keep the assistant available in a window. */
export async function openSidePanel(tabId: number): Promise<void> {
  const native = sidePanelApi();
  if (native) {
    await native.open({ tabId });
    return;
  }
  const url = `${browser.runtime.getURL("src/ui/sidepanel/index.html")}?tabId=${tabId}`;
  if (isIOSBuild()) {
    await browser.tabs.create({ url });
    return;
  }
  await browser.windows.create({
    url,
    type: "popup",
    width: 440,
    height: 720,
  });
}
