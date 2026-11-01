/** Set only by the dedicated Safari iPhone/iPad build. */
export function isIOSBuild(): boolean {
  return import.meta.env.VITE_SAFARI_PLATFORM === "ios";
}
