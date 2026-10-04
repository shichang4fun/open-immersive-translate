import { describe, expect, it, vi, afterEach } from "vitest";

import {
  formatTranslationHistory,
  translationHistoryInputSchema,
  type TranslationHistoryRecord,
} from "../../src/shared/translation-history";
import {
  exportTranslationHistory,
  translationHistory,
} from "../../src/background/translation-history";
import { translationCache } from "../../src/background/cache";

const record: TranslationHistoryRecord = {
  schema_version: 1,
  id: "record-1",
  url: "https://example.com/article",
  title: 'An "article"',
  paragraph_id: "paragraph-1",
  paragraph_index: 0,
  source_text: "Original, text\nwith a new line.",
  translated_text: "原文译文",
  source_language: "en",
  target_language: "zh-CN",
  requested_service: "chatgpt",
  saved_at: "2026-10-05T00:00:00.000Z",
  provenance: "page_translation",
  translated_text_format: "plain",
};

afterEach(() => vi.restoreAllMocks());

describe("translation history exports", () => {
  it("round-trips exact original and translated text through JSONL", () => {
    const file = formatTranslationHistory([record], "jsonl");
    expect(JSON.parse(file.text.trim())).toEqual(record);
    expect(file.count).toBe(1);
    expect(file.filename.endsWith(".jsonl")).toBe(true);
  });

  it("quotes CSV newlines and quotes, preserving Unicode and blocking formulas", () => {
    const file = formatTranslationHistory(
      [{ ...record, translated_text: '=HYPERLINK("bad")' }],
      "csv",
    );
    expect(file.text.startsWith("\uFEFFschema_version")).toBe(true);
    expect(file.text).toContain('"An ""article"""');
    expect(file.text).toContain('"Original, text\nwith a new line."');
    expect(file.text).toContain('"\'=HYPERLINK(""bad"")"');
  });

  it("marks recovered cache entries incomplete without inventing missing metadata", async () => {
    vi.spyOn(translationHistory, "records").mockResolvedValue([record]);
    vi.spyOn(translationCache, "records").mockResolvedValue([
      { key: "duplicate", text: "{1}原文译文{/1}", ts: 100 },
      { key: "legacy", text: "{1}旧译文{/1}", ts: 200 },
    ]);
    const exported = await exportTranslationHistory("jsonl");
    const rows = exported.text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      id: "cache-legacy",
      source_text: null,
      url: null,
      requested_service: null,
      translated_text: "{1}旧译文{/1}",
      provenance: "recovered_cache",
      translated_text_format: "placeholders",
    });
  });

  it("rejects incomplete automatic history records", () => {
    expect(
      translationHistoryInputSchema.safeParse({ source_text: "original" })
        .success,
    ).toBe(false);
    expect(translationHistoryInputSchema.safeParse(record).success).toBe(true);
  });
});
