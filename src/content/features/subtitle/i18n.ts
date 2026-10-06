export type SubtitleLocale = "zh-CN" | "en";

const zhCN = {
  experimental: "实验性字幕适配",
  bilingual: "双语",
  toggleLabel: "双语字幕（Open Immersive Translate）",
  turnOn: "开启双语字幕 · Open Immersive Translate",
  turnOff: "关闭双语字幕 · Open Immersive Translate",
  saveFailed: "字幕设置保存失败，请重试",
} as const;

type SubtitleI18nKey = keyof typeof zhCN;

const en: Record<SubtitleI18nKey, string> = {
  experimental: "Experimental subtitle adapter",
  bilingual: "Bilingual",
  toggleLabel: "Bilingual subtitles (Open Immersive Translate)",
  turnOn: "Turn on bilingual subtitles · Open Immersive Translate",
  turnOff: "Turn off bilingual subtitles · Open Immersive Translate",
  saveFailed: "Could not save subtitle settings. Try again.",
};

export function subtitleLocale(language = navigator.language): SubtitleLocale {
  return language.toLowerCase().startsWith("en") ? "en" : "zh-CN";
}

export function subtitleText(
  key: SubtitleI18nKey,
  locale = subtitleLocale(),
): string {
  return { "zh-CN": zhCN, en }[locale]?.[key] ?? en[key];
}
