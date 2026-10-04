import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { startArchiveServer } from "./local-archive-server.mjs";

// Hold an OS-assigned port throughout build and tests; never use the personal daemon.
const root = await mkdtemp(path.join(tmpdir(), "imt-e2e-"));
const token = randomBytes(32).toString("hex");
const companion = startArchiveServer({
  token,
  directory: path.join(root, "archives"),
  port: 0,
});

async function run(args, env) {
  const child = spawn("pnpm", args, { env, stdio: "inherit" });
  const interrupt = () => child.kill("SIGINT");
  const terminate = () => child.kill("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    return await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

try {
  await new Promise((resolve, reject) => {
    companion.once("listening", resolve);
    companion.once("error", reject);
  });
  const address = companion.address();
  const env = {
    ...process.env,
    VITE_LOCAL_ARCHIVE_TOKEN: token,
    VITE_LOCAL_ARCHIVE_PORT: String(address.port),
    IMT_E2E_ROOT: root,
    IMT_E2E_EXTENSION_PATH: path.join(root, "dist"),
    IMT_E2E_ARCHIVE_DIR: path.join(root, "archives"),
  };
  const build = await run(
    ["exec", "vite", "build", "--outDir", env.IMT_E2E_EXTENSION_PATH],
    env,
  );
  process.exitCode =
    build ||
    (await run(["exec", "playwright", "test", ...process.argv.slice(2)], env));
} finally {
  companion.closeAllConnections();
  await new Promise((resolve) => companion.close(resolve));
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
}
