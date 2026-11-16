import { describe, expect, test } from "bun:test";
import { parseGrokModelList } from "../src/main/ai/grokModels";

describe("parseGrokModelList", () => {
  test("reads bullet model ids and skips headers", () => {
    const raw = `
You are logged in with grok.com.

Default model: grok-4.7

Available models:
  * grok-4.7 (default)
  - grok-4.7-build-fast
  - grok-4.6
  - grok-4.5
`;
    expect(parseGrokModelList(raw)).toEqual([
      { id: "grok-4.7", label: "grok-4.7" },
      { id: "grok-4.7-build-fast", label: "grok-4.7-build-fast" },
      { id: "grok-4.6", label: "grok-4.6" },
      { id: "grok-4.5", label: "grok-4.5" },
    ]);
  });

  test("ignores login noise without inventing models", () => {
    const raw = "Not logged in. Run grok login\n";
    expect(parseGrokModelList(raw)).toEqual([]);
  });
});
