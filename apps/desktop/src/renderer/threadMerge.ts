import type { Message, ThreadMessage } from "./data/mock";

export function threadMessageHasBody(message: ThreadMessage): boolean {
  if (message.bodyHtml && message.bodyHtml.trim()) return true;
  return Boolean(
    message.body?.some((line) => line && line !== "(No body yet)"),
  );
}

/** Keep whichever copy actually has the message body. */
export function preferThreadMessage(
  existing: ThreadMessage,
  incoming: ThreadMessage,
): ThreadMessage {
  const existingBody = threadMessageHasBody(existing);
  const incomingBody = threadMessageHasBody(incoming);
  if (existingBody && !incomingBody) {
    return {
      ...incoming,
      body: existing.body,
      bodyText: existing.bodyText,
      bodyHtml: existing.bodyHtml,
      attachment: existing.attachment ?? incoming.attachment,
      attachments: existing.attachments ?? incoming.attachments,
      meeting: existing.meeting ?? incoming.meeting,
    };
  }
  return {
    ...existing,
    ...incoming,
    body: incomingBody ? incoming.body : existing.body,
    bodyText: incoming.bodyText ?? existing.bodyText,
    bodyHtml: incoming.bodyHtml ?? existing.bodyHtml,
    attachment: incoming.attachment ?? existing.attachment,
    attachments: incoming.attachments ?? existing.attachments,
    meeting: incoming.meeting ?? existing.meeting,
  };
}

/** Server order first, then any local message the server has not echoed yet. */
export function unionThreads(
  existing: ThreadMessage[],
  incoming: ThreadMessage[],
): ThreadMessage[] {
  const merged = new Map<string, ThreadMessage>();
  for (const message of incoming) merged.set(message.id, message);
  for (const message of existing) {
    const next = merged.get(message.id);
    merged.set(
      message.id,
      next ? preferThreadMessage(message, next) : message,
    );
  }
  const order: string[] = [];
  const seen = new Set<string>();
  for (const message of incoming) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    order.push(message.id);
  }
  for (const message of existing) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    order.push(message.id);
  }
  return order.map((id) => merged.get(id)!);
}

function findConversation(prev: Message[], sent: Message): number {
  const sentIds = new Set(sent.thread.map((message) => message.id));
  sentIds.add(sent.id);
  return prev.findIndex(
    (message) =>
      message.id === sent.id ||
      sentIds.has(message.id) ||
      message.thread.some(
        (turn) => turn.id === sent.id || sentIds.has(turn.id),
      ),
  );
}

/**
 * Drop a sent reply into the conversation it answers and move that
 * conversation to the top. A brand-new message is prepended on its own.
 */
export function mergeSentIntoList(prev: Message[], sent: Message): Message[] {
  const index = findConversation(prev, sent);
  if (index === -1) return [sent, ...prev];

  const existing = prev[index]!;
  const thread = unionThreads(existing.thread, sent.thread);
  const grew = thread.length > existing.thread.length;
  const preview =
    grew && sent.preview && !sent.preview.startsWith("You: ")
      ? `You: ${sent.preview}`
      : sent.preview || existing.preview;
  const merged: Message = {
    ...existing,
    ...sent,
    id: existing.id,
    accountId: existing.accountId,
    folder: existing.folder,
    from: existing.from,
    email: existing.email,
    initials: existing.initials,
    avatarColor: existing.avatarColor,
    avatarUrl: existing.avatarUrl ?? sent.avatarUrl,
    subject: existing.subject,
    tag: sent.tag ?? existing.tag,
    starred: existing.starred,
    important: existing.important,
    unread: grew ? false : existing.unread,
    preview,
    time: sent.time || existing.time,
    thread,
    openTracking: existing.openTracking ?? sent.openTracking,
  };
  return [merged, ...prev.filter((_, item) => item !== index)];
}
