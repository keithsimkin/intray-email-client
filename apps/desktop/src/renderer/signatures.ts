import { UNIFIED_ID, type Account } from "./data/mock";

export function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value.trim());
}

/** Strip the worst inline script vectors from user-edited signature HTML. */
export function sanitizeSignatureHtml(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

/** Email-safe designed signature card for an account. */
export function designedSignatureHtml(account: Account) {
  const accent = account.color === "#ededed" ? "#5b8def" : account.color;
  const label = account.label.slice(0, 2).toUpperCase();
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:'Segoe UI',Helvetica,Arial,sans-serif;max-width:420px;">
  <tr>
    <td style="padding:0 14px 0 0;vertical-align:middle;">
      <div style="width:42px;height:42px;border-radius:11px;background:${accent};color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.02em;line-height:42px;text-align:center;">${label}</div>
    </td>
    <td style="vertical-align:middle;border-left:2px solid ${accent};padding:2px 0 2px 14px;">
      <div style="font-size:14px;font-weight:650;color:#141416;letter-spacing:-0.02em;line-height:1.25;">${escapeHtml(account.name)}</div>
      <div style="margin-top:3px;font-size:12px;line-height:1.35;">
        <a href="mailto:${escapeHtml(account.email)}" style="color:${accent};text-decoration:none;">${escapeHtml(account.email)}</a>
      </div>
      <div style="margin-top:8px;font-size:11px;color:#8a8f98;letter-spacing:0.01em;">
        Sent with <span style="color:#141416;font-weight:650;">Intray</span>
      </div>
    </td>
  </tr>
</table>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function defaultAccountSignatures(
  accounts: Account[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of accounts) {
    if (a.id === UNIFIED_ID) continue;
    out[a.id] = designedSignatureHtml(a);
  }
  return out;
}
