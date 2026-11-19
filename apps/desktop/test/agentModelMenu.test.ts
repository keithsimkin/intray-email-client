import { describe, expect, test } from "bun:test";
import { readyBridgeIds } from "../src/renderer/agentModelMenu";
import type { AiBridgeId } from "../src/renderer/preferences";

const order: AiBridgeId[] = [
  "openai",
  "grok",
  "anthropic",
  "cursor",
  "none",
];

describe("readyBridgeIds", () => {
  test("shows only providers that are ready, and keeps the current one", () => {
    expect(
      readyBridgeIds(
        order,
        [
          { id: "grok", available: true },
          { id: "cursor", available: true },
          { id: "openai", available: false },
          { id: "none", available: true },
        ],
        "grok",
      ),
    ).toEqual(["grok", "cursor"]);
  });

  test("keeps the chosen provider while detection is still loading", () => {
    expect(readyBridgeIds(order, null, "cursor")).toEqual(["cursor"]);
  });

  test("hides Off and skips a provider that is not ready", () => {
    expect(
      readyBridgeIds(order, [{ id: "openai", available: false }], "none"),
    ).toEqual([]);
  });
});
