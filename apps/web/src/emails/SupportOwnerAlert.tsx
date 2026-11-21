type SupportOwnerAlertProps = {
  kind: "payment" | "subscription";
  customerName?: string | null;
  customerEmail?: string | null;
  amountLabel?: string | null;
  referenceId?: string | null;
};

export function SupportOwnerAlert({
  kind,
  customerName,
  customerEmail,
  amountLabel,
  referenceId,
}: SupportOwnerAlertProps) {
  const title =
    kind === "subscription" ? "New monthly license ($10/mo)" : "New lifetime license ($75)";

  return (
    <div
      style={{
        margin: 0,
        padding: "24px 16px",
        background: "#f6f6f7",
        fontFamily:
          'Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        color: "#111",
      }}
    >
      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        style={{ maxWidth: 560, margin: "0 auto", background: "#fff", borderRadius: 16 }}
      >
        <tbody>
          <tr>
            <td style={{ padding: 24 }}>
              <h1 style={{ margin: 0, fontSize: 20 }}>{title}</h1>
              <p style={{ margin: "12px 0 0", color: "#4b5563", lineHeight: 1.5 }}>
                <strong>Customer:</strong> {customerName || "—"}
                <br />
                <strong>Email:</strong> {customerEmail || "—"}
                <br />
                <strong>Amount:</strong> {amountLabel || "—"}
                <br />
                <strong>Reference:</strong> {referenceId || "—"}
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
