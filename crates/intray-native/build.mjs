import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const out = fs.mkdtempSync(path.join(os.tmpdir(), "intray-native-"));

function resolveNapiBin() {
  const local = path.join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "napi.exe" : "napi",
  );
  if (fs.existsSync(local)) return local;
  const viaCli = path.join(root, "node_modules", "@napi-rs", "cli", "dist", "cli.js");
  if (fs.existsSync(viaCli)) return viaCli;
  return process.platform === "win32" ? "napi.exe" : "napi";
}

/**
 * napi-rs v3 commits artifacts via directory rename. On Windows that EPERMs
 * when the package lives under a watched tree (Cursor / Defender / indexer).
 * Build into TEMP, then copy the bindings back.
 */
const napiBin = resolveNapiBin();
const result = spawnSync(
  napiBin.endsWith(".js") ? process.execPath : napiBin,
  [
    ...(napiBin.endsWith(".js") ? [napiBin] : []),
    "build",
    "--platform",
    "--release",
    "--output-dir",
    out,
  ],
  { cwd: root, stdio: "inherit" },
);

if (result.status !== 0) {
  fs.rmSync(out, { recursive: true, force: true });
  process.exit(result.status ?? 1);
}

for (const name of fs.readdirSync(out)) {
  fs.copyFileSync(path.join(out, name), path.join(root, name));
}

fs.rmSync(out, { recursive: true, force: true });
