import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import console from "node:console";
import process from "node:process";
import { mkdir, mkdtemp, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const columns = [
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
  "first_saved_at",
  "last_seen_at",
  "provenance",
  "translated_text_format",
];

export function startArchiveServer({ token, directory, port = 24198 }) {
  if (!token || token.length < 32 || !directory)
    throw new Error("A private token and archive directory are required.");
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    const extensionOrigin =
      !origin || /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
    const reply = (status, value) => {
      response.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify(value));
    };
    if (request.url === "/health" && request.method === "GET")
      return reply(200, { ok: true });
    if (request.url !== "/archive" || !extensionOrigin)
      return reply(403, { error: "Forbidden" });
    if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
    if (request.method === "OPTIONS") {
      response.setHeader("Access-Control-Allow-Methods", "POST");
      response.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      return reply(204, null);
    }
    if (
      request.method !== "POST" ||
      request.headers.authorization !== `Bearer ${token}`
    ) {
      return reply(403, { error: "Forbidden" });
    }
    if (!request.headers["content-type"]?.startsWith("application/json"))
      return reply(415, { error: "JSON required" });
    try {
      let bytes = 0;
      const chunks = [];
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 20 * 1024 * 1024)
          return reply(413, { error: "Snapshot exceeds 20 MB" });
        chunks.push(chunk);
      }
      let records;
      try {
        records = JSON.parse(Buffer.concat(chunks).toString("utf8")).records;
      } catch {
        return reply(400, { error: "Invalid JSON" });
      }
      if (
        !Array.isArray(records) ||
        records.some(
          (record) =>
            !record ||
            record.schema_version !== 1 ||
            typeof record.id !== "string" ||
            typeof record.translated_text !== "string" ||
            (record.source_text !== null &&
              typeof record.source_text !== "string") ||
            !Number.isFinite(Date.parse(record.saved_at)) ||
            columns.some((column) =>
              column === "first_saved_at" || column === "last_seen_at"
                ? record[column] != null &&
                  (typeof record[column] !== "string" ||
                    !Number.isFinite(Date.parse(record[column])))
                : !Object.hasOwn(record, column),
            ),
        )
      )
        return reply(400, { error: "Invalid records" });
      const jsonl =
        records.map((record) => JSON.stringify(record)).join("\n") +
        (records.length ? "\n" : "");
      const cell = (value) => {
        let text = value == null ? "" : String(value);
        if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
      };
      const csv =
        "\uFEFF" +
        [
          columns.join(","),
          ...records.map((record) =>
            columns.map((key) => cell(record[key])).join(","),
          ),
        ].join("\r\n") +
        "\r\n";
      const now = new Date();
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      const day = join(resolve(directory), date);
      await mkdir(day, { recursive: true });
      const partial = await mkdtemp(join(day, ".partial-"));
      const folder = join(day, `${now.getTime()}-${randomUUID()}`);
      const manifest = {
        exported_at: now.toISOString(),
        timezone: "Asia/Shanghai",
        records: records.length,
        paired_records: records.filter((record) => record.source_text !== null)
          .length,
        jsonl_sha256: createHash("sha256").update(jsonl).digest("hex"),
      };
      await writeFile(join(partial, "translations.jsonl"), jsonl, {
        flag: "wx",
      });
      await writeFile(join(partial, "translations.csv"), csv, { flag: "wx" });
      await writeFile(
        join(partial, "manifest.json"),
        JSON.stringify(manifest, null, 2) + "\n",
        { flag: "wx" },
      );
      await rename(partial, folder); // Publish the folder only after all three files are on disk.
      return reply(201, { folder, count: records.length });
    } catch (error) {
      console.error("Local archive write failed:", error.message);
      return reply(500, { error: "Local archive write failed" });
    }
  });
  server.requestTimeout = 10_000;
  server.listen(port, "127.0.0.1");
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  startArchiveServer({
    token: process.env.IMT_ARCHIVE_TOKEN,
    directory: process.env.IMT_ARCHIVE_DIR,
  });
}
