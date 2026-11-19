import { describe, expect, test } from "bun:test";
import { usageLimitMessage } from "../src/shared/aiError";

const CURSOR_IPC =
  "Error invoking remote method 'ai:complete': Error: ActionRequiredError: Weekly usage limit reached. It resets in 3 days. Buy credits to keep going now, or upgrade your plan for more weekly usage. Error: command failed unexpectedly.";

describe("usageLimitMessage", () => {
  test("replaces the Cursor weekly-limit dump with the limit and reset", () => {
    expect(usageLimitMessage(CURSOR_IPC)).toBe(
      "Weekly usage limit reached. It resets in 3 days.",
    );
  });

  test("keeps a weekly limit that is already short", () => {
    expect(
      usageLimitMessage("Weekly usage limit reached. It resets in 3 days."),
    ).toBe("Weekly usage limit reached. It resets in 3 days.");
  });

  test("names a credit block without the provider dump", () => {
    expect(
      usageLimitMessage("ActionRequiredError: credit balance is too low"),
    ).toBe("Credit balance is too low.");
  });

  test("leaves other failures alone", () => {
    expect(usageLimitMessage("claude CLI not found")).toBeNull();
    expect(usageLimitMessage("not logged in")).toBeNull();
  });
});
