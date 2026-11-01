import { crx, type ManifestV3Export } from "@crxjs/vite-plugin";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { defineConfig, type Plugin } from "vite";

import chromeManifest from "./src/manifest.ts";

export function transformSafariManifest(source: Record<string, unknown>) {
  const manifest = { ...source };
  delete manifest.side_panel;
  delete manifest.browser_specific_settings;
  manifest.permissions = [
    ...(source.permissions as string[]).filter(
      (permission) => permission !== "sidePanel" && permission !== "webRequest",
    ),
    "unlimitedStorage",
  ];
  // Let CRX bundle the background entry; wrap its module loader below for Safari.
  const background = source.background as { service_worker: string };
  manifest.background = {
    scripts: [background.service_worker],
    persistent: false,
  };
  manifest.icons = {
    "128": "icons/safari-128.png",
    "512": "icons/safari-512.png",
  };
  return manifest;
}

export default defineConfig(async (env) => {
  const source = await (typeof chromeManifest === "function"
    ? chromeManifest(env)
    : chromeManifest);
  return {
    plugins: [
      crx({
        browser: "firefox",
        manifest: transformSafariManifest(
          source as unknown as Record<string, unknown>,
        ) as unknown as ManifestV3Export,
      }),
      {
        name: "safari-manifest",
        async writeBundle(options) {
          const path = `${options.dir}/manifest.json`;
          const manifest = JSON.parse(await readFile(path, "utf8"));
          const scripts = manifest.background.scripts as string[];
          await writeFile(
            `${options.dir}/background.html`,
            `<!doctype html><meta charset="utf-8">${scripts.map((script) => `<script type="module" src="${script}"></script>`).join("")}\n`,
          );
          // MV3 background pages are nonpersistent by definition in Safari.
          manifest.background = { page: "background.html" };
          for (const resource of manifest.web_accessible_resources ?? []) {
            delete resource.use_dynamic_url;
          }
          await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
        },
      } satisfies Plugin,
    ],
    build: {
      outDir: "dist-safari",
      rollupOptions: {
        input: {
          pdf: fileURLToPath(new URL("./src/pdf/index.html", import.meta.url)),
          subtitleFile: fileURLToPath(
            new URL("./src/subtitle-file/index.html", import.meta.url),
          ),
          sidePanel: fileURLToPath(
            new URL("./src/ui/sidepanel/index.html", import.meta.url),
          ),
        },
      },
    },
  };
});
