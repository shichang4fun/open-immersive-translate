import { crx, type ManifestV3Export } from "@crxjs/vite-plugin";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { build as viteBuild, defineConfig, type Plugin } from "vite";

import chromeManifest from "./src/manifest.ts";

export function transformSafariManifest(
  source: Record<string, unknown>,
  ios = false,
) {
  const manifest = { ...source };
  delete manifest.side_panel;
  delete manifest.browser_specific_settings;
  manifest.permissions = [
    ...(source.permissions as string[]).filter(
      (permission) =>
        permission !== "sidePanel" &&
        permission !== "webRequest" &&
        (!ios || permission !== "contextMenus"),
    ),
    "unlimitedStorage",
  ];
  // Let CRX resolve the entry; emit a synchronous classic bundle below for Safari.
  const background = source.background as { service_worker: string };
  manifest.background = {
    scripts: [background.service_worker],
    persistent: false,
  };
  manifest.icons = {
    "128": "icons/safari-128.png",
    "512": "icons/safari-512.png",
  };
  if (ios) delete manifest.commands;
  return manifest;
}

export default defineConfig(async (env) => {
  const ios = env.mode === "ios";
  const define = {
    "import.meta.env.VITE_SAFARI_PLATFORM": JSON.stringify(
      ios ? "ios" : "macos",
    ),
    ...(ios
      ? {
          "import.meta.env.VITE_LOCAL_ARCHIVE_TOKEN": JSON.stringify(""),
          "import.meta.env.VITE_LOCAL_ARCHIVE_PORT": JSON.stringify(""),
        }
      : {}),
  };
  const source = await (typeof chromeManifest === "function"
    ? chromeManifest(env)
    : chromeManifest);
  return {
    define,
    plugins: [
      crx({
        browser: "firefox",
        manifest: transformSafariManifest(
          source as unknown as Record<string, unknown>,
          ios,
        ) as unknown as ManifestV3Export,
      }),
      {
        name: "safari-manifest",
        async writeBundle(options) {
          const path = `${options.dir}/manifest.json`;
          const manifest = JSON.parse(await readFile(path, "utf8"));
          // Safari must register onConnect synchronously when its event page
          // wakes. A module script in background.html can miss that first event.
          await viteBuild({
            configFile: false,
            mode: env.mode,
            define,
            logLevel: "warn",
            build: {
              outDir: options.dir,
              emptyOutDir: false,
              lib: {
                entry: fileURLToPath(
                  new URL("./src/background/worker.ts", import.meta.url),
                ),
                formats: ["iife"],
                name: "BilingualTranslatorBackground",
                fileName: () => "background.js",
              },
            },
          });
          await writeFile(
            `${options.dir}/background.html`,
            '<!doctype html><meta charset="utf-8"><script src="background.js"></script>\n',
          );
          // App Store validation requires this flag explicitly on iOS/iPadOS.
          manifest.background = {
            page: "background.html",
            ...(ios ? { persistent: false } : {}),
          };
          for (const resource of manifest.web_accessible_resources ?? []) {
            delete resource.use_dynamic_url;
          }
          await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
        },
      } satisfies Plugin,
    ],
    build: {
      outDir: ios ? "dist-safari-ios" : "dist-safari",
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
