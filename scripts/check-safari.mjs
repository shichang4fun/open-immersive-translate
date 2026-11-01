import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import { URL } from "node:url";
import console from "node:console";

const root = new URL("../dist-safari/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("manifest.json", root), "utf8"),
);
assert.deepEqual(manifest.background, { page: "background.html" });
const background = await readFile(new URL("background.html", root), "utf8");
assert(background.includes('charset="utf-8"'));
assert(background.includes('<script src="background.js"></script>'));
assert(!background.includes('type="module"'));
assert(!manifest.permissions.includes("sidePanel"));
assert(!manifest.permissions.includes("webRequest"));
assert(!("side_panel" in manifest));
for (const resource of manifest.web_accessible_resources) {
  assert(!("use_dynamic_url" in resource));
}
// Parse as a classic script: static imports/exports would fail on cold wake.
new Script(await readFile(new URL("background.js", root), "utf8"));
for (const entry of [
  manifest.action.default_popup,
  manifest.options_page,
  ...Object.values(manifest.icons),
  ...manifest.content_scripts.flatMap((script) => script.js),
]) {
  await readFile(new URL(entry, root));
}
console.log(
  "Safari manifest, entry files and synchronous background bundle verified.",
);
