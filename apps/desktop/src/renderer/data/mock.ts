import { avatarForEmail } from "../assets/avatars";

export type Account = {
  id: string;
  label: string;
  name: string;
  email: string;
  color: string;
  unread: number;
  avatarUrl?: string;
  /** Mail provider used when the account was added */
  provider?: "gmail" | "outlook" | "imap" | "icloud" | "fastmail" | "yahoo";
  /** Credentials missing or provider auth revoked — reconnect required. */
  loggedOut?: boolean;
};

export type Folder = {
  id: string;
  name: string;
  count?: number;
  icon: "inbox" | "file" | "send" | "archive" | "alert" | "trash" | "clock";
};

export type Label = {
  id: string;
  name: string;
  color: string;
};

export type Recipient = {
  name: string;
  email: string;
};

export type MailAttachment = {
  name: string;
  size: string;
};

export type MailMeeting = {
  title: string;
  when: string;
  url?: string;
};

export type ThreadMessage = {
  id: string;
  from: string;
  initials: string;
  avatarColor: string;
  email: string;
  time: string;
  avatarUrl?: string;
  /** Primary recipients (To) */
  to?: Recipient[];
  /** Carbon-copy recipients */
  cc?: Recipient[];
  noTrackers?: boolean;
  /** Plain paragraphs when no HTML */
  body?: string[];
  /** HTML email body (newsletters, rich mail) */
  bodyHtml?: string;
  /** @deprecated prefer attachments[] */
  attachment?: MailAttachment;
  attachments?: MailAttachment[];
  meeting?: MailMeeting;
};

export type OpenReceipt = {
  at: string;
  /** ISO timestamp for sorting / exact time */
  atIso: string;
};

export type OpenTracking = {
  enabled: true;
  token: string;
  /** First open, if any */
  openedAt?: string;
  openedAtIso?: string;
  opens: OpenReceipt[];
};

export type Message = {
  id: string;
  accountId: string;
  from: string;
  initials: string;
  avatarColor: string;
  email: string;
  subject: string;
  preview: string;
  time: string;
  unread: boolean;
  important: boolean;
  folder: string;
  tag?: { label: string; color: string };
  avatarUrl?: string;
  hasAttachment?: boolean;
  /** Starred / flagged thread */
  starred?: boolean;
  /** Count of links in the thread (list badge) */
  linkCount?: number;
  /** Count of file attachments (list badge) */
  attachmentCount?: number;
  /** Count of media / calendar embeds (list badge) */
  mediaCount?: number;
  meeting?: MailMeeting;
  /** Outbound open tracking (Sent) */
  openTracking?: OpenTracking;
  /** Chronological thread (oldest → newest) */
  thread: ThreadMessage[];
};

function withAvatar<T extends { email: string; avatarUrl?: string }>(row: T): T {
  return {
    ...row,
    avatarUrl: row.avatarUrl ?? avatarForEmail(row.email),
  };
}

/** Unified workspace — first rail item merges every account. */
export const UNIFIED_ID = "all";

export const accounts: Account[] = [
  {
    id: UNIFIED_ID,
    label: "All",
    name: "Unified Inbox",
    email: "All accounts",
    color: "#ededed",
    unread: 28,
  },
  {
    id: "work",
    label: "PP",
    name: "Pranav Patel",
    email: "pranav@intray.app",
    color: "#5b8def",
    unread: 11,
    avatarUrl: avatarForEmail("pranav@intray.app"),
    provider: "imap",
  },
  {
    id: "gmail",
    label: "G",
    name: "Pranav",
    email: "pranav@gmail.com",
    color: "#ea4335",
    unread: 13,
    avatarUrl: avatarForEmail("pranav@gmail.com"),
    provider: "gmail",
  },
  {
    id: "outlook",
    label: "O",
    name: "Pranav Patel",
    email: "pranav@outlook.com",
    color: "#0a7cff",
    unread: 4,
    avatarUrl: avatarForEmail("pranav@outlook.com"),
    provider: "outlook",
    loggedOut: true,
  },
];

export const folders: Folder[] = [
  { id: "inbox", name: "Inbox", count: 28, icon: "inbox" },
  { id: "snoozed", name: "Snoozed", count: 1, icon: "clock" },
  { id: "drafts", name: "Drafts", count: 2, icon: "file" },
  { id: "sent", name: "Sent", icon: "send" },
  { id: "archive", name: "Archive", icon: "archive" },
  { id: "junk", name: "Junk", count: 1, icon: "alert" },
  { id: "trash", name: "Trash", count: 1, icon: "trash" },
];

export const customFolders = ["Clients", "Acme", "Receipts"];

export const labels: Label[] = [
  { id: "waiting", name: "Waiting for Reply", color: "#ff5c5c" },
  { id: "receipts", name: "Receipts", color: "#f5a524" },
  { id: "promo", name: "Promotions", color: "#f5d042" },
  { id: "security", name: "Security", color: "#3dd68c" },
  { id: "social", name: "Social", color: "#5b8def" },
  { id: "updates", name: "Updates", color: "#8b7cf6" },
  { id: "news", name: "Newsletters", color: "#46c5e8" },
];

const roadmapHtml = `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a;">
  <p style="margin:0 0 12px;">Hi Pranav —</p>
  <p style="margin:0 0 12px;">Circling back with the <strong>Q4 roadmap</strong> deck. Could you glance at slides <strong>4–7</strong> before standup?</p>
  <p style="margin:0 0 8px;">Open asks:</p>
  <ul style="margin:0 0 12px;padding-left:20px;">
    <li>Timeline for the MCP beta</li>
    <li>Whether we still want tray Catch Me Up in the launch cut</li>
  </ul>
  <p style="margin:0 0 16px;">Join us on the call if you can:</p>
  <p style="margin:0 0 16px;"><a href="https://meet.google.com/q4-roadmap" style="display:inline-block;background:#3b6fd9;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:600;">Join Google Meet</a></p>
  <p style="margin:0;">Thanks!<br/>Ava</p>
</div>`;

