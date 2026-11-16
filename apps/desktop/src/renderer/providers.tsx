import { Mail } from "lucide-react";
import {
  GMAIL_IMAP_HOST,
  GMAIL_IMAP_PORT,
  GMAIL_SMTP_HOST,
  GMAIL_SMTP_PORT,
} from "../shared/gmailImap";
import {
  ImgBrand,
  SimpleBrandIcon,
  brandIcons,
  brandImages,
} from "./BrandIcon";

export type AuthKind = "oauth" | "imap";

export type ProviderId =
  | "gmail"
  | "outlook"
  | "imap"
  | "icloud"
  | "fastmail"
  | "yahoo";

export type MailProvider = {
  id: ProviderId;
  name: string;
  shortName: string;
  description: string;
  auth: AuthKind;
  oauthLabel?: string;
  color: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  /** Short label on the provider card. Defaults to OAuth or IMAP. */
  badge?: string;
  guide?: string;
};

export const mailProviders: MailProvider[] = [
  {
    id: "gmail",
    name: "Gmail",
    shortName: "Gmail",
    description: "App password · recommended",
    auth: "imap",
    badge: "Recommended",
    oauthLabel: "Sign in with Google (beta / testers)",
    color: "#ea4335",
    imapHost: GMAIL_IMAP_HOST,
    imapPort: GMAIL_IMAP_PORT,
    smtpHost: GMAIL_SMTP_HOST,
    smtpPort: GMAIL_SMTP_PORT,
  },
  {
    id: "outlook",
    name: "Outlook / M365",
    shortName: "Outlook",
    description: "App password + IMAP",
    auth: "imap",
    color: "#0a7cff",
    imapHost: "outlook.office365.com",
    imapPort: 993,
    guide:
      "Use your Microsoft email and an app password (Account → Security). Work accounts may need admin IMAP enabled.",
  },
  {
    id: "icloud",
    name: "iCloud",
    shortName: "iCloud",
    description: "Apple ID + app-specific password",
    auth: "imap",
    color: "#3693F3",
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    guide:
      "Generate an app-specific password at appleid.apple.com → Sign-In and Security. Use your full iCloud email.",
  },
  {
    id: "yahoo",
    name: "Yahoo",
    shortName: "Yahoo",
    description: "Yahoo Mail + app password",
    auth: "imap",
    color: "#6001d2",
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    guide: "Generate an app password in Yahoo Account Security.",
  },
  {
    id: "fastmail",
    name: "Fastmail",
    shortName: "Fastmail",
    description: "Fastmail app password + IMAP",
    auth: "imap",
    color: "#3e4eb8",
    imapHost: "imap.fastmail.com",
    imapPort: 993,
    guide:
      "Create an app password in Fastmail → Settings → Privacy & Security.",
  },
  {
    id: "imap",
    name: "Other IMAP",
    shortName: "IMAP",
    description: "Any mail server + app password",
    auth: "imap",
    color: "#8a8f98",
    imapHost: "",
    imapPort: 993,
    guide: "Enter IMAP host and an app password when 2FA is on.",
  },
];

export function providerById(id: ProviderId): MailProvider {
  return mailProviders.find((p) => p.id === id) ?? mailProviders[0];
}

/** Real brand marks (Simple Icons / SVGL / Homarr dashboard-icons). */
export function ProviderLogo({
  id,
  size = 22,
}: {
  id: ProviderId;
  size?: number;
}) {
  switch (id) {
    case "gmail":
      return <SimpleBrandIcon icon={brandIcons.gmail} size={size} />;
    case "outlook":
      return <ImgBrand src={brandImages.outlook} alt="Outlook" size={size} />;
    case "icloud":
      return <SimpleBrandIcon icon={brandIcons.icloud} size={size} />;
    case "fastmail":
      return <ImgBrand src={brandImages.fastmail} alt="Fastmail" size={size} />;
    case "yahoo":
      return <ImgBrand src={brandImages.yahoo} alt="Yahoo" size={size} />;
    case "imap":
      return <Mail size={size} strokeWidth={1.75} aria-hidden color="#8a8f98" />;
  }
}
