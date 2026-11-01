import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";

const root = fileURLToPath(new URL("..", import.meta.url));
function run(command, args) {
  // Distribution builds must never embed the maintainer's private archive token.
  const env = { ...process.env };
  delete env.VITE_LOCAL_ARCHIVE_TOKEN;
  delete env.VITE_LOCAL_ARCHIVE_PORT;
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run("pnpm", ["build:safari:ios"]);
run("xcodegen", ["generate", "--spec", "native/ios/project.yml"]);
if (process.argv.includes("--archive")) {
  run("xcodebuild", [
    "-project",
    "native/ios/BilingualTranslator.xcodeproj",
    "-scheme",
    "BilingualTranslator",
    "-configuration",
    "Release",
    "-destination",
    "generic/platform=iOS",
    "-archivePath",
    "build-safari-ios/BilingualTranslator.xcarchive",
    "-allowProvisioningUpdates",
    ...(process.env.SAFARI_DEVELOPMENT_TEAM
      ? ["DEVELOPMENT_TEAM=" + process.env.SAFARI_DEVELOPMENT_TEAM]
      : []),
    "archive",
  ]);
}