const standupInviteHtml = `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a;">
  <p style="margin:0 0 12px;">You're invited to <strong>Design review — Wide List</strong>.</p>
  <p style="margin:0 0 8px;color:#555;">Thursday · 10:30–11:15 AM</p>
  <p style="margin:0 0 16px;"><a href="https://teams.microsoft.com/l/meetup-join/demo" style="display:inline-block;background:#0a7cff;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:600;">Join Microsoft Teams</a></p>
  <p style="margin:0;">I've attached the latest explorations.<br/>Maya</p>
</div>`;

const introCallHtml = `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a;">
  <p style="margin:0 0 12px;">Hey Priya (and Pranav on Cc),</p>
  <p style="margin:0 0 12px;">Really enjoyed the intro. At Ledgerly we keep everything local — no mail relay — and our team lives in the tray for OTP + quick replies.</p>
  <p style="margin:0 0 12px;">Would love 20 minutes next week if you're open. Here's a hold:</p>
  <p style="margin:0 0 16px;"><a href="https://calendly.com/daniel-ledgerly/20min" style="color:#0f766e;font-weight:600;">Book 20 min with Daniel →</a></p>
  <p style="margin:0;">Daniel</p>
</div>`;

const newsletterHtml = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#ffffff;">
  <tr><td style="background:#0a0a0b;color:#ededed;padding:20px 24px;font-size:18px;font-weight:600;letter-spacing:-0.02em;">Linear Weekly</td></tr>
  <tr><td style="padding:20px 24px;color:#222;font-size:14px;line-height:1.5;">
    <p style="margin:0 0 12px;">Here's your weekly summary for <strong>Intray</strong>.</p>
    <p style="margin:0 0 8px;"><span style="display:inline-block;background:#eef0ff;color:#5e6ad2;border-radius:6px;padding:4px 8px;font-size:12px;font-weight:600;">12 closed</span>
    <span style="display:inline-block;background:#f3f4f6;color:#555;border-radius:6px;padding:4px 8px;font-size:12px;font-weight:600;margin-left:6px;">4 in review</span></p>
    <p style="margin:16px 0 0;color:#666;font-size:13px;">MCP tools epic is at 60%.</p>
    <a href="https://linear.app/intray/settings" style="display:inline-block;margin-top:16px;background:#5e6ad2;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:600;">Open workspace</a>
    <p style="margin:20px 0 0;color:#999;font-size:11px;line-height:1.4;">
      You’re receiving this because you follow Intray.
      <a href="https://linear.app/unsubscribe?token=demo-intray" style="color:#5e6ad2;">Unsubscribe</a>
      · <a href="https://linear.app/settings/notifications" style="color:#5e6ad2;">Manage preferences</a>
    </p>
  </td></tr>
</table>`;

const atelierLaunchHtml = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family:Georgia,'Times New Roman',serif;background:#fffdf9;">
  <tr><td style="padding:0;height:180px;background:linear-gradient(135deg,#1c1917 0%,#44403c 48%,#a8a29e 100%);">
    <div style="padding:36px 28px;color:#fafaf9;">
      <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.72;margin-bottom:14px;">Atelier · Spring drop</div>
      <div style="font-size:34px;line-height:1.1;letter-spacing:-0.03em;">Quiet objects for&nbsp;focused&nbsp;desks</div>
    </div>
  </td></tr>
  <tr><td style="padding:28px 28px 8px;color:#292524;font-size:16px;line-height:1.6;">
    <p style="margin:0 0 14px;">Pranav —</p>
    <p style="margin:0 0 14px;">Our spring collection just landed: brushed aluminum trays, linen cable wraps, and a matte desk lamp that disappears until you need it.</p>
    <p style="margin:0 0 22px;color:#78716c;font-size:14px;">Members get early access through Friday. Shipping from Oakland &amp; Rotterdam.</p>
    <a href="https://atelier.example/spring" style="display:inline-block;background:#1c1917;color:#fafaf9;text-decoration:none;padding:12px 18px;border-radius:999px;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;">Browse the drop</a>
  </td></tr>
  <tr><td style="padding:24px 28px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="33%" style="padding:8px;background:#f5f0e8;border-radius:12px;text-align:center;">
          <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:11px;color:#a8a29e;letter-spacing:0.08em;text-transform:uppercase;">Tray</div>
          <div style="font-size:18px;margin-top:4px;color:#1c1917;">$48</div>
        </td>
        <td width="8"></td>
        <td width="33%" style="padding:8px;background:#f5f0e8;border-radius:12px;text-align:center;">
          <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:11px;color:#a8a29e;letter-spacing:0.08em;text-transform:uppercase;">Wrap</div>
          <div style="font-size:18px;margin-top:4px;color:#1c1917;">$22</div>
        </td>
        <td width="8"></td>
        <td width="33%" style="padding:8px;background:#f5f0e8;border-radius:12px;text-align:center;">
          <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:11px;color:#a8a29e;letter-spacing:0.08em;text-transform:uppercase;">Lamp</div>
          <div style="font-size:18px;margin-top:4px;color:#1c1917;">$160</div>
        </td>
      </tr>
    </table>
    <p style="margin:22px 0 0;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:11px;color:#a8a29e;line-height:1.5;">
      You’re on the Atelier list.
      <a href="https://atelier.example/unsubscribe" style="color:#78716c;">Unsubscribe</a>
    </p>
  </td></tr>
</table>`;

