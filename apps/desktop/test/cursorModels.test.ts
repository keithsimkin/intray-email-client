import { describe, expect, test } from "bun:test";
import { parseCursorModelList } from "../src/main/ai/cursorModels";

describe("parseCursorModelList", () => {
  test("reads id and label, and skips the header", () => {
    const raw = `
Available models
auto - Auto
composer-2.5 - Composer 2.5 (current, default)
gpt-5.5-medium - GPT-5.5 Medium
`;
    expect(parseCursorModelList(raw)).toEqual([
      { id: "auto", label: "Auto" },
      { id: "composer-2.5", label: "Composer 2.5" },
      { id: "gpt-5.5-medium", label: "GPT-5.5 Medium" },
    ]);
  });

  test("ignores auth errors and keeps a bare id", () => {
    const raw = "Authentication required. Run agent login\ncomposer-2\n";
    expect(parseCursorModelList(raw)).toEqual([
      { id: "composer-2", label: "composer-2" },
    ]);
  });
});
