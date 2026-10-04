import {
  expect,
  test,
  type BrowserContext,
  type BrowserType,
  type Worker,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

interface ExtensionApi {
  alarms: {
    create(name: string, info: { when: number }): Promise<void>;
  };
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
  };
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  tabs: {
    query(
      query: Record<string, unknown>,
    ): Promise<Array<{ id?: number; url?: string }>>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
  scripting: {
    executeScript(
      details: Record<string, unknown>,
    ): Promise<Array<{ result?: unknown }>>;
  };
}

interface ExtensionWorkerGlobal {
  chrome: ExtensionApi;
}

let server: Server;
let origin: string;
let fixturePdf: Uint8Array;
let profileSequence = 0;

test.beforeAll(async () => {
  const fixture = await readFile(
    path.resolve("tests/e2e/fixtures/article.html"),
    "utf8",
  );
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pdfPage = pdf.addPage([420, 240]);
  pdfPage.drawText("Tiny PDF paragraph for translation.", {
    x: 40,
    y: 160,
    size: 15,
    font,
  });
  fixturePdf = await pdf.save();

  server = createServer((request, response) => {
    if (request.url === "/fixture.pdf") {
      response.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/pdf",
      });
      response.end(Buffer.from(fixturePdf));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(fixture);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start the fixture server.");
  }
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function extensionWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? context.waitForEvent("serviceworker");
}

async function launchExtension(
  playwright: {
    chromium: BrowserType;
  },
  profileDirectory?: string,
): Promise<{
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  userDataDir: string;
}> {
  const extensionPath = path.resolve("dist");
  const userDataDir =
    profileDirectory ??
    path.join(
      tmpdir(),
      `bilingual-translator-e2e-${process.pid}-${++profileSequence}`,
    );
  const context = await playwright.chromium.launchPersistentContext(
    userDataDir,
    {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--lang=zh-CN",
      ],
    },
  );
  const worker = await extensionWorker(context);
  return {
    context,
    worker,
    userDataDir,
    extensionId: new URL(worker.url()).host,
  };
}

async function selectMockService(
  worker: Worker,
  patch: Record<string, unknown> = {},
): Promise<void> {
  await worker.evaluate(async (configPatch) => {
    const api = (globalThis as unknown as ExtensionWorkerGlobal).chrome;
    let config: Record<string, unknown> | undefined;
    for (let attempt = 0; attempt < 100 && !config; attempt += 1) {
      const stored = await api.storage.local.get("config");
      if (stored.config && typeof stored.config === "object") {
        config = stored.config as Record<string, unknown>;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    if (!config) throw new Error("Extension defaults were not installed.");
    const services = config.services as Record<string, unknown>;
    const google = services.google as Record<string, unknown> | undefined;
    if (
      config.service !== "google" ||
      google?.enabled !== true ||
      google.apiKey !== undefined
    ) {
      throw new Error("Fresh-install Google defaults are invalid.");
    }
    await api.storage.local.set({
      config: {
        ...config,
        ...configPatch,
        service: "mock",
        services: {
          ...services,
          ...((configPatch.services as Record<string, unknown> | undefined) ??
            {}),
          mock: { kind: "mock", enabled: true },
        },
        floatBall: { enabled: false, position: "right" },
        hover: { enabled: false, holdKey: "Alt" },
        selection: { enabled: false },
        input: { enabled: false, trigger: "//" },
        subtitle: {
          ...(config.subtitle as Record<string, unknown>),
          youtube: false,
        },
      },
    });
  }, patch);
}

async function sendToArticleTab(
  worker: Worker,
  message: Record<string, unknown>,
): Promise<boolean> {
  return worker.evaluate(
    async ({ pageOrigin, runtimeMessage }) => {
      const api = (globalThis as unknown as ExtensionWorkerGlobal).chrome;
      const tabs = await api.tabs.query({});
      const tab = tabs.find((candidate) =>
        candidate.url?.startsWith(pageOrigin),
      );
      if (tab?.id === undefined) return false;
      try {
        await api.tabs.sendMessage(tab.id, runtimeMessage);
        return true;
      } catch {
        return false;
      }
    },
    { pageOrigin: origin, runtimeMessage: message },
  );
}

async function toggleActivePage(worker: Worker): Promise<boolean> {
  return sendToArticleTab(worker, { type: "toggleTranslate" });
}

async function runPageCommand(
  worker: Worker,
  command: string,
): Promise<boolean> {
  return sendToArticleTab(worker, { type: "pageControllerCommand", command });
}

async function contentState(worker: Worker): Promise<{
  ready: boolean;
  active: boolean;
  error?: string;
}> {
  return worker.evaluate(async (pageOrigin) => {
    const api = (globalThis as unknown as ExtensionWorkerGlobal).chrome;
    const tabs = await api.tabs.query({});
    const tab = tabs.find((candidate) => candidate.url?.startsWith(pageOrigin));
    if (tab?.id === undefined) return { ready: false, active: false };
    const [execution] = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        ready: window.__imt?.ready ?? false,
        active: window.__imt?.active ?? false,
        error: window.__imt?.error ? String(window.__imt.error) : undefined,
      }),
    });
    return execution?.result as {
      ready: boolean;
      active: boolean;
      error?: string;
    };
  }, origin);
}

