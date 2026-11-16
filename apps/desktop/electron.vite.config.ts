import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { fileSecretStore } from "./src/main/ai/fileSecrets";
import { handleAiRequest } from "./src/main/ai/httpHost";
import { configureAiSecrets } from "./src/main/ai/secretAccess";

function readBody(req: IncomingMessage, limit = 1_000_000): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("AI request is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Dev-only stand-in for Electron IPC. The preview has no preload, so the
 * renderer talks to this host the way T3 Code's web client talks to its server.
 */
function intrayAiDevHost(): Plugin {
  configureAiSecrets(fileSecretStore());
  return {
    name: "intray-ai-dev-host",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const raw = req.url ?? "";
        if (!raw.startsWith("/__intray/ai/")) {
          next();
          return;
        }
        const url = new URL(raw, "http://127.0.0.1");
        try {
          const text = req.method === "GET" ? "" : await readBody(req);
          let body: unknown = undefined;
          if (text) body = JSON.parse(text) as unknown;
          const result = await handleAiRequest({
            method: req.method ?? "GET",
            pathname: url.pathname,
            body,
          });
          const out = res as ServerResponse;
          out.statusCode = result.status;
          out.setHeader("Content-Type", "application/json");
          out.end(JSON.stringify(result.body));
        } catch (error) {
          const out = res as ServerResponse;
          out.statusCode = 400;
          out.setHeader("Content-Type", "application/json");
          out.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : "Bad AI request",
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer"),
      },
    },
    plugins: [react(), intrayAiDevHost()],
  },
});
