import { useEffect, useState } from "react";
import type { LicenseStatus } from "../shared/license";
import {
  bridgeLicenseActivate,
  bridgeLicenseClear,
  bridgeLicenseGet,
  hasIntrayBridge,
} from "./mailApi";

export function LicensePanel() {
  const bridge = hasIntrayBridge();
  const [status, setStatus] = useState<LicenseStatus | null | undefined>(
    bridge ? undefined : null,
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (!bridge) return;
    let cancel = false;
    void bridgeLicenseGet().then((license) => {
      if (!cancel) setStatus(license);
    });
    return () => {
      cancel = true;
    };
  }, [bridge]);

  const activate = () => {
    const token = draft.trim();
    if (!token || busy) return;
    setBusy(true);
    setNote(null);
    void bridgeLicenseActivate(token)
      .then((result) => {
        if (!result.ok) {
          setNote({ kind: "err", text: result.error });
          return;
        }
        setStatus(result.license);
        setDraft("");
        setNote({ kind: "ok", text: "License saved on this device." });
      })
      .catch(() => {
        setNote({ kind: "err", text: "Could not save the license." });
      })
      .finally(() => setBusy(false));
  };

  const remove = () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    void bridgeLicenseClear()
      .then(() => {
        setStatus(null);
        setNote({ kind: "ok", text: "License removed from this device." });
      })
      .catch(() => {
        setNote({ kind: "err", text: "Could not remove the license." });
      })
      .finally(() => setBusy(false));
  };

  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <div className="settings-section-copy">
          <h3 className="settings-section-title">License</h3>
          <p className="settings-section-hint">
            Paste a lifetime key from AppSumo. Intray checks the signature on
            this device.
          </p>
        </div>
      </div>
      <div className="settings-card">
        {!bridge && (
          <p className="settings-inline-note">
            Open the Intray desktop app to save a license on this device.
          </p>
        )}
        {bridge && status === undefined && (
          <p className="settings-inline-note">Checking this device…</p>
        )}
        {status && (
          <>
            <div className="settings-row">
              <div className="settings-row-copy">
                <strong>Email</strong>
                <span>The address this key was issued to</span>
              </div>
              <div className="settings-row-control">
                <span className="settings-version-value">{status.email}</span>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row-copy">
                <strong>Plan</strong>
                <span>Checked offline with the built-in public key</span>
              </div>
              <div className="settings-row-control">
                <span className="settings-version-value">Lifetime</span>
              </div>
            </div>
            <div className="account-manage-actions">
              <button
                type="button"
                className="compose settings-add account-remove-btn"
                disabled={busy}
                onClick={remove}
              >
                Remove
              </button>
            </div>
          </>
        )}
        {bridge && status === null && (
          <>
            <textarea
              className="settings-textarea"
              rows={4}
              spellCheck={false}
              autoCapitalize="off"
              placeholder="INTRAY-…"
              aria-label="License key"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="account-manage-actions">
              <button
                type="button"
                className="compose settings-add"
                disabled={busy || draft.trim().length === 0}
                onClick={activate}
              >
                {busy ? "Checking…" : "Activate"}
              </button>
            </div>
          </>
        )}
        {note && (
          <p className={`settings-inline-note account-identity-note ${note.kind}`}>
            {note.text}
          </p>
        )}
      </div>
    </section>
  );
}
