import {
  expect,
  test,
  type BrowserContext,
  type BrowserType,
  type Worker,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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

test("YouTube loads captions with CC off and offers a compact independent popup switch", async ({
  playwright,
}, testInfo) => {
  const { context, worker, extensionId } = await launchExtension(playwright);
  try {
    await selectMockService(worker, {
      uiLanguage: "en",
      subtitle: { enabled: true, youtube: true, preTranslation: true },
    });
    const samples = 8000 * 6;
    const wav = Buffer.alloc(44 + samples, 128);
    wav.write("RIFF", 0);
    wav.writeUInt32LE(36 + samples, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(8000, 28);
    wav.writeUInt16LE(1, 32);
    wav.writeUInt16LE(8, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(samples, 40);
    const popup = await context.newPage();
    const page = await context.newPage();
    let captionRequests = 0;
    await page.route("https://www.youtube.com/**", (route) => {
      if (route.request().url().includes("/api/timedtext")) {
        captionRequests += 1;
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            events:
              captionRequests === 1
                ? []
                : [
                    {
                      tStartMs: 0,
                      dDurationMs: 6000,
                      segs: [{ utf8: "Hello from YouTube." }],
                    },
                  ],
          }),
        });
      }
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><meta charset="utf-8"><style>video{width:800px;height:450px;background:#222}.html5-video-player{position:relative}.ytp-right-controls{height:48px}</style><div class="html5-video-player"><video preload="auto" src="data:audio/wav;base64,${wav.toString("base64")}"></video><div class="ytp-caption-window-container">Native captions</div><div class="ytp-right-controls"><button class="ytp-subtitles-button" aria-pressed="false">CC</button></div></div><script>document.querySelector('button').onclick=function(){const on=this.getAttribute('aria-pressed')!=='true';this.setAttribute('aria-pressed',String(on));if(on){const xhr=new XMLHttpRequest();xhr.open('GET','https://www.youtube.com/api/timedtext?fmt=json3');xhr.send();}};</script></html>`,
      });
    });
    await page.goto("https://www.youtube.com/watch?v=fixture");
    const cc = page.locator(".ytp-subtitles-button");
    await expect(cc).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator('[data-imt="subtitle-overlay"] .translation'),
    ).toContainText("[zh] Hello from YouTube.", { timeout: 10000 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.bringToFront();
    await popup.reload();
    const toggle = popup.getByRole("checkbox", {
      name: "Bilingual video subtitles",
    });
    await expect(toggle).toBeChecked();
    const bounds = await popup.locator(".popup-shell").boundingBox();
    expect(bounds!.width).toBe(380);
    expect(bounds!.height).toBeLessThanOrEqual(600);
    await popup.setViewportSize({
      width: 380,
      height: Math.ceil(bounds!.height),
    });
    await popup.screenshot({ path: testInfo.outputPath("popup-light.png") });
    await popup.emulateMedia({ colorScheme: "dark" });
    await popup.screenshot({ path: testInfo.outputPath("popup-dark.png") });
    await toggle.uncheck();
    await expect(page.locator('[data-imt="subtitle-overlay"]')).toHaveCount(0);
    await expect(cc).toHaveAttribute("aria-pressed", "false");
    await toggle.check();
    await expect(
      page.locator('[data-imt="subtitle-overlay"] .translation'),
    ).toContainText("[zh] Hello from YouTube.");
    await popup.getByRole("button", { name: "More", exact: true }).click();
    await expect(popup.getByRole("menu")).toBeVisible();
    await popup.keyboard.press("Escape");
    await expect(popup.getByRole("menu")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("video subtitles have a persistent switch, bounded captions and native restoration", async ({
  playwright,
}, testInfo) => {
  const { context, worker } = await launchExtension(playwright);
  try {
    await selectMockService(worker, {
      subtitle: { enabled: false, preTranslation: false },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Real media metadata and TextTrack loading, without an external service.
    const samples = 8000 * 30;
    const wav = Buffer.alloc(44 + samples, 128);
    wav.write("RIFF", 0);
    wav.writeUInt32LE(36 + samples, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(8000, 28);
    wav.writeUInt16LE(1, 32);
    wav.writeUInt16LE(8, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(samples, 40);
    const cues = Array.from(
      { length: 15 },
      (_, i) =>
        `${i + 1}\n00:00:${String(i * 2).padStart(2, "0")}.000 --> 00:00:${String(i * 2 + 2).padStart(2, "0")}.000\ncaption ${i} with automatic words and no final punctuation`,
    ).join("\n\n");
    await page.route("**/captions.vtt", (route) =>
      route.fulfill({ contentType: "text/vtt", body: `WEBVTT\n\n${cues}\n` }),
    );
    await page.route("**/video.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>视频字幕开关验证</title>
      <style>body{margin:0;background:#f5f6f4;color:#202d29;font:18px system-ui}main{max-width:960px;margin:48px auto;padding:0 20px}.player{position:relative;background:#152421;border-radius:12px;overflow:hidden}video{width:100%;height:500px;display:block;background:#152421}.title{position:absolute;top:28px;left:30px;color:#dde9e3;pointer-events:none}.ytp-right-controls{height:44px;display:flex;justify-content:flex-end;background:#202a26;padding-right:12px}.player:fullscreen video{height:calc(100vh - 44px)}@media(max-width:500px){video{height:260px}}</style>
      <main><h1>视频双语字幕</h1><p>使用播放器中的「译 · 双语」开关，独立控制字幕翻译。</p><div class="player html5-video-player"><video src="data:audio/wav;base64,${wav.toString("base64")}" preload="auto" controls><track src="/captions.vtt" kind="subtitles" srclang="en" label="English" default></video><div class="title">字幕显示与开关回归测试</div><div class="ytp-right-controls"></div></div></main></html>`,
      }),
    );
    await page.goto(`${origin}/video.html`);
    // Real Chromium validates CSS priority; JSDOM does not preserve it.
    await page.evaluate(() => {
      const native = document.createElement("div");
      native.className = "ytp-caption-window-container";
      native.style.setProperty("visibility", "visible", "important");
      document.querySelector(".player")!.append(native);
    });
    const toggle = page.getByRole("switch", {
      name: /双语字幕|Bilingual subtitles/,
    });
    const overlay = page.locator('[data-imt="subtitle-overlay"]');
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelector("video")!.textTracks[0]?.cues?.length,
        ),
      )
      .toBe(15);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelector("video")!.textTracks[0].mode,
        ),
      )
      .toBe("showing");
    await expect(overlay).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(overlay.locator(".translation")).toContainText("[zh]");
    await expect(page.locator(".ytp-caption-window-container")).toHaveCSS("visibility", "hidden");
    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelector("video")!.textTracks[0].mode,
        ),
      )
      .toBe("hidden");
    expect(
      (await overlay.locator(".source").innerText()).length,
    ).toBeLessThanOrEqual(80);
    await expect
      .poll(() =>
        page.evaluate(() => document.querySelector("video")!.readyState),
      )
      .toBeGreaterThanOrEqual(4);
    await page.evaluate(() => {
      document.querySelector("video")!.currentTime = 16;
    });
    await expect
      .poll(() =>
        page.evaluate(() => ({
          time: document.querySelector("video")!.currentTime,
          duration: document.querySelector("video")!.duration,
          error: document.querySelector("video")!.error?.message,
        })),
      )
      .toMatchObject({ time: 16 });
    await expect(overlay.locator(".source")).toContainText("caption 8");
    const box = await overlay.locator(".caption").boundingBox();
    expect(box!.height).toBeLessThanOrEqual(180);
    await page.screenshot({
      path: testInfo.outputPath("video-subtitles-on.png"),
      fullPage: true,
    });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(overlay).toHaveCount(0);
    await expect(page.locator(".ytp-caption-window-container")).toHaveCSS("visibility", "visible");
    expect(await page.locator(".ytp-caption-window-container").evaluate((node) =>
      (node as HTMLElement).style.getPropertyPriority("visibility"),
    )).toBe("important");
    await expect
      .poll(() =>
        page.evaluate(
          () => document.querySelector("video")!.textTracks[0].mode,
        ),
      )
      .toBe("showing");
    await page.reload();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(overlay).toHaveCount(0);
    await toggle.press("Space");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(overlay.locator(".translation")).toContainText("[zh]");
    await page.evaluate(() =>
      document.querySelector(".player")!.requestFullscreen(),
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.fullscreenElement?.contains(
            document.querySelector('[data-imt="subtitle-overlay"]'),
          ),
        ),
      )
      .toBe(true);
    await expect(toggle).toBeVisible();
    await page.evaluate(() => document.exitFullscreen());
    await page.setViewportSize({ width: 390, height: 700 });
    await expect(toggle).toBeVisible();
    await expect.poll(() => overlay.locator(".caption").evaluate((box) =>
      box.scrollHeight <= box.clientHeight,
    )).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("video-subtitles-narrow.png"),
      fullPage: true,
    });
    await page.evaluate(() =>
      document.querySelector(".ytp-right-controls")!.remove(),
    );
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(overlay).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("video-subtitles-off.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("input translation avoids accidental language bars and preserves explicit commands", async ({
  playwright,
}, testInfo) => {
  const { context, worker } = await launchExtension(playwright);
  try {
    await selectMockService(worker, {
      uiLanguage: "zh-CN",
      input: { enabled: true, targetLanguage: "zh-CN" },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/input.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
        <title>输入框翻译交互验证</title>
        <style>body{font:18px system-ui;max-width:760px;margin:64px auto;background:#f5f6f4;color:#202d29}label{display:block;margin-top:32px}input,textarea,[contenteditable]{display:block;box-sizing:border-box;width:100%;padding:16px;margin:12px 0;border:1px solid #ccc;border-radius:8px;background:white;font:18px system-ui}textarea{height:130px}button{padding:12px 24px}</style>
        <h1>输入框翻译交互验证</h1>
        <label>搜索<input type="search" aria-label="搜索"></label>
        <label>正文<textarea aria-label="正文"></textarea></label>
        <label>富文本编辑器<div contenteditable="true" role="textbox" aria-label="富文本编辑器"></div></label>
        <button>其他区域</button></html>`,
      }),
    );
    await page.goto(`${origin}/input.html`);
    const editor = page.getByRole("textbox", { name: "正文", exact: true });
    const bar = page.locator('[data-imt="input-target"]');
    // The explicit command proves the extension is listening before negative checks.
    await expect(async () => {
      await editor.fill("//hello");
      await expect(bar).toBeVisible({ timeout: 1000 });
    }).toPass();
    await editor.press("Escape");
    await expect(bar).toHaveCount(0);
    await editor.fill("hello");
    await editor.pressSequentially(" world ");
    await expect(bar).toHaveCount(0);
    await expect(editor).toHaveValue("hello world ");
    const search = page.getByRole("searchbox", { name: "搜索" });
    await search.fill("//hello");
    await search.press("Enter");
    await search.pressSequentially("   ");
    await expect(search).toHaveValue("//hello   ");
    await expect(bar).toHaveCount(0);
    await editor.fill("hello");
    await editor.pressSequentially("   ", { delay: 50 });
    await expect(editor).toHaveValue("[zh] hello");
    await expect(bar).toHaveCount(0);
    await editor.fill("//hello world");
    await bar.locator("select").focus();
    await expect(bar).toBeVisible();
    await bar.locator("select").selectOption("ja");
    await expect(editor).toBeFocused();
    await expect(bar).toHaveCount(0);
    await editor.press("Enter");
    await expect(editor).toHaveValue("[zh] hello world");
    await editor.fill("/en hello");
    await expect(bar).toBeVisible();
    await page.getByRole("button", { name: "其他区域" }).click();
    await expect(bar).toHaveCount(0);
    await editor.fill("//hello");
    await expect(bar).toBeVisible();
    await editor.fill("hello");
    await expect(bar).toHaveCount(0);
    const richEditor = page.getByRole("textbox", { name: "富文本编辑器" });
    await richEditor.fill("//hello composer");
    await expect(bar).toBeVisible();
    await richEditor.press("Enter");
    await expect(richEditor).toHaveText("[zh] hello composer");
    await expect(bar).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("input-translation.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("persists ChatGPT Fast mode and can restore standard speed", async ({
  playwright,
}, testInfo) => {
  const { context, worker, extensionId } = await launchExtension(playwright);
  try {
    await selectMockService(worker, { uiLanguage: "zh-CN" });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(page.locator("body")).toHaveCSS("font-size", "16px");
    await expect(page.locator(".options-content-header p").first()).toHaveCSS("font-size", "16px");
    await expect(page.locator(".ui-toggle").first()).toHaveCSS("font-size", "16px");
    await page.getByRole("tab", { name: "翻译服务", exact: true }).click();
    await page.getByLabel("选择服务", { exact: true }).selectOption("chatgpt");
    const speed = page.getByLabel("请求速度", { exact: true });
    await expect(speed).toHaveValue("default");
    await speed.selectOption("fast");
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const api = (globalThis as unknown as ExtensionWorkerGlobal).chrome;
          const { config } = await api.storage.local.get("config");
          return (config as { services: { chatgpt: { serviceTier: string } } })
            .services.chatgpt.serviceTier;
        }),
      )
      .toBe("fast");
    await page.reload();
    await page.getByRole("tab", { name: "翻译服务", exact: true }).click();
    await page.getByLabel("选择服务", { exact: true }).selectOption("chatgpt");
    await expect(speed).toHaveValue("fast");
    await page.screenshot({
      path: testInfo.outputPath("chatgpt-fast.png"),
      fullPage: true,
    });
    await speed.selectOption("default");
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const api = (globalThis as unknown as ExtensionWorkerGlobal).chrome;
          const { config } = await api.storage.local.get("config");
          return (config as { services: { chatgpt: { serviceTier: string } } })
            .services.chatgpt.serviceTier;
        }),
      )
      .toBe("default");
  } finally {
    await context.close();
  }
});

test("settings stay readable across tabs, narrow windows and dark mode", async ({
  playwright,
}, testInfo) => {
  const { context, worker, extensionId } = await launchExtension(playwright);
  try {
    await selectMockService(worker, { uiLanguage: "zh-CN" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(page.getByLabel("界面语言", { exact: true })).toHaveCSS(
      "font-size",
      "16px",
    );
    await expect(page.getByLabel("译文字号缩放", { exact: true })).toHaveCSS(
      "min-height",
      "46px",
    );
    await page.screenshot({
      path: testInfo.outputPath("settings-desktop.png"),
      fullPage: true,
    });
    await page.getByRole("tab", { name: "翻译服务", exact: true }).click();
    await expect(page).toHaveURL(/#services$/);
    await page.reload();
    await expect(
      page.getByRole("tab", { name: "翻译服务", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page.getByLabel("选择服务", { exact: true }).selectOption("chatgpt");
    await expect(
      page.getByRole("button", { name: "登录 ChatGPT", exact: true }),
    ).toBeEnabled();
    const modelHeight = await page
      .getByLabel("模型", { exact: true })
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(modelHeight).toBeGreaterThanOrEqual(44);
    expect(modelHeight).toBeLessThan(50);
    await expect(page.getByLabel("系统提示词", { exact: true })).toHaveCSS(
      "min-height",
      "160px",
    );
    await page.screenshot({
      path: testInfo.outputPath("settings-services.png"),
      fullPage: true,
    });
    const basic = page.getByRole("tab", { name: "基本", exact: true });
    await basic.focus();
    await basic.press("End");
    await expect(page).toHaveURL(/#data$/);
    await page.goBack();
    await expect(page).toHaveURL(/#services$/);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("tablist")).toHaveAttribute("aria-orientation", "horizontal");
    for (const name of [
      "基本",
      "翻译服务",
      "翻译功能",
      "站点规则",
      "术语表",
      "快捷键",
      "数据与备份",
    ]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(page.getByRole("tab", { name, exact: true })).toBeInViewport();
      await expect(page.getByRole("tabpanel")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await basic.click();
    await page.screenshot({
      path: testInfo.outputPath("settings-mobile.png"),
      fullPage: true,
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width: 1440, height: 1080 });
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(25, 24, 29)",
    );
    await page.screenshot({
      path: testInfo.outputPath("settings-dark.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

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
  const extensionPath = process.env.IMT_E2E_EXTENSION_PATH;
  const testRoot = process.env.IMT_E2E_ROOT;
  if (!extensionPath || !testRoot)
    throw new Error(
      "Run browser tests with pnpm e2e to create an isolated build.",
    );
  const userDataDir =
    profileDirectory ??
    path.join(
      testRoot,
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
        input: {
          enabled: false,
          trigger: "//",
          ...((configPatch.input as Record<string, unknown> | undefined) ?? {}),
        },
        subtitle: {
          ...(config.subtitle as Record<string, unknown>),
          youtube: false,
          ...((configPatch.subtitle as Record<string, unknown> | undefined) ??
            {}),
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

test("updates translation font size from settings without changing the source", async ({
  playwright,
}, testInfo) => {
  const { context, worker, extensionId } = await launchExtension(playwright);
  try {
    await selectMockService(worker, { uiLanguage: "zh-CN" });
    const article = await context.newPage();
    await article.goto(`${origin}/article.html`);
    const sourceSize = await article
      .locator("#first")
      .evaluate((el) => getComputedStyle(el).fontSize);
    await article.evaluate(() => {
      const heading = document.createElement("h1");
      heading.id = "scaling-title";
      heading.textContent = "A larger heading for translation scaling";
      heading.style.fontSize = "32px";
      document.querySelector("article")!.prepend(heading);
    });
    await expect
      .poll(() => contentState(worker))
      .toMatchObject({ ready: true });
    await expect.poll(() => toggleActivePage(worker)).toBe(true);
    const target = article.locator("#first font[data-imt='target']");
    await expect(target).toContainText("[zh]");
    const settings = await context.newPage();
    await settings.goto(`chrome-extension://${extensionId}/options.html`);
    const size = settings.getByLabel("译文字号缩放", { exact: true });
    const headingTarget = article.locator(
      "#scaling-title font[data-imt='target']",
    );
    await expect(size).toHaveValue("100%");
    await size.selectOption("150%");
    await expect(target).toHaveCSS(
      "font-size",
      `${parseFloat(sourceSize) * 1.5}px`,
    );
    await expect(headingTarget).toHaveCSS("font-size", "48px");
    await expect(article.locator("#scaling-title")).toHaveCSS(
      "font-size",
      "32px",
    );
    await expect(article.locator("#first")).toHaveCSS("font-size", sourceSize);
    await expect(settings.getByText("这是译文样式预览")).toHaveAttribute(
      "style",
      /font-size: 150%/,
    );
    await settings.reload();
    await expect(size).toHaveValue("150%");
    await settings.screenshot({
      path: testInfo.outputPath("translation-font-size.png"),
      fullPage: true,
    });
    await article.screenshot({
      path: testInfo.outputPath("translation-font-size-page.png"),
      fullPage: true,
    });
    await size.selectOption("75%");
    await expect(target).toHaveCSS(
      "font-size",
      `${parseFloat(sourceSize) * 0.75}px`,
    );
    await expect(headingTarget).toHaveCSS("font-size", "24px");
    await size.selectOption("100%");
    await expect(target).toHaveCSS("font-size", sourceSize);
    await expect(headingTarget).toHaveCSS("font-size", "32px");
    await expect(article.locator("#first")).toHaveCSS("font-size", sourceSize);
    await settings.getByRole("tab", { name: "翻译服务", exact: true }).click();
    await settings
      .getByLabel("选择服务", { exact: true })
      .selectOption("chatgpt");
    await expect(
      settings.locator('#chatgpt-model-models option[value="gpt-6.1-sol"]'),
    ).toHaveCount(1);
    await expect(
      settings.getByRole("button", { name: "刷新模型列表" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("exports a weekly archive from a background alarm without a webpage", async ({
  playwright,
}) => {
  const { context, worker, extensionId } = await launchExtension(playwright);
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
    expect(
      completed.folder!.startsWith(process.env.IMT_E2E_ARCHIVE_DIR + path.sep),
    ).toBe(true);
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
  }
});

test("preserves first save timestamps under concurrent saves and handles legacy records", async ({
  playwright,
}) => {
  const { context, extensionId } = await launchExtension(playwright);
  try {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html#data`);
    const result = await page.evaluate(async () => {
      const api = (globalThis as unknown as ExtensionWorkerGlobal).chrome;
      const record = {
        url: "https://example.com/timestamps",
        title: "Timestamps",
        paragraph_id: "p-1",
        paragraph_index: 0,
        source_text: "Original",
        translated_text: "译文",
        source_language: "en",
        target_language: "zh-CN",
        requested_service: "mock",
      };
      const save = () =>
        api.runtime.sendMessage({ type: "saveTranslationHistory", record });
      const exported = async () => {
        const file = (await api.runtime.sendMessage({
          type: "exportTranslationHistory",
          format: "jsonl",
        })) as { text: string };
        return JSON.parse(file.text.trim()) as Record<string, unknown>;
      };
      await save();
      const first = await exported();
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("bilingual-translator-history", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const put = (value: Record<string, unknown>) =>
        new Promise<void>((resolve, reject) => {
          const transaction = database.transaction("records", "readwrite");
          transaction.objectStore("records").put(value);
          transaction.oncomplete = () => resolve();
          transaction.onabort = () => reject(transaction.error);
        });
      try {
        await put({ ...first, first_saved_at: "2025-01-01T00:00:00.000Z" });
        await Promise.all(Array.from({ length: 8 }, save));
        const repeated = await exported();
        const legacy: Record<string, unknown> = {
          ...repeated,
          saved_at: "2025-02-01T00:00:00.000Z",
        };
        delete legacy.first_saved_at;
        delete legacy.last_seen_at;
        await put(legacy);
        const legacyExport = await exported();
        await save();
        return { first, repeated, legacyExport, updated: await exported() };
      } finally {
        database.close();
      }
    });
    expect(result.first.first_saved_at).toBe(result.first.saved_at);
    expect(result.first.last_seen_at).toBe(result.first.saved_at);
    expect(result.repeated.first_saved_at).toBe("2025-01-01T00:00:00.000Z");
    expect(result.repeated.last_seen_at).toBe(result.repeated.saved_at);
    expect(result.legacyExport.first_saved_at).toBeNull();
    expect(result.legacyExport.last_seen_at).toBe("2025-02-01T00:00:00.000Z");
    expect(result.updated.first_saved_at).toBeNull();
    expect(result.updated.last_seen_at).not.toBe(
      result.legacyExport.last_seen_at,
    );
    expect(result.updated.id).toBe(result.first.id);
  } finally {
    await context.close();
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