test("translates article paragraphs once and restores the DOM", async ({
  playwright,
}) => {
  const { context, worker } = await launchExtension(playwright);
  try {
    await selectMockService(worker);
    const page = await context.newPage();
    await page.goto(`${origin}/article.html`);
    const originalBody = await page.locator("body").innerHTML();

    await expect
      .poll(() => contentState(worker))
      .toMatchObject({ ready: true });
    await expect.poll(() => toggleActivePage(worker)).toBe(true);
    await expect
      .poll(() =>
        page
          .locator("article > p")
          .evaluateAll((paragraphs) =>
            paragraphs.map(
              (paragraph) =>
                paragraph.querySelectorAll("font[data-imt='target']").length,
            ),
          ),
      )
      .toEqual([1, 1, 1]);

    await expect(
      page.locator("article > p font[data-imt='target']"),
    ).toHaveCount(3);
    await expect(
      page.locator("article > p font[data-imt='target']").first(),
    ).toContainText("[zh]");
    await expect(page.locator("nav font[data-imt='target']")).toHaveCount(0);
    await expect(page.locator("pre font[data-imt='target']")).toHaveCount(0);
    await expect(page.locator("code font[data-imt='target']")).toHaveCount(0);

    await expect.poll(() => toggleActivePage(worker)).toBe(true);
    await expect(page.locator("font[data-imt='target']")).toHaveCount(0);
    await expect
      .poll(() => page.locator("body").innerHTML())
      .toBe(originalBody);
  } finally {
    await context.close();
  }
});

