import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  stored: {} as Record<string, unknown>,
  enabled: true,
  alarm: vi.fn(),
  clear: vi.fn(),
  write: vi.fn(),
  onAlarm: vi.fn(),
  onStartup: vi.fn(),
  onInstalled: vi.fn(),
}));
vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      local: {
        get: async () => mocks.stored,
        set: async (value: Record<string, unknown>) =>
          Object.assign(mocks.stored, value),
      },
    },
    alarms: {
      create: mocks.alarm,
      clear: mocks.clear,
      onAlarm: { addListener: mocks.onAlarm },
    },
    runtime: {
      onStartup: { addListener: mocks.onStartup },
      onInstalled: { addListener: mocks.onInstalled },
    },
  },
}));
vi.mock("../../src/shared/config", () => ({
  loadConfig: async () => ({ weeklyTranslationExport: mocks.enabled }),
  onConfigChange: vi.fn(),
}));
vi.mock("../../src/background/translation-history", () => ({
  translationHistoryRecords: async () => [],
}));

import {
  nextWeeklyExport,
  registerWeeklyExport,
  runWeeklyExport,
  scheduleWeeklyExport,
  WEEKLY_EXPORT_ALARM,
  WEEKLY_EXPORT_KEY,
} from "../../src/background/weekly-export";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
  vi.clearAllMocks();
  mocks.stored = {};
  mocks.enabled = true;
  vi.stubEnv("VITE_LOCAL_ARCHIVE_TOKEN", "test-token-only-for-unit-tests-1234");
  vi.stubGlobal("fetch", mocks.write);
  mocks.write.mockResolvedValue({
    ok: true,
    json: async () => ({ folder: "/archive/test", count: 0 }),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("weekly translation backups", () => {
  it("uses Sunday 23:00 Shanghai with a strict next-week boundary", () => {
    expect(nextWeeklyExport(Date.parse("2026-10-04T14:59:59Z"))).toBe(
      Date.parse("2026-10-04T15:00:00Z"),
    );
    expect(nextWeeklyExport(Date.parse("2026-10-04T15:00:00Z"))).toBe(
      Date.parse("2026-10-11T15:00:00Z"),
    );
    expect(nextWeeklyExport(Date.parse("2026-10-05T00:00:00Z"))).toBe(
      Date.parse("2026-10-11T15:00:00Z"),
    );
  });

  it("persists a due date, restores its alarm, and clears it when disabled", async () => {
    await scheduleWeeklyExport();
    const state = mocks.stored[WEEKLY_EXPORT_KEY];
    await scheduleWeeklyExport();
    expect(mocks.stored[WEEKLY_EXPORT_KEY]).toEqual(state);
    expect(mocks.alarm).toHaveBeenLastCalledWith(WEEKLY_EXPORT_ALARM, {
      when: Date.parse("2026-10-11T15:00:00Z"),
    });
    mocks.enabled = false;
    await scheduleWeeklyExport();
    expect(mocks.clear).toHaveBeenCalledWith(WEEKLY_EXPORT_ALARM);
  });

  it("coalesces overlapping runs and marks completion only after all files finish", async () => {
    const first = runWeeklyExport();
    expect(runWeeklyExport()).toBe(first);
    const state = await first;
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.write.mock.calls[0][1].body)).toEqual({
      records: [],
    });
    expect(state).toMatchObject({
      count: 0,
      lastCompletedAt: Date.now(),
      nextDue: Date.parse("2026-10-11T15:00:00Z"),
    });
    expect(state.lastError).toBeUndefined();
  });

  it("preserves the overdue date on disk failure and retries at most hourly", async () => {
    const nextDue = Date.parse("2026-10-04T15:00:00Z");
    mocks.stored[WEEKLY_EXPORT_KEY] = { nextDue };
    mocks.write.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(runWeeklyExport()).rejects.toThrow("HTTP 500");
    expect(mocks.stored[WEEKLY_EXPORT_KEY]).toMatchObject({
      nextDue,
      lastError: "Local archive writer returned HTTP 500.",
    });
    expect(mocks.stored[WEEKLY_EXPORT_KEY]).not.toHaveProperty(
      "lastCompletedAt",
    );
    expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.alarm).toHaveBeenLastCalledWith(WEEKLY_EXPORT_ALARM, {
      when: Date.now() + 60 * 60 * 1000,
    });
  });

  it("catches up one missed period on restart without repeated exports", async () => {
    mocks.stored[WEEKLY_EXPORT_KEY] = {
      nextDue: Date.parse("2026-09-20T15:00:00Z"),
    };
    registerWeeklyExport();
    await vi.waitFor(() =>
      expect(mocks.stored[WEEKLY_EXPORT_KEY]).toHaveProperty("lastCompletedAt"),
    );
    mocks.onStartup.mock.calls[0][0]();
    await vi.waitFor(() => expect(mocks.alarm).toHaveBeenCalledTimes(3));
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });
});
