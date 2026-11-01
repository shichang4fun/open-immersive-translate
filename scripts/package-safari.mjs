import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import console from "node:console";
import path from "node:path";

if (process.platform !== "darwin") {
  throw new Error(
    "Packaging Safari requires macOS and Xcode. Use pnpm build:safari for web assets.",
  );
}

const root = fileURLToPath(new URL("..", import.meta.url));
const name = "Bilingual Translator";
const output = path.join(root, "build-safari");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("pnpm", ["build:safari"]);
run("xcrun", [
  "safari-web-extension-converter",
  path.join(root, "dist-safari"),
  "--project-location",
  path.join(output, "project"),
  "--app-name",
  name,
  "--bundle-identifier",
  "com.shichang4fun.Bilingual-Translator",
  "--macos-only",
  "--swift",
  "--copy-resources",
  "--no-open",
  "--no-prompt",
  "--force",
]);
run("xcodebuild", [
  "-project",
  path.join(output, "project", name, `${name}.xcodeproj`),
  "-scheme",
  name,
  "-configuration",
  "Release",
  "-derivedDataPath",
  path.join(output, "DerivedData"),
  "MACOSX_DEPLOYMENT_TARGET=12.0",
  "CODE_SIGN_STYLE=Manual",
  `CODE_SIGN_IDENTITY=${process.env.SAFARI_SIGN_IDENTITY || "-"}`,
  ...(process.env.SAFARI_DEVELOPMENT_TEAM
    ? [`DEVELOPMENT_TEAM=${process.env.SAFARI_DEVELOPMENT_TEAM}`]
    : []),
  "build",
]);
console.log(
  `Safari app: ${path.join(output, "DerivedData", "Build", "Products", "Release", `${name}.app`)}`,
);
