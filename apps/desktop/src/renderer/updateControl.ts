import type { AppUpdateStatus } from "../shared/types";

/** What the rail's update control should do for a given updater state. */
export type UpdateControlAction = "download" | "busy" | "restart";

export type UpdateControl = {
  /** Hide the control until an update has actually been detected. */
  visible: boolean;
  action: UpdateControlAction;
  /** Accessible label / tooltip. */
  label: string;
  /** Download percentage, only while the download is in progress. */
  percent?: number;
};

export function updateControl(status: AppUpdateStatus): UpdateControl {
  const version = status.availableVersion?.trim();
  const withVersion = (text: string) =>
    `${text}${version ? ` ${version}` : ""}`;

  switch (status.state) {
    case "available":
      return {
        visible: true,
        action: "download",
        label: withVersion("Download update"),
      };
    case "downloading":
      return {
        visible: true,
        action: "busy",
        label:
          typeof status.downloadPercent === "number"
            ? `Downloading update ${status.downloadPercent}%`
            : "Downloading update…",
        percent: status.downloadPercent,
      };
    case "ready":
      return {
        visible: true,
        action: "restart",
        label: withVersion("Restart to install update"),
      };
    default:
      return { visible: false, action: "busy", label: "" };
  }
}
