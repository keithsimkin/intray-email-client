import { describe, expect, test } from "bun:test";
import type { AppUpdateStatus } from "../src/shared/types";
import { updateControl } from "../src/renderer/updateControl";

function status(
  state: AppUpdateStatus["state"],
  extra: Partial<AppUpdateStatus> = {},
): AppUpdateStatus {
  return { state, currentVersion: "1.0.0", packaged: true, ...extra };
}

describe("rail update control", () => {
  test("stays hidden until an update is detected", () => {
    for (const state of [
      "idle",
      "checking",
      "not-available",
      "error",
      "disabled",
    ] as const) {
      expect(updateControl(status(state)).visible).toBe(false);
    }
  });

  test("offers Download update when the update is detected", () => {
    const control = updateControl(
      status("available", { availableVersion: "1.1.0" }),
    );
    expect(control.visible).toBe(true);
    expect(control.action).toBe("download");
    expect(control.label).toBe("Download update 1.1.0");
  });

  test("shows progress while downloading and disables the button", () => {
    const control = updateControl(
      status("downloading", { downloadPercent: 42, availableVersion: "1.1.0" }),
    );
    expect(control.visible).toBe(true);
    expect(control.action).toBe("busy");
    expect(control.percent).toBe(42);
    expect(control.label).toBe("Downloading update 42%");
  });

  test("switches to Restart once the download is ready", () => {
    const control = updateControl(
      status("ready", { availableVersion: "1.1.0" }),
    );
    expect(control.visible).toBe(true);
    expect(control.action).toBe("restart");
    expect(control.label).toBe("Restart to install update 1.1.0");
    expect(control.percent).toBeUndefined();
  });
});
