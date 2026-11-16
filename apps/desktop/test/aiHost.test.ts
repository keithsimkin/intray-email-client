import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileSecretStore } from "../src/main/ai/fileSecrets";
import { handleAiRequest } from "../src/main/ai/httpHost";
import { commandForSpawn, pickLiveModel } from "../src/main/ai/bridge";
import { configureAiSecrets } from "../src/main/ai/secretAccess";

describe("pickLiveModel", () => {
  test("keeps an explicit id and otherwise uses the first reported model", () => {
    const listed = [{ id: "auto" }, { id: "composer-2" }, { id: "gpt-5" }];
    expect(pickLiveModel("composer-2", listed)).toBe("composer-2");
    expect(pickLiveModel("  ", listed)).toBe("composer-2");
    expect(pickLiveModel(undefined, [{ id: "auto" }])).toBeUndefined();
    expect(pickLiveModel(undefined, [])).toBeUndefined();
  });
});

describe("commandForSpawn", () => {
  test("does not hand a spaced Windows path to cmd.exe", () => {
    const launched = commandForSpawn(
      "C:\\Users\\CORE i5\\AppData\\Local\\cursor-agent\\cursor-agent.CMD",
      ["--version"],
    );
    expect(launched.command.toLowerCase()).not.toContain("cmd.exe");
    if (launched.command.toLowerCase().includes("node.exe")) {
      expect(launched.args[0]?.toLowerCase()).toContain("index.js");
      expect(launched.args[1]).toBe("--version");
    }
  });
});

describe("ai http host", () => {
  test("rejects a turned-off provider without inventing a model", async () => {
    configureAiSecrets(fileSecretStore(mkdtempSync(join(tmpdir(), "intray-ai-"))));
    const result = await handleAiRequest({
      method: "POST",
      pathname: "/__intray/ai/complete",
      body: { provider: "none", prompt: "Summarize this inbox" },
    });
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toMatch(/grok-2|gpt-4o|llama3|sonnet/i);
    expect(JSON.stringify(result.body)).toContain("turned off");
  });

  test("saves and reports a key without echoing it back", async () => {
    configureAiSecrets(fileSecretStore(mkdtempSync(join(tmpdir(), "intray-ai-"))));
    const saved = await handleAiRequest({
      method: "POST",
      pathname: "/__intray/ai/secrets",
      body: { id: "openai", value: "sk-test-local" },
    });
    expect(saved.status).toBe(200);
    const status = await handleAiRequest({
      method: "GET",
      pathname: "/__intray/ai/secrets",
    });
    expect(status.body).toMatchObject({ openai: true, grok: false });
    expect(JSON.stringify(status.body)).not.toContain("sk-test-local");
  });
});
