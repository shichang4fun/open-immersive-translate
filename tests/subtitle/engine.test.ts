import { describe, expect, it, vi } from "vitest";

import {
  batchCueSentences,
  SubtitleEngine,
  MAX_DISPLAY_CHARS,
  MAX_DISPLAY_SECONDS,
} from "../../src/content/features/subtitle/engine";
import type { FeatureContext } from "../../src/content/features/context";

function context(translateText = vi.fn(async (text: string) => `译:${text}`)) {
  return {
    config: { sourceLanguage: "en", targetLanguage: "zh-CN" },
    translateText,
  } as unknown as Pick<FeatureContext, "config" | "translateText">;
}

describe("SubtitleEngine", () => {
  it("joins cues at sentence boundaries and enforces cue and character limits", () => {
    const sentences = batchCueSentences([
      { start: 0, end: 1, text: "Hello" },
      { start: 1, end: 2, text: "world." },
      { start: 2, end: 3, text: "Next!" },
    ]);
    expect(sentences.map((cue) => cue.text)).toEqual(["Hello world.", "Next!"]);

    const many = batchCueSentences(
      Array.from({ length: 51 }, (_, index) => ({
        start: index,
        end: index + 0.5,
        text: "word",
      })),
    );
    expect(many.length).toBeGreaterThan(2);
    expect(
      many.every((cue) => cue.end - cue.start <= MAX_DISPLAY_SECONDS),
    ).toBe(true);
    expect(
      batchCueSentences([{ start: 0, end: 1, text: "a".repeat(4001) }]),
    ).toHaveLength(Math.ceil(4001 / MAX_DISPLAY_CHARS));
  });

  it("keeps unpunctuated automatic captions short without filling silent gaps", () => {
    const input = Array.from({ length: 50 }, (_, index) => ({
      start: index * 2,
      end: index * 2 + 2,
      text: `caption ${index} has no sentence ending punctuation`,
    }));
    const output = batchCueSentences(input);
    expect(output.every((cue) => cue.text.length <= MAX_DISPLAY_CHARS)).toBe(
      true,
    );
    expect(
      output.every((cue) => cue.end - cue.start <= MAX_DISPLAY_SECONDS),
    ).toBe(true);
    expect(output.map((cue) => cue.text).join(" ")).toBe(
      input.map((cue) => cue.text).join(" "),
    );
    expect(
      batchCueSentences([
        { start: 0, end: 1, text: "before" },
        { start: 10, end: 11, text: "after" },
      ]),
    ).toHaveLength(2);
  });

  it("stops queued translation batches and ignores late results after disposal", async () => {
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((done) => {
      resolve = done;
    });
    const translateText = vi.fn(() => pending);
    const engine = new SubtitleEngine(context(translateText));
    const listener = vi.fn();
    engine.subscribe(listener);
    const loaded = engine.load(
      Array.from({ length: 80 }, (_, i) => ({
        start: i,
        end: i + 1,
        text: `Sentence ${i}.`,
      })),
    );
    expect(translateText).toHaveBeenCalledTimes(50);
    engine.dispose();
    listener.mockClear();
    resolve("译文");
    await loaded;
    await engine.updateCurrentTime(65);
    expect(translateText).toHaveBeenCalledTimes(50);
    expect(listener).not.toHaveBeenCalled();
  });

  it("pre-translates the whole track and reuses in-flight cache entries", async () => {
    const translateText = vi.fn(async (text: string) => `译:${text}`);
    const engine = new SubtitleEngine(context(translateText), {
      preTranslation: true,
    });
    await engine.load([
      { start: 0, end: 1, text: "Repeat." },
      { start: 2, end: 3, text: "Repeat." },
    ]);
    expect(engine.bilingualCues.map((cue) => cue.translation)).toEqual([
      "译:Repeat.",
      "译:Repeat.",
    ]);
    expect(translateText).toHaveBeenCalledTimes(1);
  });

  it("translates only the rolling window until pre-translation is enabled", async () => {
    const translateText = vi.fn(async (text: string) => `译:${text}`);
    const engine = new SubtitleEngine(context(translateText), {
      preTranslation: false,
      rollingWindowSeconds: 10,
    });
    await engine.load([
      { start: 0, end: 2, text: "Now." },
      { start: 8, end: 10, text: "Soon." },
      { start: 30, end: 32, text: "Later." },
    ]);
    expect(translateText).not.toHaveBeenCalled();
    await engine.updateCurrentTime(1);
    expect(engine.bilingualCues.map((cue) => cue.translation)).toEqual([
      "译:Now.",
      "译:Soon.",
      undefined,
    ]);
    await engine.setPreTranslation(true);
    expect(engine.bilingualCues[2].translation).toBe("译:Later.");
    expect(engine.activeCue(31)?.text).toBe("Later.");
  });
});
