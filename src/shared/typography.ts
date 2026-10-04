/** Legacy bare numbers are pixel sizes; CSS units remain supported. */
export function translationFontSize(
  value: string | number | undefined,
): string | undefined {
  if (value === undefined || String(value).trim() === "") return undefined;
  const text = String(value).trim();
  return /^\d+(?:\.\d+)?$/.test(text) ? `${text}px` : text;
}
