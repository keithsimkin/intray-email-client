import { describe, expect, test } from "bun:test";
import { spawn, type spawn as Spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  CursorAcpClient,
  CursorAcpError,
  cursorAcpShouldFallback,
} from "../src/main/ai/cursorAcp";

const fixture = fileURLToPath(
  new URL("./fixtures/fake-acp-server.mjs", import.meta.url),
);

function launch() {
  return { command: process.execPath, args: [fixture] };
}

describe("cursor agent keep-alive", () => {
  test("reuses one process and refuses tool access", async () => {
    let spawns = 0;
    const spawnImpl: typeof Spawn = ((command, args, options) => {
      spawns += 1;
      expect(options?.shell).toBe(false);
      return spawn(command, args, options);
    }) as typeof Spawn;
    const client = new CursorAcpClient(spawnImpl);
    try {
      const [first, second] = await Promise.all([
        client.complete({ launch: launch(), prompt: "Summarize today" }),
        client.complete({ launch: launch(), prompt: "Draft a short reply" }),
      ]);
      expect(spawns).toBe(1);
      expect(first).toMatch(/^pid:\d+$/);
      expect(second).toBe(first);
      expect(first).not.toContain("bad-permission");
    } finally {
      client.stop();
    }
  });

  test("usage limit stays on the open process and does not fall back", async () => {
    const client = new CursorAcpClient();
    try {
      await expect(
        client.complete({ launch: launch(), prompt: "LIMIT check" }),
      ).rejects.toThrow(/Weekly usage limit reached\. It resets in 3 days\./);
      const again = await client.complete({
        launch: launch(),
        prompt: "Still there",
      });
      expect(again).toMatch(/^pid:\d+$/);
    } finally {
      client.stop();
    }
  });

  test("a usage-limit failure is not sent through a second process", () => {
    const error = new CursorAcpError(
      "Weekly usage limit reached. It resets in 3 days.",
      false,
    );
    expect(cursorAcpShouldFallback(error)).toBe(false);
    expect(cursorAcpShouldFallback(new Error("Timed out"))).toBe(true);
  });
});
