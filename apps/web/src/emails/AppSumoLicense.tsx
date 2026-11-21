type AppSumoLicenseProps = {
  license: string;
  downloadUrl?: string;
  macDownloadUrl?: string;
};

export function AppSumoLicense({
  license,
  downloadUrl = "https://intray.site/download",
  macDownloadUrl = "https://intray.site/download?platform=mac",
}: AppSumoLicenseProps) {
  return (
    <div
      style={{
        margin: 0,
        padding: "32px 16px",
        background: "#070708",
        fontFamily:
          'Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        color: "#ededed",
      }}
    >
      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        style={{ maxWidth: 560, margin: "0 auto" }}
      >
        <tbody>
          <tr>
            <td
              style={{
                padding: "28px 28px 24px",
                borderRadius: 20,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "#121214",
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(200,240,74,0.12)",
                  color: "#c8f04a",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Intray
              </div>
              <h1
                style={{
                  margin: "18px 0 0",
                  fontSize: 28,
                  lineHeight: 1.15,
                  letterSpacing: "0.02em",
                  textTransform: "uppercase",
                  color: "#ffffff",
                }}
              >
                Your lifetime license
              </h1>
              <p style={{ margin: "14px 0 0", fontSize: 15, lineHeight: 1.55, color: "#9ca3af" }}>
                This AppSumo code is now a lifetime license for Intray. The key below is
                checked on your computer. It does not expire.
              </p>
              <p
                style={{
                  margin: "18px 0 0",
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: "#0c0c0e",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#ffffff",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: 13,
                  lineHeight: 1.5,
                  wordBreak: "break-all",
                }}
              >
                {license}
              </p>
              <p style={{ margin: "16px 0 0", fontSize: 15, lineHeight: 1.55, color: "#9ca3af" }}>
                Open Intray &gt; Settings &gt; License, paste the key.
              </p>
              <a
                href={downloadUrl}
                style={{
                  display: "inline-block",
                  marginTop: 22,
                  padding: "12px 18px",
                  borderRadius: 999,
                  background: "#760E0A",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Download for Windows
              </a>
              <a
                href={macDownloadUrl}
                style={{
                  display: "block",
                  marginTop: 14,
                  color: "#9ca3af",
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                Download for Mac
              </a>
              <p style={{ margin: "28px 0 0", fontSize: 13, lineHeight: 1.5, color: "#8a8f98" }}>
                — The Intray team
                <br />
                <a href="https://intray.site" style={{ color: "#c8f04a", textDecoration: "none" }}>
                  intray.site
                </a>
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
