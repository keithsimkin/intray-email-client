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
    unread: 23,
  },
  {
    id: "work",
    label: "PP",
    name: "Pranav Patel",
    email: "pranav@intray.app",
    color: "#5b8def",
    unread: 9,
    avatarUrl: avatarForEmail("pranav@intray.app"),
    provider: "imap",
  },
  {
    id: "gmail",
    label: "G",
    name: "Pranav",
    email: "pranav@gmail.com",
    color: "#ea4335",
    unread: 11,
    avatarUrl: avatarForEmail("pranav@gmail.com"),
    provider: "gmail",
  },
  {
    id: "outlook",
    label: "O",
    name: "Pranav Patel",
    email: "pranav@outlook.com",
    color: "#0a7cff",
    unread: 3,
    avatarUrl: avatarForEmail("pranav@outlook.com"),
    provider: "outlook",
    loggedOut: true,
  },
];

export const folders: Folder[] = [
  { id: "inbox", name: "Inbox", count: 23, icon: "inbox" },
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

const newsletterHtml = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#f4f4f5;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="520" style="background:#ffffff;border-radius:12px;overflow:hidden;">
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
    </table>
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

export const smartRepliesById: Record<string, string[]> = {
  "1": [
    "Looks great, thanks Ava — I'll review 4–7 before standup.",
    "Got it. Sending notes by 9:45.",
    "Can we push 15m? Want one more pass on the narrative.",
  ],
  "2": [
    "Great to meet you, Daniel — next week Tue/Wed work for me.",
    "Would love the overview deck when you have it.",
    "Happy to do 20 minutes Thursday afternoon.",
  ],
  "6": [
    "I'm in — see you at 7.",
    "Can we do 7:30? Coming from the office.",
    "Yes! Want me to grab a table?",
  ],
};

export const defaultSmartReplies = [
  "Thanks — I'll take a look and get back to you.",
  "Sounds good.",
  "Can we revisit this tomorrow?",
];

export const meeting = {
  title: "Q4 roadmap review",
  when: "now",
};

export const askAiSeed = {
  question: "When is dinner with Sam?",
  answer:
    "Saturday at 7:00 PM at the Thai place near the park — from Sam Patel’s email “Dinner on Saturday?”",
  citationId: "6",
};
