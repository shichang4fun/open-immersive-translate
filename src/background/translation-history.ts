import {
  formatTranslationHistory,
  translationHistoryInputSchema,
  type TranslationHistoryInput,
  type TranslationHistoryRecord,
  type TranslationHistoryFormat,
  type TranslationHistoryExport,
} from "../shared/translation-history";
import { translationCache } from "./cache";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("History database request failed."));
  });
}

/** Persistent archive, deliberately separate from the disposable translation cache. */
export class TranslationHistory {
  private database?: Promise<IDBDatabase>;

  constructor(private readonly databaseName = "bilingual-translator-history") {}

  private open(): Promise<IDBDatabase> {
    if (!this.database) {
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(this.databaseName, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("records", { keyPath: "id" });
        };
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => {
            database.close();
            this.database = undefined;
          };
          resolve(database);
        };
        request.onerror = () =>
          reject(
            request.error ?? new Error("Could not open translation history."),
          );
        request.onblocked = () =>
          reject(new Error("Translation history upgrade blocked."));
      }).catch((error: unknown) => {
        this.database = undefined;
        throw error;
      });
    }
    return this.database;
  }

  async save(value: TranslationHistoryInput): Promise<void> {
    const input = translationHistoryInputSchema.parse(value);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(input)),
    );
    const id = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const record: TranslationHistoryRecord = {
      ...input,
      schema_version: 1,
      id,
      saved_at: new Date().toISOString(),
      provenance: "page_translation",
      translated_text_format: "plain",
    };
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("records", "readwrite");
      // Stable ids prevent refreshes and cache hits from duplicating the same pair.
      transaction.objectStore("records").put(record);
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () =>
        reject(
          transaction.error ?? new Error("Translation history was not saved."),
        );
    });
  }

  async count(): Promise<number> {
    const database = await this.open();
    return requestResult(
      database
        .transaction("records", "readonly")
        .objectStore("records")
        .count(),
    );
  }

  async records(): Promise<TranslationHistoryRecord[]> {
    const database = await this.open();
    const records = (await requestResult(
      database
        .transaction("records", "readonly")
        .objectStore("records")
        .getAll(),
    )) as TranslationHistoryRecord[];
    return records.sort(
      (a, b) =>
        a.saved_at.localeCompare(b.saved_at) || a.id.localeCompare(b.id),
    );
  }
}

export const translationHistory = new TranslationHistory();

/** Recover old cache entries without inventing the missing original or provenance. */
export async function exportTranslationHistory(
  format: TranslationHistoryFormat,
): Promise<TranslationHistoryExport> {
  const [records, cached] = await Promise.all([
    translationHistory.records(),
    translationCache.records(),
  ]);
  const knownTranslations = new Set(
    records.map((record) => record.translated_text),
  );
  for (const entry of cached) {
    // Cached translations encode inline tags as numbered placeholders.
    const plainText = entry.text.replace(/\{\/?\d+\}/g, "");
    if (knownTranslations.has(plainText)) continue;
    records.push({
      schema_version: 1,
      id: `cache-${entry.key}`,
      url: null,
      title: null,
      paragraph_id: null,
      paragraph_index: null,
      source_text: null,
      translated_text: entry.text,
      source_language: null,
      target_language: null,
      requested_service: null,
      saved_at: new Date(entry.ts).toISOString(),
      provenance: "recovered_cache",
      translated_text_format: "placeholders",
    });
  }
  return formatTranslationHistory(records, format);
}