test("exports a weekly archive from a background alarm without a webpage", async ({
  playwright,
}) => {
  const { context, worker, extensionId, userDataDir } =
    await launchExtension(playwright);
  const { startArchiveServer } = (await import(
    pathToFileURL(path.resolve("scripts/local-archive-server.mjs")).href
  )) as {
    startArchiveServer(options: { token: string; directory: string }): Server;
  };
  const companion = startArchiveServer({
    token: process.env.IMT_ARCHIVE_TOKEN!,
    directory: path.join(userDataDir, "exports"),
  });
  if (!companion.listening)
    await new Promise<void>((resolve) => companion.once("listening", resolve));
  try {
    const setup = await context.newPage();
    await setup.goto(`chrome-extension://${extensionId}/options.html#data`);
    await setup.evaluate(async () => {
      const api = (globalThis as unknown as ExtensionWorkerGlobal).chrome;
      await api.runtime.sendMessage({
        type: "saveTranslationHistory",
        record: {
          url: "https://example.com/article",
          title: "Weekly archive",
          paragraph_id: "p-1",
          paragraph_index: 0,
          source_text: 'Original, quoted "text"',
          translated_text: "中文译文",
          source_language: "en",
          target_language: "zh-CN",
          requested_service: "mock",
        },
      });
    });
    await setup.close();
    await worker.evaluate(async () => {
      const api = (globalThis as unknown as ExtensionWorkerGlobal).chrome;
      await api.storage.local.set({
        weeklyTranslationExportState: { nextDue: Date.now() - 1000 },
      });
      await api.alarms.create("imt:weekly-translation-export", {
        when: Date.now() + 500,
      });
    });
    const state = () =>
      worker.evaluate(async () => {
        const api = (globalThis as unknown as ExtensionWorkerGlobal).chrome;
        return (await api.storage.local.get("weeklyTranslationExportState"))
          .weeklyTranslationExportState as {
          folder?: string;
          count?: number;
          lastCompletedAt?: number;
        };
      });
    await expect
      .poll(
        async () => {
          const current = await state();
          if ("lastError" in current) throw new Error(JSON.stringify(current));
          return current.lastCompletedAt;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
    const completed = await state();
    expect(completed.count).toBe(1);
    const jsonl = await readFile(
      path.join(completed.folder!, "translations.jsonl"),
      "utf8",
    );
    const csv = await readFile(
      path.join(completed.folder!, "translations.csv"),
      "utf8",
    );
    const manifest = JSON.parse(
      await readFile(path.join(completed.folder!, "manifest.json"), "utf8"),
    );
    expect(JSON.parse(jsonl.trim())).toMatchObject({
      source_text: 'Original, quoted "text"',
      translated_text: "中文译文",
    });
    expect(csv).toContain('"Original, quoted ""text"""');
    expect(manifest).toMatchObject({
      records: 1,
      paired_records: 1,
      jsonl_sha256: createHash("sha256").update(jsonl).digest("hex"),
    });
    expect((await state()).folder).toBe(completed.folder);
  } finally {
    await context.close();
    await new Promise<void>((resolve) => companion.close(() => resolve()));
  }
});

test("archives paired translations across browser restart and cache clearing", async ({
  playwright,
}) => {
  const first = await launchExtension(playwright);
  let context = first.context;
  let worker = first.worker;
  let historyPage = await context.newPage();
  await historyPage.goto(
    `chrome-extension://${first.extensionId}/options.html#data`,
  );
  const stats = () =>
    historyPage.evaluate(async () => {
      const api = (globalThis as unknown as ExtensionWorkerGlobal).chrome;
      return (await api.runtime.sendMessage({
        type: "getTranslationHistoryStats",
      })) as { count: number };
    });
  const exportRecords = () =>
    historyPage.evaluate(async () => {
      const api = (globalThis as unknown as ExtensionWorkerGlobal).chrome;
      const file = (await api.runtime.sendMessage({
        type: "exportTranslationHistory",
        format: "jsonl",
      })) as { text: string };
      return file.text
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    });
  try {
    await selectMockService(worker, { translateToPageEndImmediately: true });
    let page = await context.newPage();
    await page.goto(`${origin}/article.html`);
    await expect
      .poll(() => contentState(worker))
      .toMatchObject({ ready: true });
    await expect.poll(() => toggleActivePage(worker)).toBe(true);
    await expect.poll(async () => (await stats()).count).toBeGreaterThan(0);
    await expect
      .poll(() => contentState(worker))
      .toMatchObject({ active: true });
    await expect(
      page.locator("article > p font[data-imt='target']"),
    ).toHaveCount(3);
    await expect
      .poll(
        async () =>
          (await exportRecords()).filter(
            (record) =>
              record.provenance === "page_translation" && record.source_text,
          ).length,
      )
      .toBeGreaterThanOrEqual(3);
    const saved = await exportRecords();
    const count = (await stats()).count;
    const csvDownloadWaiting = historyPage.waitForEvent("download");
    await historyPage
      .getByRole("button", { name: "导出翻译记录 CSV", exact: true })
      .click();
    const csvDownload = await csvDownloadWaiting;
    const csvFilename = await csvDownload.path();
    expect(csvFilename).not.toBeNull();
    const csv = await readFile(csvFilename!, "utf8");
    expect(csv.startsWith("\uFEFFschema_version,")).toBe(true);
    expect(csv).toContain("source_text");
    expect(csv).toContain("translated_text");
    expect(csv).toContain("page_translation");
    expect(
      saved.filter((record) => record.provenance === "page_translation"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: `${origin}/article.html`,
          requested_service: "mock",
          translated_text_format: "plain",
        }),
      ]),
    );
    expect(
      saved.some((record) =>
        String(record.source_text).includes("first paragraph"),
      ),
    ).toBe(true);
    expect(
      saved
        .filter((record) => record.provenance === "page_translation")
        .every((record) => !/\{\/?\d+\}/.test(String(record.translated_text))),
    ).toBe(true);

    await context.close();
    const reopened = await launchExtension(playwright, first.userDataDir);
    context = reopened.context;
    worker = reopened.worker;
    historyPage = await context.newPage();
    await historyPage.goto(
      `chrome-extension://${reopened.extensionId}/options.html#data`,
    );
    expect((await stats()).count).toBe(count);
    page = await context.newPage();
    await page.goto(`${origin}/article.html`);
    await expect
      .poll(() => contentState(worker))
      .toMatchObject({ ready: true });
    await expect.poll(() => toggleActivePage(worker)).toBe(true);
    await expect(
      page.locator("article > p font[data-imt='target']"),
    ).toHaveCount(3);
    expect((await stats()).count).toBe(count);
    await historyPage.evaluate(async () => {
      const api = (globalThis as unknown as ExtensionWorkerGlobal).chrome;
      await api.runtime.sendMessage({ type: "clearCache" });
    });
    expect((await stats()).count).toBe(count);
    expect(
      (await exportRecords()).filter(
        (record) => record.provenance === "page_translation",
      ),
    ).toHaveLength(count);
  } finally {
    await context.close();
  }
});

