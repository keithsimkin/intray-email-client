/** Copy for the in-app update prompts. The installer itself stays silent. */

export type UpdateAsk = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
};

function releaseName(version: string | undefined): string {
  const trimmed = version?.trim();
  return trimmed ? `Intray ${trimmed}` : "Intray";
}

/** Asked once when an update is detected, before anything is downloaded. */
export function downloadUpdateAsk(version?: string): UpdateAsk {
  return {
    title: "Update available",
    body: `${releaseName(version)} is ready. Download it now?`,
    confirmLabel: "Download",
    cancelLabel: "Not now",
  };
}

/**
 * Asked when the user chooses to install a downloaded update.
 * The native Windows installer window is not used.
 */
export function restartUpdateAsk(version?: string): UpdateAsk {
  return {
    title: "Restart to install",
    body: `Restart to install ${releaseName(version)}? It installs in the background with no Windows setup window, then opens again. Unsaved work in this window will close.`,
    confirmLabel: "Restart and install",
    cancelLabel: "Not now",
  };
}
