import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Server } from "node:http";

let server: Server;
let directory: string;
let endpoint: string;
const token = "isolated-unit-test-token-1234567890";
const record = {
  schema_version: 1,
  id: "one",
  url: "https://example.com",
  title: "Title",
  paragraph_id: "p-1",
  paragraph_index: 0,
  source_text: "Source, with a newline\n",
  translated_text: "=SUM(1,2)",
  source_language: "en",
  target_language: "zh-CN",
  requested_service: "mock",
  saved_at: "2026-10-05T00:00:00Z",
  provenance: "page_translation",
  translated_text_format: "plain",
};
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "imt-writer-test-"));
  const { startArchiveServer } = (await import(
    pathToFileURL(path.resolve("scripts/local-archive-server.mjs")).href
  )) as {
    startArchiveServer(options: {
      token: string;
      directory: string;
      port: number;
    }): Server;
  };
  server = startArchiveServer({ token, directory, port: 0 });
  if (!server.listening)
    await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Server unavailable");
  expect(address.address).toBe("127.0.0.1");
  endpoint = `http://127.0.0.1:${address.port}/archive`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(directory, { recursive: true });
});
const post = (
  records: unknown[],
  credential = token,
  origin = `chrome-extension://${"a".repeat(32)}`,
) =>
  fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credential}`,
      Origin: origin,
    },
    body: JSON.stringify({ records }),
  });
describe("local archive writer", () => {
  it("rejects unpaired callers and ordinary websites before writing", async () => {
    expect((await post([record], "wrong-token")).status).toBe(403);
    expect((await post([record], token, "https://example.com")).status).toBe(
      403,
    );
    expect(await readdir(directory)).toEqual([]);
  });
  it("rejects incomplete records without creating a backup", async () => {
    expect((await post([{ translated_text: "incomplete" }])).status).toBe(400);
    expect(await readdir(directory)).toEqual([]);
  });
  it("writes exact JSONL, protected CSV, and a matching manifest without overwrites", async () => {
    const response = await post([record]);
    expect(response.status).toBe(201);
    const result = (await response.json()) as { folder: string; count: number };
    expect(result.count).toBe(1);
    const jsonl = await readFile(
      path.join(result.folder, "translations.jsonl"),
      "utf8",
    );
    expect(JSON.parse(jsonl.trim())).toEqual(record);
    const csv = await readFile(
      path.join(result.folder, "translations.csv"),
      "utf8",
    );
    expect(csv).toContain('"\'=SUM(1,2)"');
    const manifest = JSON.parse(
      await readFile(path.join(result.folder, "manifest.json"), "utf8"),
    );
    expect(manifest).toMatchObject({
      records: 1,
      paired_records: 1,
      jsonl_sha256: createHash("sha256").update(jsonl).digest("hex"),
    });
    const other = (await (await post([])).json()) as { folder: string };
    expect(other.folder).not.toBe(result.folder);
    expect(
      await readFile(path.join(result.folder, "translations.jsonl"), "utf8"),
    ).toBe(jsonl);
  });
});
