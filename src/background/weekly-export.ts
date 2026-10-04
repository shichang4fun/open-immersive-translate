import browser from "webextension-polyfill";

import { loadConfig, onConfigChange } from "../shared/config";
import {
  formatTranslationHistory,
  type WeeklyExportState,
} from "../shared/translation-history";
import { translationHistoryRecords } from "./translation-history";

export const WEEKLY_EXPORT_ALARM = "imt:weekly-translation-export";
export const WEEKLY_EXPORT_KEY = "weeklyTranslationExportState";
const HOUR = 60 * 60 * 1000;
const WEEK = 7 * 24 * HOUR;

/** Sunday 23:00 in Shanghai, independent of the computer's time zone. */
export function nextWeeklyExport(now: number): number {
  const local = new Date(now + 8 * HOUR);
  const sunday =
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + ((7 - local.getUTCDay()) % 7),
      23,
    ) -
    8 * HOUR;
  return sunday > now ? sunday : sunday + WEEK;
}

export async function getWeeklyExportState(): Promise<
  WeeklyExportState | undefined
> {
  const stored = await browser.storage.local.get(WEEKLY_EXPORT_KEY);
  return stored[WEEKLY_EXPORT_KEY] as WeeklyExportState | undefined;
}

async function saveState(state: WeeklyExportState): Promise<void> {
  await browser.storage.local.set({ [WEEKLY_EXPORT_KEY]: state });
}

/** Wait for disk completion, not merely acceptance of the download request. */
async function downloadFile(
  folder: string,
  name: string,
  text: string,
  mime: string,
): Promise<void> {
  const id = await browser.downloads.download({
    url: `data:${mime};charset=utf-8,${encodeURIComponent(text)}`,
    filename: `${folder}/${name}`,
    saveAs: false,
    conflictAction: "uniquify",
  });
  for (let attempt = 0; attempt < 120; attempt++) {
    const [item] = await browser.downloads.search({ id });
    if (item?.state === "complete") return;
    if (!item || item.state === "interrupted") {
      throw new Error(item?.error ?? "Download disappeared.");
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Download did not complete within 30 seconds.");
}

let inFlight: Promise<WeeklyExportState> | undefined;

/** Manual backups and alarms share one implementation and one snapshot. */
export function runWeeklyExport(): Promise<WeeklyExportState> {
  if (inFlight) return inFlight;
  inFlight = performExport().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

async function performExport(): Promise<WeeklyExportState> {
  const now = Date.now();
  const state = (await getWeeklyExportState()) ?? {
    nextDue: nextWeeklyExport(now),
  };
  state.lastAttemptAt = now;
  await saveState(state);
  try {
    const records = await translationHistoryRecords();
    const jsonl = formatTranslationHistory(records, "jsonl");
    const csv = formatTranslationHistory(records, "csv");
    const date = new Date(now + 8 * HOUR).toISOString().slice(0, 10);
    const folder = `open-immersive-translate/weekly/${date}/${now}`;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(jsonl.text),
    );
    const manifest = {
      exported_at: new Date(now).toISOString(),
      timezone: "Asia/Shanghai",
      records: records.length,
      paired_records: records.filter((record) => record.source_text !== null)
        .length,
      jsonl_sha256: Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
    };
    await downloadFile(
      folder,
      "translations.ndjson",
      jsonl.text,
      "application/x-ndjson",
    );
    await downloadFile(folder, "translations.csv", csv.text, "text/csv");
    // Written last: a manifest indicates the paired files completed successfully.
    await downloadFile(
      folder,
      "manifest.json",
      JSON.stringify(manifest, null, 2) + "\n",
      "application/json",
    );
    const completed: WeeklyExportState = {
      nextDue: nextWeeklyExport(Date.now()),
      lastAttemptAt: now,
      lastCompletedAt: Date.now(),
      folder,
      count: records.length,
    };
    await saveState(completed);
    return completed;
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
    await saveState(state);
    throw error;
  } finally {
    await scheduleWeeklyExport();
  }
}

export async function scheduleWeeklyExport(): Promise<void> {
  if (!(await loadConfig()).weeklyTranslationExport) {
    await browser.alarms.clear(WEEKLY_EXPORT_ALARM);
    return;
  }
  const now = Date.now();
  let state = await getWeeklyExportState();
  if (!state) {
    state = { nextDue: nextWeeklyExport(now) };
    await saveState(state);
  }
  // Failed or interrupted runs retry at most once per hour, including restarts.
  const when = Math.max(
    state.nextDue,
    (state.lastAttemptAt ?? 0) + HOUR,
    now + 1000,
  );
  await browser.alarms.create(WEEKLY_EXPORT_ALARM, { when });
}

async function catchUp(): Promise<void> {
  if (!(await loadConfig()).weeklyTranslationExport) return;
  const state = await getWeeklyExportState();
  if (
    state &&
    state.nextDue <= Date.now() &&
    (!state.lastAttemptAt || state.lastAttemptAt + HOUR <= Date.now())
  ) {
    await runWeeklyExport();
  }
}

export function registerWeeklyExport(): void {
  const refresh = (): void => {
    void scheduleWeeklyExport()
      .then(catchUp)
      .catch((error: unknown) => {
        console.warn("[imt] Weekly translation backup failed", error);
      });
  };
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === WEEKLY_EXPORT_ALARM) refresh();
  });
  browser.runtime.onStartup.addListener(refresh);
  browser.runtime.onInstalled.addListener(refresh);
  onConfigChange((config, previous) => {
    if (config.weeklyTranslationExport !== previous?.weeklyTranslationExport)
      refresh();
  });
  // Recreate the alarm after worker/browser restarts; overdue periods export once.
  refresh();
}
