/** Offline suggestions; the signed-in account catalog takes precedence. */
export const CHATGPT_FALLBACK_MODELS = [
  "gpt-6.1-sol",
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
] as const;

export const DEFAULT_CHATGPT_MODEL = "gpt-6-luna";