const voyageConfirmHtml = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#ffffff;">
  <tr><td style="background:#0f766e;padding:22px 26px;color:#ecfdf5;">
    <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;opacity:0.8;">Voyage · Booking confirmed</div>
    <div style="font-size:24px;font-weight:650;letter-spacing:-0.03em;margin-top:8px;">Lisbon loft · Apr 12–16</div>
  </td></tr>
  <tr><td style="padding:24px 26px;color:#134e4a;">
    <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#115e59;">You're all set, Pranav. Here's everything you need for check-in.</p>
    <table role="presentation" width="100%" style="background:#f0fdfa;border-radius:12px;margin-bottom:18px;">
      <tr>
        <td style="padding:14px 16px;font-size:13px;line-height:1.5;">
          <div><strong>Address</strong><br/>Rua da Saudade 18, 1100-480 Lisboa</div>
          <div style="margin-top:10px;"><strong>Host</strong><br/>Inês · arrives 3:00 PM</div>
          <div style="margin-top:10px;"><strong>Door code</strong><br/><span style="font-family:ui-monospace,Consolas,monospace;font-size:15px;letter-spacing:0.08em;">4821#</span></div>
        </td>
      </tr>
    </table>
    <a href="https://voyage.example/trips/lisbon-4821" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:11px 16px;border-radius:10px;font-size:13px;font-weight:650;">Open trip details</a>
    <p style="margin:18px 0 0;font-size:12px;color:#0f766e;">Confirmation · VOY-20481</p>
  </td></tr>
</table>`;

const folioDigestHtml = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family:'Iowan Old Style',Georgia,serif;background:#161618;">
  <tr><td style="padding:28px 28px 12px;color:#f4f4f5;">
    <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#a1a1aa;">Folio · Sunday digest</div>
    <h1 style="margin:12px 0 0;font-size:30px;line-height:1.15;font-weight:500;letter-spacing:-0.03em;">Five things worth keeping</h1>
  </td></tr>
  <tr><td style="padding:8px 28px 24px;color:#d4d4d8;font-size:15px;line-height:1.65;">
    <p style="margin:0 0 18px;border-left:2px solid #52525b;padding-left:14px;">A short letter on craft, tools, and the quiet parts of building software.</p>
    <ol style="margin:0;padding-left:18px;">
      <li style="margin-bottom:12px;"><strong style="color:#fafafa;">Margins as a feature.</strong> White space is not empty — it is where attention recovers.</li>
      <li style="margin-bottom:12px;"><strong style="color:#fafafa;">Local-first mail.</strong> The inbox that never leaves the device still feels like magic in 2026.</li>
      <li style="margin-bottom:12px;"><strong style="color:#fafafa;">Long threads.</strong> Collapse ruthlessly; expand when the story matters.</li>
      <li style="margin-bottom:12px;"><strong style="color:#fafafa;">HTML that behaves.</strong> Beautiful newsletters should still be readable in a dark reading pane.</li>
      <li style="margin-bottom:0;"><strong style="color:#fafafa;">One good sentence.</strong> Ship the paragraph you would underline.</li>
    </ol>
    <a href="https://folio.example/digest/204" style="display:inline-block;margin-top:22px;border:1px solid #3f3f46;color:#fafafa;text-decoration:none;padding:10px 14px;border-radius:999px;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.04em;">Read online</a>
    <p style="margin:22px 0 0;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:11px;color:#71717a;">
      Sent by Folio.
      <a href="https://folio.example/unsubscribe" style="color:#a1a1aa;">Unsubscribe</a>
    </p>
  </td></tr>
</table>`;

