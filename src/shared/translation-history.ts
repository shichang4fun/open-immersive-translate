import { z } from "zod";

import { LANGUAGE_CODES } from "./lang";

export const translationHistoryInputSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  paragraph_id: z.string().min(1),
  paragraph_index: z.number().int().nonnegative(),
  source_text: z.string().min(1),
  translated_text: z.string().min(1),
  source_language: z.enum(LANGUAGE_CODES),
  target_language: z.enum(LANGUAGE_CODES),
  requested_service: z.string().min(1),
});

export type TranslationHistoryInput = z.infer<
  typeof translationHistoryInputSchema
>;

export interface TranslationHistoryRecord {
  schema_version: 1;
  id: string;
  url: string | null;
  title: string | null;
  paragraph_id: string | null;
  paragraph_index: number | null;
  source_text: string | null;
  translated_text: string;
  source_language: string | null;
  target_language: string | null;
  requested_service: string | null;
  saved_at: string;
  provenance: "page_translation" | "recovered_cache" | "recovered_page";
  translated_text_format: "plain" | "placeholders";
}

export type TranslationHistoryFormat = "jsonl" | "csv";

export interface TranslationHistoryExport {
  filename: string;
  mimeType: string;
  text: string;
  count: number;
}

const columns: readonly (keyof TranslationHistoryRecord)[] = [
  "schema_version",
  "id",
  "url",
  "title",
  "paragraph_id",
  "paragraph_index",
  "source_text",
  "translated_text",
  "source_language",
  "target_language",
  "requested_service",
  "saved_at",
  "provenance",
  "translated_text_format",
];

/** JSONL preserves the exact text; CSV also protects spreadsheet formula cells. */
export function formatTranslationHistory(
  records: readonly TranslationHistoryRecord[],
  format: TranslationHistoryFormat,
): TranslationHistoryExport {
  const date = new Date().toISOString().slice(0, 10);
  if (format === "jsonl") {
    return {
      filename: `translation-history-${date}.jsonl`,
      mimeType: "application/x-ndjson;charset=utf-8",
      text:
        records.map((record) => JSON.stringify(record)).join("\n") +
        (records.length ? "\n" : ""),
      count: records.length,
    };
  }
  const cell = (value: unknown): string => {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return {
    filename: `translation-history-${date}.csv`,
    mimeType: "text/csv;charset=utf-8",
    text:
      "\uFEFF" +
      [
        columns.join(","),
        ...records.map((record) =>
          columns.map((key) => cell(record[key])).join(","),
        ),
      ].join("\r\n") +
      "\r\n",
    count: records.length,
  };
}

export function downloadTranslationHistory(
  file: TranslationHistoryExport,
): void {
  const url = URL.createObjectURL(
    new Blob([file.text], { type: file.mimeType }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  // Keep the URL alive until Chrome has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
