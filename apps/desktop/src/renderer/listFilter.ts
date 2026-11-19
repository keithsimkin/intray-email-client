import type { Message } from "./data/mock";

export type ReadFilter = "all" | "unread" | "read";

/** Inbox list refinements. These stay inside the current folder. */
export type ListFilter = {
  read: ReadFilter;
  starred: boolean;
  attachment: boolean;
};

export const EMPTY_LIST_FILTER: ListFilter = {
  read: "all",
  starred: false,
  attachment: false,
};

export type StatusCounts = {
  all: number;
  unread: number;
  read: number;
};

export function listFilterActive(filter: ListFilter) {
  return filter.read !== "all" || filter.starred || filter.attachment;
}

export function listFilterCount(filter: ListFilter) {
  return (
    (filter.read !== "all" ? 1 : 0) +
    (filter.starred ? 1 : 0) +
    (filter.attachment ? 1 : 0)
  );
}

function hasAttachment(
  message: Pick<Message, "hasAttachment" | "attachmentCount" | "thread">,
) {
  return Boolean(
    message.hasAttachment ||
      (message.attachmentCount ?? 0) > 0 ||
      message.thread.some((part) => (part.attachments?.length ?? 0) > 0),
  );
}

export function messageMatchesListFilter(
  message: Pick<
    Message,
    "unread" | "starred" | "hasAttachment" | "attachmentCount" | "thread"
  >,
  filter: ListFilter,
) {
  if (filter.read === "unread" && !message.unread) return false;
  if (filter.read === "read" && message.unread) return false;
  if (filter.starred && !message.starred) return false;
  if (filter.attachment && !hasAttachment(message)) return false;
  return true;
}
