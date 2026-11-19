/** Screen-recording blur. Mail stays intact — only pixels on this device are masked. */

export const CREATOR_BLUR_OPTIONS = [
  {
    id: "addresses",
    title: "All email addresses",
    hint: "Every address, and the name next to it. Covers personal mail, marketing, and your accounts.",
  },
  {
    id: "personal",
    title: "Personal email addresses",
    hint: "People you write with. Newsletters and no-reply mail stay readable.",
  },
  {
    id: "marketing",
    title: "Marketing email addresses",
    hint: "Newsletters, promotions, and no-reply senders only.",
  },
  {
    id: "own",
    title: "My account addresses",
    hint: "Mailboxes signed in on this device, including the sidebar and From field.",
  },
  {
    id: "names",
    title: "Sender and recipient names",
    hint: "Every display name, including mail you left readable above.",
  },
  {
    id: "subjects",
    title: "Subjects",
    hint: "Subject lines in the list and the reading pane. Follows the address filters when one is set.",
  },
  {
    id: "previews",
    title: "Preview lines",
    hint: "The snippet under each subject. Follows the same filters as subjects.",
  },
] as const;

export type CreatorBlurId = (typeof CREATOR_BLUR_OPTIONS)[number]["id"];

export type CreatorBlurPrefs = {
  creatorMode: boolean;
  creatorBlur: readonly CreatorBlurId[];
};

export type MailKind = "personal" | "marketing" | "own";

export type MailFace = {
  email?: string;
  name?: string;
  subject?: string;
  preview?: string;
  tag?: string;
};

const BLUR_IDS = new Set<string>(CREATOR_BLUR_OPTIONS.map((option) => option.id));

const MARKETING_LOCAL =
  /^(?:no[-_.]?reply|noreply|do[-_.]?not[-_.]?reply|donotreply|newsletter|newsletters|digest|promotions?|promo|marketing|offers|deals|notifications?|notify|mailer-daemon|bounce|postmaster|news|updates|receipts?|billing|orders|shipping|unsubscribe)$/i;

const MARKETING_DOMAIN =
  /(mailchimp|sendgrid|mandrill|sparkpost|constantcontact|klaviyo|hubspot|marketo|beehiiv|substack|convertkit|mailerlite|cmail|mcsv\.net|mcdlv\.net|amazonses|list-manage|campaign-archive|exacttarget|mktomail|mktdns)/i;

const MARKETING_COPY =
  /\b(unsubscribe|newsletter|view in (?:your )?browser|% off|limited[- ]time offer|email preferences)\b/i;

const EMAIL_FIND = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const CATEGORIES: readonly CreatorBlurId[] = ["personal", "marketing", "own"];

export function sanitizeCreatorBlur(value: unknown): CreatorBlurId[] {
  if (!Array.isArray(value)) return [];
  const out: CreatorBlurId[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !BLUR_IDS.has(item)) continue;
    const id = item as CreatorBlurId;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value.trim());
}

export function isMarketingAddress(email: string): boolean {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at <= 0) return false;
  let local = lower.slice(0, at);
  const domain = lower.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  if (MARKETING_LOCAL.test(local)) return true;
  return MARKETING_DOMAIN.test(domain);
}

export function classifyMail(
  face: MailFace,
  ownEmails: ReadonlySet<string>,
): MailKind {
  const email = face.email?.trim().toLowerCase() ?? "";
  if (email && ownEmails.has(email)) return "own";
  if (email && isMarketingAddress(email)) return "marketing";
  const tag = face.tag?.toLowerCase() ?? "";
  if (tag && /news|promo|market|digest|social/.test(tag)) return "marketing";
  const hay = [face.name, face.subject, face.preview].filter(Boolean).join("\n");
  if (hay && MARKETING_COPY.test(hay)) return "marketing";
  return "personal";
}

function selected(prefs: CreatorBlurPrefs, id: CreatorBlurId): boolean {
  return prefs.creatorMode && prefs.creatorBlur.includes(id);
}

/** Subjects and previews follow a chosen address filter. All-addresses, or no filter, means every message. */
function categoryMatches(prefs: CreatorBlurPrefs, kind: MailKind): boolean {
  if (prefs.creatorBlur.includes("addresses")) return true;
  const picked = CATEGORIES.filter((id) => prefs.creatorBlur.includes(id));
  if (picked.length === 0) return true;
  return picked.includes(kind);
}

