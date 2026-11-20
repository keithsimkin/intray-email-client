import { draftSnippet } from "../shared/draftBody";
import type { Message, Recipient } from "./data/mock";

export type ComposeFileSnapshot = {
  id: string;
  file: File;
};

/** Fields the compose pane reports so closing can save without unmounting first. */
export type ComposeSnapshot = {
  accountId: string;
  fromName: string;
  fromEmail: string;
  fromLabel: string;
  fromColor: string;
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  subject: string;
  body: string;
  files: ComposeFileSnapshot[];
};

export function composeHasContent(input: {
  to: readonly unknown[];
  cc: readonly unknown[];
  bcc: readonly unknown[];
  subject: string;
  body: string;
  attachmentCount: number;
}): boolean {
  return (
    input.to.length > 0 ||
    input.cc.length > 0 ||
    input.bcc.length > 0 ||
    input.subject.trim().length > 0 ||
    input.body.trim().length > 0 ||
    input.attachmentCount > 0
  );
}

export function composeTabLabel(subject: string, fallback = "New message"): string {
  const trimmed = subject.trim();
  return trimmed || fallback.trim() || "New message";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Demo-mode draft. Live mail goes through the local database instead. */
export function localDraftMessage(snapshot: ComposeSnapshot, id?: string): Message {
  const draftId = id ?? `local-draft:${crypto.randomUUID()}`;
  const preview = draftSnippet({
    to: snapshot.to.map((person) => person.name || person.email),
    cc: snapshot.cc.map((person) => person.name || person.email),
    bcc: snapshot.bcc.map((person) => person.name || person.email),
    body: snapshot.body,
  });
  const initials = (snapshot.fromLabel || snapshot.fromName || "D")
    .slice(0, 2)
    .toUpperCase();
  return {
    id: draftId,
    accountId: snapshot.accountId,
    from: snapshot.fromName || snapshot.fromEmail,
    initials,
    avatarColor: snapshot.fromColor,
    email: snapshot.fromEmail,
    subject: snapshot.subject.trim() || "(no subject)",
    preview,
    time: "Just now",
    unread: false,
    important: false,
    folder: "drafts",
    hasAttachment: snapshot.files.length > 0,
    attachmentCount: snapshot.files.length || undefined,
    thread: [
      {
        id: `${draftId}:a`,
        from: snapshot.fromName || snapshot.fromEmail,
        initials,
        avatarColor: snapshot.fromColor,
        email: snapshot.fromEmail,
        time: "Just now",
        to: snapshot.to,
        cc: snapshot.cc.length ? snapshot.cc : undefined,
        bcc: snapshot.bcc.length ? snapshot.bcc : undefined,
        body: snapshot.body.split(/\n+/).filter(Boolean),
        bodyText: snapshot.body,
        attachments: snapshot.files.length
          ? snapshot.files.map((item) => ({
              name: item.file.name,
              size: formatFileSize(item.file.size),
              bytes: item.file.size,
            }))
          : undefined,
      },
    ],
  };
}
