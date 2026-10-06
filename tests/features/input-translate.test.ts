import { afterEach, describe, expect, it, vi } from "vitest";

import type { FeatureContext } from "../../src/content/features/context";
import {
  init,
  isTripleSpaceTrigger,
  parseTranslationInput,
  resolveAutoTargetLanguage,
} from "../../src/content/features/input-translate";

function context(
  translateText = vi.fn().mockResolvedValue("translated"),
): FeatureContext {
  return {
    config: {
      sourceLanguage: "auto",
      input: { enabled: true },
    } as FeatureContext["config"],
    rule: { matches: ["<all_urls>"] },
    translateText,
    translateParagraph: vi.fn(),
    toggleTranslate: vi.fn(),
    isTranslated: vi.fn(),
  };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("input translation", () => {
  const bar = () => document.querySelector('[data-imt="input-target"]');
  const edit = (field: HTMLTextAreaElement, value: string) => {
    field.value = value;
    field.dispatchEvent(new InputEvent("input", { bubbles: true }));
  };

  it("does not show a language bar during ordinary typing or trailing spaces", () => {
    const input = document.createElement("textarea");
    document.body.append(input);
    const translateText = vi.fn();
    const dispose = init(context(translateText));
    for (const value of ["hello", "hello world", "/", "/usr/local/bin"]) {
      edit(input, value);
      input.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: " " }),
      );
      expect(bar()).toBeNull();
    }
    expect(translateText).not.toHaveBeenCalled();
    dispose();
  });

  it.each([
    '<input type="search">',
    '<input role="searchbox">',
    '<form role="search"><input></form>',
    '<input data-testid="SearchBox_Search_Input">',
    '<input type="password">',
    '<input type="email">',
    '<input type="number">',
    "<input readonly>",
    "<input disabled>",
  ])("ignores search and non-editable text fields: %s", (markup) => {
    document.body.innerHTML = markup;
    const input = document.querySelector("input")!;
    const translateText = vi.fn();
    const dispose = init(context(translateText));
    input.value = "//hello";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const enter = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    input.value = "hello  ";
    for (let i = 0; i < 3; i++) {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: " " }),
      );
    }
    expect(bar()).toBeNull();
    expect(translateText).not.toHaveBeenCalled();
    dispose();
  });

  it("keeps the language selection usable and applies it to the translation", async () => {
    const input = document.createElement("textarea");
    document.body.append(input);
    input.focus();
    const translateText = vi.fn().mockResolvedValue("bonjour");
    const dispose = init(context(translateText));
    edit(input, "//hello");
    const select = bar()!.shadowRoot!.querySelector("select")!;
    edit(input, "//hello world");
    expect(bar()!.shadowRoot!.querySelector("select")).toBe(select);
    select.focus();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bar()).not.toBeNull();
    select.value = "ja";
    select.dispatchEvent(new Event("change"));
    expect(document.activeElement).toBe(input);
    expect(bar()).toBeNull();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );
    await vi.waitFor(() => expect(input.value).toBe("bonjour"));
    expect(translateText).toHaveBeenCalledWith("hello world", "auto", "ja");
    dispose();
  });

  it("dismisses a language bar on Escape, prefix removal, scroll, resize, outside click and disposal", () => {
    const input = document.createElement("textarea");
    document.body.append(input);
    const dispose = init(context());
    const show = () => {
      edit(input, "/en hello");
      expect(bar()).not.toBeNull();
    };
    show();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
    );
    expect(bar()).toBeNull();
    show();
    edit(input, "hello");
    expect(bar()).toBeNull();
    show();
    document.body.dispatchEvent(new Event("scroll"));
    expect(bar()).toBeNull();
    show();
    window.dispatchEvent(new Event("resize"));
    expect(bar()).toBeNull();
    show();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(bar()).toBeNull();
    show();
    dispose();
    expect(bar()).toBeNull();
    edit(input, "//hello");
    expect(bar()).toBeNull();
  });

  it("dismisses the bar after focus leaves both the editor and the selector", async () => {
    const input = document.createElement("textarea");
    const outside = document.createElement("button");
    document.body.append(input, outside);
    const dispose = init(context());
    input.focus();
    edit(input, "//hello");
    bar()!.shadowRoot!.querySelector("select")!.focus();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(bar()).not.toBeNull();
    outside.focus();
    await vi.waitFor(() => expect(bar()).toBeNull());
    dispose();
  });

  it("continues to translate contenteditable composers", async () => {
    const input = document.createElement("div");
    input.setAttribute("contenteditable", "true");
    input.textContent = "//hello";
    document.body.append(input);
    const translateText = vi.fn().mockResolvedValue("你好");
    const dispose = init(context(translateText));
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(bar()).not.toBeNull();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );
    await vi.waitFor(() => expect(input.textContent).toBe("你好"));
    dispose();
  });

  it("parses an optional language prefix", () => {
    expect(parseTranslationInput("/en 你好", "fr")).toEqual({
      text: "你好",
      targetLanguage: "en",
    });
    expect(parseTranslationInput("//bonjour", "fr")).toEqual({
      text: "bonjour",
      targetLanguage: "fr",
    });
  });

  it("detects three spaces only inside the 1.5 second window", () => {
    expect(isTripleSpaceTrigger([0, 700, 1_500])).toBe(true);
    expect(isTripleSpaceTrigger([0, 700, 1_501])).toBe(false);
  });

  it("translates a double-slash command on Enter", async () => {
    const input = document.createElement("input");
    input.value = "//hello";
    document.body.append(input);
    const translateText = vi.fn().mockResolvedValue("hola");
    const dispose = init(context(translateText));

    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );

    await vi.waitFor(() => expect(input.value).toBe("hola"));
    expect(translateText).toHaveBeenCalledWith("hello", "auto", "en");
    dispose();
  });

  it("triggers on three consecutive trailing spaces", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const input = document.createElement("textarea");
    input.value = "hello";
    document.body.append(input);
    const translateText = vi.fn().mockResolvedValue("bonjour");
    const dispose = init(context(translateText));

    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: " " }),
    );
    input.value = "hello ";
    vi.advanceTimersByTime(500);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: " " }),
    );
    input.value = "hello  ";
    vi.advanceTimersByTime(500);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: " " }),
    );
    await Promise.resolve();

    expect(translateText).toHaveBeenCalledWith("hello", "auto", "en");
    expect(input.value).toBe("bonjour");
    dispose();
  });

  it("asks before translating more than 200 characters", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const translateText = vi.fn().mockResolvedValue("unused");
    const input = document.createElement("textarea");
    input.value = `//${"a".repeat(201)}`;
    document.body.append(input);
    const dispose = init(context(translateText));

    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );

    expect(confirm).toHaveBeenCalledOnce();
    expect(translateText).not.toHaveBeenCalled();
    expect(input.disabled).toBe(false);
    dispose();
  });

  it("resolves configurable aliases and automatic Chinese/English targets", async () => {
    expect(
      parseTranslationInput("/jp こんにちは", "en", { ja: ["jp"] }),
    ).toEqual({ text: "こんにちは", targetLanguage: "ja" });
    expect(resolveAutoTargetLanguage("你好")).toBe("en");
    expect(resolveAutoTargetLanguage("hello")).toBe("zh-CN");

    const input = document.createElement("textarea");
    input.value = "//你好";
    document.body.append(input);
    const translateText = vi.fn().mockResolvedValue("hello");
    const dispose = init({
      ...context(translateText),
      config: {
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
        input: { enabled: true, autoTargetLanguage: true },
      } as unknown as FeatureContext["config"],
    });
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(document.querySelector('[data-imt="input-target"]')).not.toBeNull();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );
    await vi.waitFor(() => expect(input.value).toBe("hello"));
    expect(translateText).toHaveBeenCalledWith("你好", "auto", "en");
    dispose();
  });

  it("uses a configurable trailing key, repeat count, and timeout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const input = document.createElement("input");
    input.value = "hello";
    document.body.append(input);
    const translateText = vi.fn().mockResolvedValue("你好");
    const dispose = init({
      ...context(translateText),
      config: {
        sourceLanguage: "auto",
        input: {
          enabled: true,
          triggerMode: "trailing",
          trailingTriggerKey: ".",
          trailingTriggerCount: 2,
          trailingTriggerTimeoutMs: 500,
        },
      } as unknown as FeatureContext["config"],
    });
    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "." }),
    );
    input.value = "hello.";
    vi.advanceTimersByTime(300);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "." }),
    );
    await Promise.resolve();

    expect(translateText).toHaveBeenCalledWith("hello", "auto", "en");
    dispose();
  });
});
