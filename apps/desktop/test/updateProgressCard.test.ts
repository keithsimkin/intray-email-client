import { describe, expect, test } from "bun:test";
import type { AppUpdateStatus } from "../src/shared/types";
import { shouldShowUpdateProgressCard } from "../src/renderer/UpdateProgressCard";

function status(
  state: AppUpdateStatus["state"],
  extra: Partial<AppUpdateStatus> = {},
): AppUpdateStatus {
  return { state, currentVersion: "1.0.0", packaged: true, ...extra };
}

describe("update progress card visibility", () => {
  test("stays hidden before the user starts an update", () => {
    for (const state of [
      "idle",
      "checking",
      "available",
      "not-available",
      "disabled",
    ] as const) {
      expect(shouldShowUpdateProgressCard(status(state))).toBe(false);
    }
  });

  test("shows through download, ready, and install", () => {
    expect(
      shouldShowUpdateProgressCard(
        status("downloading", { downloadPercent: 12 }),
      ),
    ).toBe(true);
    expect(
      shouldShowUpdateProgressCard(
        status("ready", { availableVersion: "1.1.0" }),
      ),
    ).toBe(true);
    expect(
      shouldShowUpdateProgressCard(
        status("installing", { availableVersion: "1.1.0" }),
      ),
    ).toBe(true);
  });

  test("shows errors only when a version was in flight", () => {
    expect(shouldShowUpdateProgressCard(status("error", { error: "offline" }))).toBe(
      false,
    );
    expect(
      shouldShowUpdateProgressCard(
        status("error", { availableVersion: "1.1.0", error: "offline" }),
      ),
    ).toBe(true);
  });
});
