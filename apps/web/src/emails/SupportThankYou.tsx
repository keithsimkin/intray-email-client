type SupportThankYouProps = {
  name?: string | null;
  kind: "payment" | "subscription";
  downloadUrl?: string;
};

export function SupportThankYou({
  name,
  kind,
  downloadUrl = "https://intray.site/download",
}: SupportThankYouProps) {
  const greeting = name?.trim() ? name.trim().split(/\s+/)[0] : "there";
  const headline =
    kind === "subscription" ? "Thanks for the monthly support" : "Thanks for the gift";
  const body =
    kind === "subscription"
      ? "Your monthly support keeps Intray open source and shipping — builds, fixes, and local AI work."
      : "Your one-time gift helps keep Intray open source and shipping. We appreciate you.";

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
                {headline}
              </h1>
              <p style={{ margin: "14px 0 0", fontSize: 15, lineHeight: 1.55, color: "#9ca3af" }}>
                Hi {greeting},
              </p>
              <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.55, color: "#9ca3af" }}>
                {body}
              </p>
              <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.55, color: "#9ca3af" }}>
                Grab the latest Windows build anytime — macOS is on the way.
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