export function shouldBlurAddress(prefs: CreatorBlurPrefs, kind: MailKind): boolean {
  if (!prefs.creatorMode) return false;
  if (prefs.creatorBlur.includes("addresses")) return true;
  if (kind === "personal" && prefs.creatorBlur.includes("personal")) return true;
  if (kind === "marketing" && prefs.creatorBlur.includes("marketing")) return true;
  if (kind === "own" && prefs.creatorBlur.includes("own")) return true;
  return false;
}

export function shouldBlurName(prefs: CreatorBlurPrefs, kind: MailKind): boolean {
  if (!prefs.creatorMode) return false;
  if (prefs.creatorBlur.includes("addresses")) return true;
  if (prefs.creatorBlur.includes("names")) return true;
  if (kind === "personal" && prefs.creatorBlur.includes("personal")) return true;
  if (kind === "marketing" && prefs.creatorBlur.includes("marketing")) return true;
  if (kind === "own" && prefs.creatorBlur.includes("own")) return true;
  return false;
}

export function shouldBlurSubject(prefs: CreatorBlurPrefs, kind: MailKind): boolean {
  if (!selected(prefs, "subjects")) return false;
  return categoryMatches(prefs, kind);
}

export function shouldBlurPreview(prefs: CreatorBlurPrefs, kind: MailKind): boolean {
  if (!selected(prefs, "previews")) return false;
  return categoryMatches(prefs, kind);
}

export type EmailPart = { kind: "text" | "email"; value: string };

export function splitEmailParts(text: string): EmailPart[] {
  const parts: EmailPart[] = [];
  const re = new RegExp(EMAIL_FIND.source, "gi");
  let last = 0;
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ kind: "text", value: text.slice(last, index) });
    }
    parts.push({ kind: "email", value: match[0] });
    last = index + match[0].length;
  }
  if (last < text.length || parts.length === 0) {
    parts.push({ kind: "text", value: text.slice(last) });
  }
  return parts;
}

/** Wrap visible addresses in HTML text. Leaves tags, style, and script alone. */
export function blurEmailsInHtml(
  html: string,
  shouldBlur: (email: string) => boolean,
): string {
  if (!html || !shouldBlur) return html;
  const parts = html.split(/(<[^>]*>)/g);
  let skip = 0;
  return parts
    .map((part) => {
      if (part.startsWith("<")) {
        const lower = part.toLowerCase();
        if (lower.startsWith("<style") || lower.startsWith("<script")) skip += 1;
        else if (lower.startsWith("</style") || lower.startsWith("</script")) {
          skip = Math.max(0, skip - 1);
        }
        return part;
      }
      if (skip > 0 || !part) return part;
      return part.replace(new RegExp(EMAIL_FIND.source, "gi"), (email) =>
        shouldBlur(email)
          ? `<span class="intray-creator-blur">${email}</span>`
          : email,
      );
    })
    .join("");
}

export type CreatorBlurApi = {
  /** Changes when the mask or the signed-in addresses change. */
  key: string;
  enabled: boolean;
  kindForEmail: (email: string) => MailKind;
  kindForMessage: (face: MailFace) => MailKind;
  blurAddress: (kind: MailKind) => boolean;
  blurName: (kind: MailKind) => boolean;
  blurSubject: (kind: MailKind) => boolean;
  blurPreview: (kind: MailKind) => boolean;
};

export function createCreatorBlur(
  prefs: CreatorBlurPrefs,
  ownEmails: ReadonlySet<string>,
): CreatorBlurApi {
  const ownKey = [...ownEmails].sort().join("|");
  return {
    key: `${prefs.creatorMode ? "1" : "0"}:${prefs.creatorBlur.join(",")}:${ownKey}`,
    enabled: prefs.creatorMode,
    kindForEmail: (email) => classifyMail({ email }, ownEmails),
    kindForMessage: (face) => classifyMail(face, ownEmails),
    blurAddress: (kind) => shouldBlurAddress(prefs, kind),
    blurName: (kind) => shouldBlurName(prefs, kind),
    blurSubject: (kind) => shouldBlurSubject(prefs, kind),
    blurPreview: (kind) => shouldBlurPreview(prefs, kind),
  };
}

export const creatorBlurOff = createCreatorBlur(
  { creatorMode: false, creatorBlur: [] },
  new Set(),
);
