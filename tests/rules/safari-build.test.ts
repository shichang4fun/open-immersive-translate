import { describe, expect, it } from "vitest";
import { transformSafariManifest } from "../../vite.safari.config";

describe("Safari manifest", () => {
  it("omits desktop-only menus and shortcuts on iPhone", () => {
    const source = {
      permissions: ["storage", "contextMenus", "sidePanel", "webRequest"],
      commands: { translate: { description: "Translate" } },
      background: { service_worker: "worker.ts" },
    };
    const manifest = transformSafariManifest(source, true);
    expect(manifest.permissions).toEqual(["storage", "unlimitedStorage"]);
    expect(manifest).not.toHaveProperty("commands");
    expect(source.commands).toHaveProperty("translate");
  });
  it("removes unsupported Chrome features before bundling the background entry", () => {
    const source = {
      manifest_version: 3,
      permissions: ["storage", "sidePanel", "webRequest", "scripting"],
      background: { service_worker: "worker.ts", type: "module" },
      side_panel: { default_path: "sidepanel.html" },
    };
    const manifest = transformSafariManifest(source);
    expect(manifest.permissions).toEqual([
      "storage",
      "scripting",
      "unlimitedStorage",
    ]);
    expect(manifest.background).toEqual({
      scripts: ["worker.ts"],
      persistent: false,
    });
    expect(manifest).not.toHaveProperty("side_panel");
    expect(source.permissions).toContain("sidePanel");
    expect(source.background.type).toBe("module");
  });
});
