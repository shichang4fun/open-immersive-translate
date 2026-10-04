import browser from "webextension-polyfill";

import { loadConfig, onConfigChange } from "../shared/config";
import type { WeeklyExportState } from "../shared/translation-history";
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
    const token = import.meta.env.VITE_LOCAL_ARCHIVE_TOKEN as
      string | undefined;
    if (!token) throw new Error("Local archive writer is not configured.");
    const response = await fetch("http://127.0.0.1:24198/archive", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ records }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`Local archive writer returned HTTP ${response.status}.`);
    const result = (await response.json()) as { folder: string; count: number };
    if (typeof result.folder !== "string" || result.count !== records.length) {
      throw new Error(
        "Local archive writer did not confirm the complete snapshot.",
      );
    }
    const completed: WeeklyExportState = {
      nextDue: nextWeeklyExport(Date.now()),
      lastAttemptAt: now,
      lastCompletedAt: Date.now(),
      folder: result.folder,
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