export const messages: Message[] = [
  {
    id: "1",
    accountId: "work",
    from: "Ava Martin",
    initials: "AM",
    avatarColor: "#5b8def",
    email: "ava@northwind.io",
    subject: "Q4 roadmap review",
    preview: "Circling back with the deck and a few open asks before standup…",
    time: "12:09 AM",
    unread: true,
    important: true,
    folder: "inbox",
    tag: { label: "Clients", color: "#3b6fd9" },
    hasAttachment: true,
    starred: true,
    linkCount: 4,
    attachmentCount: 3,
    mediaCount: 1,
    meeting: {
      title: "Q4 roadmap review",
      when: "Today · 9:00 AM",
      url: "https://meet.google.com/q4-roadmap",
    },
    thread: [
      {
        id: "1a",
        from: "Ava Martin",
        initials: "AM",
        avatarColor: "#5b8def",
        email: "ava@northwind.io",
        time: "Mon 4:12 PM",
        to: [
          { name: "Pranav Patel", email: "pranav@intray.app" },
          { name: "Jordan Lee", email: "jordan@intray.app" },
          { name: "Maya Chen", email: "maya@acme.co" },
        ],
        cc: [
          { name: "Noah Kim", email: "noah@northwind.io" },
          { name: "Design", email: "design@northwind.io" },
        ],
        noTrackers: true,
        bodyHtml: roadmapHtml,
        attachments: [
          { name: "Q4 Roadmap.pdf", size: "2.4 MB" },
          { name: "Privacy diagram.png", size: "640 KB" },
          { name: "MCP beta notes.docx", size: "118 KB" },
        ],
        attachment: { name: "Q4 Roadmap.pdf", size: "2.4 MB" },
        meeting: {
          title: "Q4 roadmap review",
          when: "Today · 9:00 AM",
          url: "https://meet.google.com/q4-roadmap",
        },
      },
      {
        id: "1b",
        from: "Pranav Patel",
        initials: "PP",
        avatarColor: "#8b7cf6",
        email: "pranav@intray.app",
        time: "Mon 5:01 PM",
        to: [
          { name: "Ava Martin", email: "ava@northwind.io" },
          { name: "Jordan Lee", email: "jordan@intray.app" },
          { name: "Maya Chen", email: "maya@acme.co" },
        ],
        cc: [
          { name: "Noah Kim", email: "noah@northwind.io" },
          { name: "Design", email: "design@northwind.io" },
        ],
        noTrackers: true,
        body: [
          "Thanks Ava — reviewing 4–7 now.",
          "On MCP beta: aiming for end of month. Catch Me Up stays in the cut.",
        ],
      },
      {
        id: "1c",
        from: "Ava Martin",
        initials: "AM",
        avatarColor: "#5b8def",
        email: "ava@northwind.io",
        time: "12:09 AM",
        to: [
          { name: "Pranav Patel", email: "pranav@intray.app" },
          { name: "Jordan Lee", email: "jordan@intray.app" },
          { name: "Maya Chen", email: "maya@acme.co" },
        ],
        cc: [
          { name: "Noah Kim", email: "noah@northwind.io" },
          { name: "Design", email: "design@northwind.io" },
        ],
        noTrackers: true,
        bodyHtml: `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1a1a1a;">
          <p style="margin:0 0 12px;">Perfect — I'll lock the narrative tonight.</p>
          <p style="margin:0 0 8px;">One more thing before standup:</p>
          <ol style="margin:0;padding-left:20px;">
            <li>Confirm tray hotkey copy</li>
            <li>Ship the privacy diagram for the landing page</li>
          </ol>
        </div>`,
      },
    ],
  },
  {
    id: "2",
    accountId: "work",
    from: "Daniel Cho",
    initials: "DC",
    avatarColor: "#3dd68c",
    email: "daniel@ledgerly.com",
    subject: "Intro: Pranav ↔ Daniel (Ledgerly)",
    preview: "Great connecting — sharing a short overview of how we use mail + AI…",
    time: "Yesterday",
    unread: true,
    important: true,
    folder: "inbox",
    tag: { label: "Clients", color: "#3b6fd9" },
    linkCount: 2,
    attachmentCount: 1,
    hasAttachment: true,
    mediaCount: 1,
    meeting: {
      title: "Ledgerly intro — 20 min",
      when: "Tue · 2:00 PM",
      url: "https://calendly.com/daniel-ledgerly/20min",
    },
    thread: [
      {
        id: "2a",
        from: "Daniel Cho",
        initials: "DC",
        avatarColor: "#3dd68c",
        email: "daniel@ledgerly.com",
        time: "Yesterday",
        to: [{ name: "Priya Shah", email: "priya@intray.app" }],
        cc: [
          { name: "Pranav Patel", email: "pranav@intray.app" },
          { name: "Alex Rivera", email: "alex@ledgerly.com" },
        ],
        noTrackers: true,
        bodyHtml: introCallHtml,
        attachments: [{ name: "Ledgerly overview.pdf", size: "1.1 MB" }],
        attachment: { name: "Ledgerly overview.pdf", size: "1.1 MB" },
        meeting: {
          title: "Ledgerly intro — 20 min",
          when: "Tue · 2:00 PM",
          url: "https://calendly.com/daniel-ledgerly/20min",
        },
      },
    ],
  },
  {
    id: "3",
    accountId: "gmail",
    from: "Maya Chen",
    initials: "MC",
    avatarColor: "#f5a524",
    email: "maya@acme.co",
    subject: "Invitation: Design review Thursday",
    preview: "Thursday 10:30 AM · Wide List walkthrough + Figma explorations",
    time: "Yesterday",
    unread: false,
    important: true,
    folder: "inbox",
    tag: { label: "Acme", color: "#8b7cf6" },
    starred: true,
    mediaCount: 1,
    linkCount: 2,
    hasAttachment: true,
    attachmentCount: 2,
    meeting: {
      title: "Design review — Wide List",
      when: "Thu · 10:30 AM",
      url: "https://teams.microsoft.com/l/meetup-join/demo",
    },
    thread: [
      {
        id: "3a",
        from: "Maya Chen",
        initials: "MC",
        avatarColor: "#f5a524",
        email: "maya@acme.co",
        time: "Yesterday 9:14 AM",
        noTrackers: true,
        bodyHtml: standupInviteHtml,
        attachments: [
          { name: "Wide List explorations.fig", size: "4.8 MB" },
          { name: "Panel layout notes.pdf", size: "312 KB" },
        ],
        attachment: { name: "Wide List explorations.fig", size: "4.8 MB" },
        meeting: {
          title: "Design review — Wide List",
          when: "Thu · 10:30 AM",
          url: "https://teams.microsoft.com/l/meetup-join/demo",
        },
      },
      {
        id: "3b",
        from: "Pranav Patel",
        initials: "PP",
        avatarColor: "#8b7cf6",
        email: "pranav@gmail.com",
        time: "Yesterday 10:02 AM",
        noTrackers: true,
        body: ["Thursday 10:30 works — accepted the invite. See you there."],
      },
    ],
  },
  {
    id: "4",
    accountId: "gmail",
    from: "GitHub",
    initials: "GH",
    avatarColor: "#8a8f98",
    email: "noreply@github.com",
    subject: "[intray/desktop] Dependabot alerts",
    preview: "2 vulnerabilities were detected in your dependencies…",
    time: "Mon",
    unread: false,
    important: false,
    folder: "inbox",
    tag: { label: "Security", color: "#3dd68c" },
    linkCount: 3,
    thread: [
      {
        id: "4a",
        from: "GitHub",
        initials: "GH",
        avatarColor: "#8a8f98",
        email: "noreply@github.com",
        time: "Mon",
        noTrackers: true,
        bodyHtml: `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#24292f;">
          <p>GitHub found <strong>2 vulnerabilities</strong> in your dependencies on the <code>master</code> branch.</p>
          <p style="margin-top:12px;"><a href="#" style="color:#0969da;">Review Dependabot alerts →</a></p>
        </div>`,
      },
    ],
  },
  {
    id: "5",
    accountId: "outlook",
    from: "Stripe",
    initials: "S",
    avatarColor: "#635bff",
    email: "receipts@stripe.com",
    subject: "Your receipt from Stripe",
    preview: "Invoice paid — Intray lifetime license · $4.99",
    time: "Sun",
    unread: false,
    important: false,
    folder: "inbox",
    tag: { label: "Receipts", color: "#f5a524" },
    hasAttachment: true,
    attachmentCount: 1,
    linkCount: 1,
    thread: [
      {
        id: "5a",
        from: "Stripe",
        initials: "S",
        avatarColor: "#635bff",
        email: "receipts@stripe.com",
        time: "Sun",
        noTrackers: true,
        bodyHtml: `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#0a2540;">
          <p style="margin:0 0 8px;font-size:12px;color:#687385;text-transform:uppercase;letter-spacing:0.06em;">Receipt</p>
          <p style="margin:0 0 16px;font-size:22px;font-weight:600;">$4.99 USD</p>
          <table width="100%" style="font-size:13px;border-collapse:collapse;">
            <tr><td style="padding:8px 0;border-top:1px solid #e6ebf1;color:#687385;">Description</td><td style="padding:8px 0;border-top:1px solid #e6ebf1;text-align:right;">Intray lifetime</td></tr>
            <tr><td style="padding:8px 0;border-top:1px solid #e6ebf1;color:#687385;">Invoice</td><td style="padding:8px 0;border-top:1px solid #e6ebf1;text-align:right;">#1842</td></tr>
          </table>
        </div>`,
        attachment: { name: "Receipt-1842.pdf", size: "84 KB" },
      },
    ],
  },
  {
    id: "6",
    accountId: "gmail",
    from: "Sam Patel",
    initials: "SP",
    avatarColor: "#ea4335",
    email: "sam@patel.family",
    subject: "Dinner on Saturday?",
    preview: "Thai place at 7 — the one near the park. You in?",
    time: "Sat",
    unread: true,
    important: true,
    folder: "inbox",
    thread: [
      {
        id: "6a",
        from: "Sam Patel",
        initials: "SP",
        avatarColor: "#ea4335",
        email: "sam@patel.family",
        time: "Sat",
        noTrackers: true,
        body: [
          "Hey,",
          "Thai place at 7 on Saturday — the one near the park. You in?",
          "Sam",
        ],
      },
    ],
  },
  {
    id: "7",
    accountId: "outlook",
    from: "LinkedIn",
    initials: "in",
    avatarColor: "#0a66c2",
    email: "messages-noreply@linkedin.com",
    subject: "You appeared in 14 searches this week",
    preview: "See who's looking at your profile…",
    time: "Fri",
    unread: false,
    important: false,
    folder: "inbox",
    tag: { label: "Social", color: "#5b8def" },
    linkCount: 2,
    thread: [
      {
        id: "7a",
        from: "LinkedIn",
        initials: "in",
        avatarColor: "#0a66c2",
        email: "messages-noreply@linkedin.com",
        time: "Fri",
        bodyHtml: `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;color:#000;">
          <p>Your profile showed up in <strong>14 searches</strong> this week.</p>
          <p><a href="https://www.linkedin.com/me/profile-views/" style="color:#0a66c2;font-weight:600;">See who's looking →</a></p>
          <p style="margin-top:18px;font-size:12px;color:#666;">
            <a href="https://www.linkedin.com/mypreferences/d/categories/email" style="color:#0a66c2;">Unsubscribe</a>
            from emails like this.
          </p>
        </div>`,
      },
    ],
  },
  {
    id: "8",
    accountId: "work",
    from: "Linear",
    initials: "L",
    avatarColor: "#5e6ad2",
    email: "noreply@linear.app",
    subject: "Weekly summary for Intray",
    preview: "12 issues closed · 4 in review · MCP tools epic at 60%",
    time: "Fri",
    unread: false,
    important: false,
    folder: "inbox",
    tag: { label: "Updates", color: "#8b7cf6" },
    linkCount: 1,
    thread: [
      {
        id: "8a",
        from: "Linear",
        initials: "L",
        avatarColor: "#5e6ad2",
        email: "noreply@linear.app",
        time: "Fri",
        noTrackers: true,
        bodyHtml: newsletterHtml,
      },
    ],
  },
  {
    id: "9",
    accountId: "work",
    from: "Ava Martin",
    initials: "AM",
    avatarColor: "#5b8def",
    email: "ava@northwind.io",
    subject: "Follow up next week",
    preview: "Snoozed reminder — revisit the MCP launch cut.",
    time: "Snoozed",
    unread: false,
    important: true,
    folder: "snoozed",
    mediaCount: 1,
    meeting: {
      title: "MCP launch cut",
      when: "Next Mon · 11:00 AM",
      url: "https://meet.google.com/mcp-cut",
    },
    thread: [
      {
        id: "9a",
        from: "Ava Martin",
        initials: "AM",
        avatarColor: "#5b8def",
        email: "ava@northwind.io",
        time: "Snoozed",
        noTrackers: true,
        body: [
          "Reminder: revisit the MCP launch cut with Ava.",
          "Meet link: https://meet.google.com/mcp-cut",
        ],
        meeting: {
          title: "MCP launch cut",
          when: "Next Mon · 11:00 AM",
          url: "https://meet.google.com/mcp-cut",
        },
      },
    ],
  },
  {
    id: "s1",
    accountId: "work",
    from: "Ava Martin",
    initials: "AM",
    avatarColor: "#5b8def",
    email: "ava@northwind.io",
    subject: "Re: Q4 roadmap — notes attached",
    preview: "Sending the narrative outline and the three slides we discussed.",
    time: "Yesterday",
    unread: false,
    important: false,
    folder: "sent",
    openTracking: {
      enabled: true,
      token: "demo-opened-s1",
      openedAt: "Yesterday, 4:18 PM",
      openedAtIso: "2026-11-15T16:18:00.000Z",
      opens: [
        { at: "Yesterday, 4:18 PM", atIso: "2026-11-15T16:18:00.000Z" },
        { at: "Yesterday, 6:02 PM", atIso: "2026-11-15T18:02:00.000Z" },
      ],
    },
    thread: [
      {
        id: "s1a",
        from: "Pranav Patel",
        initials: "PP",
        avatarColor: "#5b8def",
        email: "pranav@intray.app",
        time: "Yesterday",
        to: [{ name: "Ava Martin", email: "ava@northwind.io" }],
        noTrackers: true,
        body: [
          "Ava — sending the narrative outline and the three slides we discussed.",
          "Happy to jump on a quick call if anything’s unclear.",
        ],
      },
    ],
  },
  {
    id: "s2",
    accountId: "gmail",
    from: "Daniel Chen",
    initials: "DC",
    avatarColor: "#3dd68c",
    email: "daniel@ledgerly.co",
    subject: "Intro call availability",
    preview: "Tue or Wed next week both work on my side — happy to follow your lead.",
    time: "Mon",
    unread: false,
    important: false,
    folder: "sent",
    openTracking: {
      enabled: true,
      token: "demo-delivered-s2",
      opens: [],
    },
    thread: [
      {
        id: "s2a",
        from: "Pranav",
        initials: "G",
        avatarColor: "#ea4335",
        email: "pranav@gmail.com",
        time: "Mon",
        to: [{ name: "Daniel Chen", email: "daniel@ledgerly.co" }],
        noTrackers: true,
        body: [
          "Daniel — Tue or Wed next week both work on my side. Happy to follow your lead on time.",
        ],
      },
    ],
  },
  {
    id: "10",
    accountId: "gmail",
    from: "Atelier",
    initials: "AT",
    avatarColor: "#1c1917",
    email: "hello@atelier.example",
    subject: "Spring drop is live — quiet objects for focused desks",
    preview: "Brushed trays, linen wraps, and a lamp that disappears until you need it…",
    time: "8:14 AM",
    unread: true,
    important: false,
    folder: "inbox",
    tag: { label: "Promotions", color: "#f5d042" },
    linkCount: 2,
    thread: [
      {
        id: "10a",
        from: "Atelier",
        initials: "AT",
        avatarColor: "#1c1917",
        email: "hello@atelier.example",
        time: "8:14 AM",
        to: [{ name: "Pranav", email: "pranav@gmail.com" }],
        noTrackers: true,
        bodyHtml: atelierLaunchHtml,
      },
    ],
  },
  {
    id: "11",
    accountId: "outlook",
    from: "Voyage",
    initials: "VY",
    avatarColor: "#0f766e",
    email: "trips@voyage.example",
    subject: "You're booked — Lisbon loft, Apr 12–16",
    preview: "Door code, host details, and everything you need for check-in…",
    time: "7:02 AM",
    unread: true,
    important: true,
    folder: "inbox",
    tag: { label: "Updates", color: "#8b7cf6" },
    linkCount: 1,
    mediaCount: 1,
    thread: [
      {
        id: "11a",
        from: "Voyage",
        initials: "VY",
        avatarColor: "#0f766e",
        email: "trips@voyage.example",
        time: "7:02 AM",
        to: [{ name: "Pranav Patel", email: "pranav@outlook.com" }],
        noTrackers: true,
        bodyHtml: voyageConfirmHtml,
      },
    ],
  },
  {
    id: "12",
    accountId: "work",
    from: "Folio",
    initials: "FO",
    avatarColor: "#a1a1aa",
    email: "digest@folio.example",
    subject: "Sunday digest — five things worth keeping",
    preview: "A short letter on craft, tools, and the quiet parts of building software…",
    time: "Sun",
    unread: false,
    important: false,
    folder: "inbox",
    tag: { label: "Newsletters", color: "#46c5e8" },
    linkCount: 2,
    thread: [
      {
        id: "12a",
        from: "Folio",
        initials: "FO",
        avatarColor: "#a1a1aa",
        email: "digest@folio.example",
        time: "Sun",
        to: [{ name: "Pranav Patel", email: "pranav@intray.app" }],
        noTrackers: true,
        bodyHtml: folioDigestHtml,
      },
    ],
  },
  {
    id: "13",
    accountId: "work",
    from: "Elena Ruiz",
    initials: "ER",
    avatarColor: "#db2777",
    email: "elena@northwind.io",
    subject: "Hiring loop — Staff designer finalists",
    preview: "Rounding the loop: scorecards, take-home notes, and who we should advance…",
    time: "11:40 PM",
    unread: true,
    important: true,
    folder: "inbox",
    tag: { label: "Waiting for Reply", color: "#ff5c5c" },
    linkCount: 3,
    attachmentCount: 2,
    hasAttachment: true,
    starred: true,
    thread: [
      {
        id: "13a",
        from: "Elena Ruiz",
        initials: "ER",
        avatarColor: "#db2777",
        email: "elena@northwind.io",
        time: "Mon 9:10 AM",
        to: [
          { name: "Pranav Patel", email: "pranav@intray.app" },
          { name: "Maya Chen", email: "maya@acme.co" },
        ],
        cc: [{ name: "Jordan Lee", email: "jordan@intray.app" }],
        noTrackers: true,
        body: [
          "Kicking off the staff designer loop this week. Three finalists:",
          "1) Samira Okonkwo — systems + motion",
          "2) Theo Lang — product craft, strong writing",
          "3) Hana Park — research-led, excellent critiques",
          "I'll send scorecards after each session. Please keep feedback crisp.",
        ],
        attachments: [{ name: "Scorecard template.pdf", size: "84 KB" }],
      },
      {
        id: "13b",
        from: "Pranav Patel",
        initials: "PP",
        avatarColor: "#5b8def",
        email: "pranav@intray.app",
        time: "Mon 10:02 AM",
        to: [
          { name: "Elena Ruiz", email: "elena@northwind.io" },
          { name: "Maya Chen", email: "maya@acme.co" },
        ],
        noTrackers: true,
        body: [
          "Sounds good. Happy to sit on Samira + Theo.",
          "For Hana — can we include a short take-home on information hierarchy?",
        ],
      },
      {
        id: "13c",
        from: "Maya Chen",
        initials: "MC",
        avatarColor: "#f5a524",
        email: "maya@acme.co",
        time: "Mon 11:18 AM",
        to: [
          { name: "Elena Ruiz", email: "elena@northwind.io" },
          { name: "Pranav Patel", email: "pranav@intray.app" },
        ],
        noTrackers: true,
        body: [
          "Yes to hierarchy take-home. I drafted a 90-minute prompt around Wide List density.",
          "Link: https://figma.com/file/demo-hiring-prompt",
        ],
      },
      {
        id: "13d",
        from: "Elena Ruiz",
        initials: "ER",
        avatarColor: "#db2777",
        email: "elena@northwind.io",
        time: "Tue 2:40 PM",
        to: [
          { name: "Pranav Patel", email: "pranav@intray.app" },
          { name: "Maya Chen", email: "maya@acme.co" },
        ],
        noTrackers: true,
        body: [
          "Samira debrief notes attached. Strong systems instincts; motion samples felt a bit generic.",
          "Vote: advance / hold / pass?",
        ],
        attachments: [{ name: "Samira debrief.pdf", size: "210 KB" }],
        attachment: { name: "Samira debrief.pdf", size: "210 KB" },
      },
      {
        id: "13e",
        from: "Pranav Patel",
        initials: "PP",
        avatarColor: "#5b8def",
        email: "pranav@intray.app",
        time: "Tue 4:05 PM",
        to: [
          { name: "Elena Ruiz", email: "elena@northwind.io" },
          { name: "Maya Chen", email: "maya@acme.co" },
        ],
        noTrackers: true,
        body: [
          "Advance. The IA critique was the best of the day — I'd pair her with motion mentorship rather than ding for it.",
        ],
      },
      {
        id: "13f",
        from: "Maya Chen",
        initials: "MC",
        avatarColor: "#f5a524",
        email: "maya@acme.co",
        time: "Wed 9:22 AM",
        to: [
          { name: "Elena Ruiz", email: "elena@northwind.io" },
          { name: "Pranav Patel", email: "pranav@intray.app" },
        ],
        noTrackers: true,
        body: [
          "Theo's portfolio walk was excellent. Writing samples are unusually clear for a designer.",
          "One concern: less depth on accessibility. Worth probing tomorrow.",
        ],
      },
      {
        id: "13g",
        from: "Elena Ruiz",
        initials: "ER",
        avatarColor: "#db2777",
        email: "elena@northwind.io",
        time: "Thu 5:50 PM",
        to: [
          { name: "Pranav Patel", email: "pranav@intray.app" },
          { name: "Maya Chen", email: "maya@acme.co" },
        ],
        cc: [{ name: "Jordan Lee", email: "jordan@intray.app" }],
        noTrackers: true,
        body: [
          "Hana's take-home is in. Hierarchy choices are thoughtful; the critique doc is long but good.",
          "Please leave comments before Friday noon so I can close the loop with recruiting.",
          "Doc: https://docs.google.com/document/d/demo-hana-takehome",
        ],
      },
      {
        id: "13h",
        from: "Jordan Lee",
        initials: "JL",
        avatarColor: "#8b7cf6",
        email: "jordan@intray.app",
        time: "Fri 10:11 AM",
        to: [
          { name: "Elena Ruiz", email: "elena@northwind.io" },
          { name: "Pranav Patel", email: "pranav@intray.app" },
          { name: "Maya Chen", email: "maya@acme.co" },
        ],
        noTrackers: true,
        body: [
          "Quick note from recruiting: all three candidates can do final rounds next week.",
          "If we're leaning Samira + Theo, I can hold Hana as a strong backup.",
        ],
      },
      {
        id: "13i",
        from: "Elena Ruiz",
        initials: "ER",
        avatarColor: "#db2777",
        email: "elena@northwind.io",
        time: "11:40 PM",
        to: [
          { name: "Pranav Patel", email: "pranav@intray.app" },
          { name: "Maya Chen", email: "maya@acme.co" },
        ],
        cc: [{ name: "Jordan Lee", email: "jordan@intray.app" }],
        noTrackers: true,
        body: [
          "Rounding it up — my recommendation is Samira first, Theo second.",
          "Pranav, can you confirm before Monday standup so Jordan can send offers timing?",
        ],
      },
    ],
  },
  {
    id: "14",
    accountId: "gmail",
    from: "Support · Cloudnest",
    initials: "CN",
    avatarColor: "#0284c7",
    email: "support@cloudnest.example",
    subject: "Re: Sync stalled at 67% — ticket #CN-91822",
    preview: "Latest update from Mira: we're still chasing the desktop agent hang…",
    time: "9:58 PM",
    unread: true,
    important: false,
    folder: "inbox",
    tag: { label: "Waiting for Reply", color: "#ff5c5c" },
    linkCount: 4,
    attachmentCount: 1,
    hasAttachment: true,
    thread: [
      {
        id: "14a",
        from: "Pranav",
        initials: "G",
        avatarColor: "#ea4335",
        email: "pranav@gmail.com",
        time: "Nov 3 · 8:12 AM",
        to: [{ name: "Support · Cloudnest", email: "support@cloudnest.example" }],
        noTrackers: true,
        body: [
          "Hi — desktop sync on Windows has been stuck at 67% for two days.",
          "App version 4.12.1, Windows 11. Logs attached.",
        ],
        attachments: [{ name: "cloudnest-agent.log", size: "1.8 MB" }],
        attachment: { name: "cloudnest-agent.log", size: "1.8 MB" },
      },
      {
        id: "14b",
        from: "Support · Cloudnest",
        initials: "CN",
        avatarColor: "#0284c7",
        email: "support@cloudnest.example",
        time: "Nov 3 · 11:40 AM",
        to: [{ name: "Pranav", email: "pranav@gmail.com" }],
        noTrackers: true,
        body: [
          "Thanks for writing in — I've opened ticket #CN-91822.",
          "Can you confirm whether pause/resume changes anything, and if the tray icon shows 'Indexing'?",
        ],
      },
      {
        id: "14c",
        from: "Pranav",
        initials: "G",
        avatarColor: "#ea4335",
        email: "pranav@gmail.com",
        time: "Nov 3 · 1:05 PM",
        to: [{ name: "Support · Cloudnest", email: "support@cloudnest.example" }],
        noTrackers: true,
        body: [
          "Pause/resume doesn't help. Tray flickers between Indexing and Syncing.",
          "Also noticing CPU spikes every ~40 seconds.",
        ],
      },
      {
        id: "14d",
        from: "Support · Cloudnest",
        initials: "CN",
        avatarColor: "#0284c7",
        email: "support@cloudnest.example",
        time: "Nov 4 · 9:20 AM",
        to: [{ name: "Pranav", email: "pranav@gmail.com" }],
        noTrackers: true,
        body: [
          "Appreciate the detail. Please try safe mode (hold Shift on launch) and tell us if sync completes.",
          "Guide: https://help.cloudnest.example/safe-mode",
        ],
      },
      {
        id: "14e",
        from: "Pranav",
        initials: "G",
        avatarColor: "#ea4335",
        email: "pranav@gmail.com",
        time: "Nov 4 · 4:44 PM",
        to: [{ name: "Support · Cloudnest", email: "support@cloudnest.example" }],
        noTrackers: true,
        body: [
          "Safe mode gets to 89%, then stalls again on a folder named 'Archives/2022'.",
          "That folder has ~12k small files.",
        ],
      },
      {
        id: "14f",
        from: "Mira Chen",
        initials: "MC",
        avatarColor: "#0369a1",
        email: "mira@cloudnest.example",
        time: "Nov 5 · 10:02 AM",
        to: [{ name: "Pranav", email: "pranav@gmail.com" }],
        cc: [{ name: "Support · Cloudnest", email: "support@cloudnest.example" }],
        noTrackers: true,
        body: [
          "Hi Pranav — Mira from the desktop agent team. Taking over #CN-91822.",
          "We're seeing a known hang when enumerating dense directories on NTFS.",
          "Can you exclude Archives/2022 temporarily and resync?",
        ],
      },
      {
        id: "14g",
        from: "Pranav",
        initials: "G",
        avatarColor: "#ea4335",
        email: "pranav@gmail.com",
        time: "Nov 5 · 6:30 PM",
        to: [{ name: "Mira Chen", email: "mira@cloudnest.example" }],
        cc: [{ name: "Support · Cloudnest", email: "support@cloudnest.example" }],
        noTrackers: true,
        body: [
          "Excluded — sync completed for everything else.",
          "When I re-add Archives/2022 it stalls again at the same point.",
        ],
      },
      {
        id: "14h",
        from: "Mira Chen",
        initials: "MC",
        avatarColor: "#0369a1",
        email: "mira@cloudnest.example",
        time: "Nov 7 · 2:15 PM",
        to: [{ name: "Pranav", email: "pranav@gmail.com" }],
        noTrackers: true,
        body: [
          "Thanks — that confirms it. We're shipping a fix in 4.12.3 (early next week).",
          "In the meantime you can keep the exclude, or use selective sync for that folder only:",
          "https://help.cloudnest.example/selective-sync",
        ],
      },
      {
        id: "14i",
        from: "Pranav",
        initials: "G",
        avatarColor: "#ea4335",
        email: "pranav@gmail.com",
        time: "Nov 10 · 9:01 AM",
        to: [{ name: "Mira Chen", email: "mira@cloudnest.example" }],
        noTrackers: true,
        body: [
          "Updated to 4.12.3 — still hanging, though it gets further (~94%).",
          "Happy to hop on a quick remote session if useful.",
        ],
      },
      {
        id: "14j",
        from: "Mira Chen",
        initials: "MC",
        avatarColor: "#0369a1",
        email: "mira@cloudnest.example",
        time: "9:58 PM",
        to: [{ name: "Pranav", email: "pranav@gmail.com" }],
        cc: [{ name: "Support · Cloudnest", email: "support@cloudnest.example" }],
        noTrackers: true,
        body: [
          "Appreciate the patience. We're still chasing an edge case with long path prefixes on that volume.",
          "I've escalated to engineering with your logs + the 94% marker.",
          "Next update by Wednesday — or sooner if we have a private build to try.",
          "Status page: https://status.cloudnest.example/incidents/sync-ntfs-hang",
        ],
      },
    ],
  },
  {
    id: "j1",
    accountId: "gmail",
    from: "Prize Desk",
    initials: "PD",
    avatarColor: "#ff5c5c",
    email: "winner@prize-desk.example",
    subject: "You’ve won a $500 gift card",
    preview: "Claim your prize within 24 hours — no purchase needed.",
    time: "Mon",
    unread: false,
    important: false,
    folder: "junk",
    thread: [
      {
        id: "j1a",
        from: "Prize Desk",
        initials: "PD",
        avatarColor: "#ff5c5c",
        email: "winner@prize-desk.example",
        time: "Mon",
        noTrackers: false,
        body: [
          "Congratulations! Click below to claim your $500 gift card.",
          "This message was auto-filed to Junk. Use Delete forever to remove it permanently.",
        ],
      },
    ],
  },
  {
    id: "t1",
    accountId: "outlook",
    from: "Newsletter Weekly",
    initials: "NW",
    avatarColor: "#8a8f98",
    email: "hello@newsletter-weekly.example",
    subject: "This week’s roundup (deleted)",
    preview: "Sitting in Trash until you empty it or delete forever.",
    time: "Sun",
    unread: false,
    important: false,
    folder: "trash",
    thread: [
      {
        id: "t1a",
        from: "Newsletter Weekly",
        initials: "NW",
        avatarColor: "#8a8f98",
        email: "hello@newsletter-weekly.example",
        time: "Sun",
        noTrackers: true,
        body: [
          "A soft-deleted newsletter for testing Empty Trash / Delete forever.",
        ],
      },
    ],
  },
].map((m) => ({
  ...withAvatar(m),
  thread: m.thread.map((t) => withAvatar(t)),
})) as Message[];

export const meeting = {
  title: "Q4 roadmap review",
  when: "now",
};