test("applies glossary entries and toggles mask and translation-only mode", async ({
  playwright,
}) => {
  const { context, worker } = await launchExtension(playwright);
  try {
    await selectMockService(worker, {
      glossaries: [{ k: "first paragraph", v: "首段术语" }],
      translateToPageEndImmediately: true,
    });
    const page = await context.newPage();
    await page.goto(`${origin}/article.html`);
    await expect
      .poll(() => contentState(worker))
      .toMatchObject({ ready: true });
    await expect.poll(() => toggleActivePage(worker)).toBe(true);

    const firstTranslation = page
      .locator("#first font[data-imt='target']")
      .first();
    await expect(firstTranslation).toContainText("[zh] This is the 首段术语");

    await expect
      .poll(() => runPageCommand(worker, "toggleTranslationMask"))
      .toBe(true);
    await expect(page.locator("html")).toHaveClass(/imt-translation-mask/u);

    await expect
      .poll(() => runPageCommand(worker, "toggleOnlyTranslation"))
      .toBe(true);
    await expect(page.locator("#first [data-imt='source']")).toHaveClass(
      /imt-source-hidden/u,
    );
    await expect(firstTranslation).toBeVisible();
  } finally {
    await context.close();
  }
});

test("opens a PDF URL and translates its extracted paragraph", async ({
  playwright,
}) => {
  const { context, worker, extensionId } = await launchExtension(playwright);
  try {
    await selectMockService(worker);
    const page = await context.newPage();
    const reader = new URL(
      `chrome-extension://${extensionId}/src/pdf/index.html`,
    );
    reader.searchParams.set("file", `${origin}/fixture.pdf`);
    await page.goto(reader.href);

    await expect(page.locator(".pdf-page-shell")).toHaveCount(1);
    await expect(page.locator(".pdf-translation").first()).toContainText(
      "[zh] Tiny PDF paragraph for translation.",
    );
  } finally {
    await context.close();
  }
});

test("translates every cue in a local SRT file", async ({ playwright }) => {
  const { context, worker, extensionId } = await launchExtension(playwright);
  try {
    await selectMockService(worker);
    const page = await context.newPage();
    await page.goto(
      `chrome-extension://${extensionId}/src/subtitle-file/index.html`,
    );
    const srt = [
      "1",
      "00:00:00,000 --> 00:00:01,000",
      "First cue",
      "",
      "2",
      "00:00:01,500 --> 00:00:02,500",
      "Second cue",
      "",
      "3",
      "00:00:03,000 --> 00:00:04,000",
      "Third cue",
      "",
    ].join("\n");
    await page.locator("input[type='file']").setInputFiles({
      name: "fixture.srt",
      mimeType: "application/x-subrip",
      buffer: Buffer.from(srt),
    });
    await expect(page.locator("tbody tr")).toHaveCount(3);
    await page
      .getByRole("button", {
        name: /翻译全部字幕|Translate all subtitles/u,
      })
      .click();
    await expect(page.locator("tbody tr td:last-child")).toHaveText([
      "[zh] First cue",
      "[zh] Second cue",
      "[zh] Third cue",
    ]);
  } finally {
    await context.close();
  }
});

test("loads the side panel and round-trips text through the mock service", async ({
  playwright,
}) => {
  const { context, worker, extensionId } = await launchExtension(playwright);
  try {
    await selectMockService(worker);
    const page = await context.newPage();
    await page.goto(
      `chrome-extension://${extensionId}/src/ui/sidepanel/index.html`,
    );
    await page
      .getByRole("textbox", {
        name: /输入要翻译的文字|Enter text to translate/u,
      })
      .fill("Side panel sample");
    await page
      .getByRole("button", { name: /翻译文字|Translate text/u })
      .click();
    await expect(page.locator(".side-output")).toHaveText(
      "[zh] Side panel sample",
    );
  } finally {
    await context.close();
  }
});
