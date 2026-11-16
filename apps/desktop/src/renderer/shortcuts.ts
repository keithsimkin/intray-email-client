/** Shortcut packs inspired by Gmail, Superhuman, and Outlook power-user habits. */

export type ShortcutPackId = "gmail" | "superhuman" | "outlook";

export type ShortcutAction =
  | "compose"
  | "search"
  | "askAi"
  | "help"
  | "next"
  | "prev"
  | "open"
  | "archive"
  | "snooze"
  | "trash"
  | "star"
  | "toggleRead"
  | "reply"
  | "replyAll"
  | "forward"
  | "undo"
  | "goInbox"
  | "goSnoozed"
  | "goSent"
  | "goDrafts"
  | "select";

export type ShortcutDef = {
  action: ShortcutAction;
  label: string;
  group: "Navigate" | "Actions" | "Compose" | "Jump" | "Help";
  /** Display keys for the active pack */
  keys: string;
};

type PackBinding = {
  action: ShortcutAction;
  /** Single key or chord like "g i" */
  match: (e: KeyboardEvent, chord: string | null) => string | null | false;
  keys: string;
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

function keyOf(e: KeyboardEvent): string {
  return e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
}

function noMod(e: KeyboardEvent): boolean {
  return !e.ctrlKey && !e.metaKey && !e.altKey;
}

/** Gmail: j/k navigate, e archive, b snooze, r/a/f reply, # delete, g then … */
const gmailBindings: PackBinding[] = [
  {
    action: "next",
    keys: "J",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "j" ? "next" : false),
  },
  {
    action: "prev",
    keys: "K",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "k" ? "prev" : false),
  },
  {
    action: "open",
    keys: "Enter / O",
    match: (e, c) =>
      noMod(e) && !c && (e.key === "Enter" || keyOf(e) === "o")
        ? "open"
        : false,
  },
  {
    action: "archive",
    keys: "E",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "e" ? "archive" : false),
  },
  {
    action: "snooze",
    keys: "B",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "b" ? "snooze" : false),
  },
  {
    action: "trash",
    keys: "#",
    match: (e, c) =>
      noMod(e) && !c && (e.key === "#" || (e.shiftKey && e.key === "3"))
        ? "trash"
        : false,
  },
  {
    action: "star",
    keys: "S",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "s" ? "star" : false),
  },
  {
    action: "toggleRead",
    keys: "Shift+U",
    match: (e, c) =>
      noMod(e) && !c && e.shiftKey && keyOf(e) === "u" ? "toggleRead" : false,
  },
  {
    action: "reply",
    keys: "R",
    match: (e, c) =>
      noMod(e) && !c && !e.shiftKey && keyOf(e) === "r" ? "reply" : false,
  },
  {
    action: "replyAll",
    keys: "A",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "a" ? "replyAll" : false),
  },
  {
    action: "forward",
    keys: "F",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "f" ? "forward" : false),
  },
  {
    action: "compose",
    keys: "C",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "c" ? "compose" : false),
  },
  {
    action: "search",
    keys: "/",
    match: (e, c) => (noMod(e) && !c && e.key === "/" ? "search" : false),
  },
  {
    action: "select",
    keys: "X",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "x" ? "select" : false),
  },
  {
    action: "undo",
    keys: "Z",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "z" ? "undo" : false),
  },
  {
    action: "help",
    keys: "?",
    match: (e, c) =>
      noMod(e) && !c && (e.key === "?" || (e.shiftKey && e.key === "/"))
        ? "help"
        : false,
  },
  {
    action: "goInbox",
    keys: "G then I",
    match: (e, c) => {
      if (c === "g" && noMod(e) && keyOf(e) === "i") return "goInbox";
      if (noMod(e) && !c && keyOf(e) === "g") return "chord:g";
      return false;
    },
  },
  {
    action: "goSnoozed",
    keys: "G then B",
    match: (e, c) =>
      c === "g" && noMod(e) && keyOf(e) === "b" ? "goSnoozed" : false,
  },
  {
    action: "goSent",
    keys: "G then T",
    match: (e, c) =>
      c === "g" && noMod(e) && keyOf(e) === "t" ? "goSent" : false,
  },
  {
    action: "goDrafts",
    keys: "G then D",
    match: (e, c) =>
      c === "g" && noMod(e) && keyOf(e) === "d" ? "goDrafts" : false,
  },
];

/** Superhuman: j/k, e done, h remind, u read toggle, enter reply-all */
const superhumanBindings: PackBinding[] = [
  {
    action: "next",
    keys: "J",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "j" ? "next" : false),
  },
  {
    action: "prev",
    keys: "K",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "k" ? "prev" : false),
  },
  {
    action: "open",
    keys: "Enter",
    match: (e, c) =>
      noMod(e) && !c && !e.shiftKey && e.key === "Enter" ? "open" : false,
  },
  {
    action: "archive",
    keys: "E",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "e" ? "archive" : false),
  },
  {
    action: "snooze",
    keys: "H",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "h" ? "snooze" : false),
  },
  {
    action: "trash",
    keys: "Shift+3",
    match: (e, c) =>
      noMod(e) && !c && e.shiftKey && e.key === "3" ? "trash" : false,
  },
  {
    action: "star",
    keys: "S",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "s" ? "star" : false),
  },
  {
    action: "toggleRead",
    keys: "U",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "u" ? "toggleRead" : false),
  },
  {
    action: "reply",
    keys: "R",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "r" ? "reply" : false),
  },
  {
    action: "replyAll",
    keys: "Enter",
    match: () => false, // open handles enter in list; replyAll via settings label
  },
  {
    action: "forward",
    keys: "F",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "f" ? "forward" : false),
  },
  {
    action: "compose",
    keys: "C",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "c" ? "compose" : false),
  },
  {
    action: "search",
    keys: "/",
    match: (e, c) => (noMod(e) && !c && e.key === "/" ? "search" : false),
  },
  {
    action: "select",
    keys: "X",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "x" ? "select" : false),
  },
  {
    action: "undo",
    keys: "Z",
    match: (e, c) => (noMod(e) && !c && keyOf(e) === "z" ? "undo" : false),
  },
  {
    action: "help",
    keys: "?",
    match: (e, c) =>
      noMod(e) && !c && (e.key === "?" || (e.shiftKey && e.key === "/"))
        ? "help"
        : false,
  },
  {
    action: "askAi",
    keys: "Ctrl+K",
    match: (e) =>
      (e.ctrlKey || e.metaKey) && !e.shiftKey && keyOf(e) === "k"
        ? "askAi"
        : false,
  },
  {
    action: "goInbox",
    keys: "G then I",
    match: (e, c) => {
      if (c === "g" && noMod(e) && keyOf(e) === "i") return "goInbox";
      if (noMod(e) && !c && keyOf(e) === "g") return "chord:g";
      return false;
    },
  },
  {
    action: "goSnoozed",
    keys: "G then H",
    match: (e, c) =>
      c === "g" && noMod(e) && keyOf(e) === "h" ? "goSnoozed" : false,
  },
  {
    action: "goSent",
    keys: "G then T",
    match: (e, c) =>
      c === "g" && noMod(e) && keyOf(e) === "t" ? "goSent" : false,
  },
  {
    action: "goDrafts",
    keys: "G then D",
    match: (e, c) =>
      c === "g" && noMod(e) && keyOf(e) === "d" ? "goDrafts" : false,
  },
];

/** Outlook-ish: Ctrl chords + arrows */
const outlookBindings: PackBinding[] = [
  {
    action: "next",
    keys: "Ctrl+.",
    match: (e) =>
      (e.ctrlKey || e.metaKey) && e.key === "." ? "next" : false,
  },
  {
    action: "prev",
    keys: "Ctrl+,",
    match: (e) =>
      (e.ctrlKey || e.metaKey) && e.key === "," ? "prev" : false,
  },
  {
    action: "open",
    keys: "Enter",
    match: (e, c) => (noMod(e) && !c && e.key === "Enter" ? "open" : false),
  },
  {
    action: "archive",
    keys: "Ctrl+E",
    // Outlook uses Backspace archive in newer; we map Ctrl+E
    match: (e) =>
      (e.ctrlKey || e.metaKey) && keyOf(e) === "e" ? "archive" : false,
  },
  {
    action: "snooze",
    keys: "Ctrl+Shift+S",
    match: (e) =>
      (e.ctrlKey || e.metaKey) && e.shiftKey && keyOf(e) === "s"
        ? "snooze"
        : false,
  },
  {
    action: "trash",
    keys: "Delete",
    match: (e, c) => (!c && e.key === "Delete" ? "trash" : false),
  },
  {
    action: "star",
    keys: "Ctrl+Shift+G",
    match: (e) =>
      (e.ctrlKey || e.metaKey) && e.shiftKey && keyOf(e) === "g"
        ? "star"
        : false,
  },
  {
    action: "toggleRead",
    keys: "Ctrl+Q",
    match: (e) =>
      (e.ctrlKey || e.metaKey) && keyOf(e) === "q" ? "toggleRead" : false,
  },
  {
    action: "reply",
    keys: "Ctrl+R",
    match: (e) =>
      (e.ctrlKey || e.metaKey) && !e.shiftKey && keyOf(e) === "r"
        ? "reply"
        : false,
  },
  {
    action: "replyAll",
    keys: "Ctrl+Shift+R",
    match: (e) =>
      (e.ctrlKey || e.metaKey) && e.shiftKey && keyOf(e) === "r"
        ? "replyAll"
        : false,
  },
  {
    action: "forward",
    keys: "Ctrl+F",
    match: (e) =>
      (e.ctrlKey || e.metaKey) && !e.shiftKey && keyOf(e) === "f"
        ? "forward"
        : false,
  },
  {
    action: "compose",
    keys: "Ctrl+N",
    match: (e) =>
      (e.ctrlKey || e.metaKey) && keyOf(e) === "n" ? "compose" : false,
  },
  {
    action: "search",
    keys: "Ctrl+E",
    match: () => false, // avoid clash with archive; use Ctrl+F for find in outlook often
  },
  {
    action: "help",
    keys: "F1",
    match: (e) => (e.key === "F1" ? "help" : false),
  },
  {
    action: "undo",
    keys: "Ctrl+Z",
    match: (e) =>
      (e.ctrlKey || e.metaKey) && keyOf(e) === "z" ? "undo" : false,
  },
  {
    action: "goInbox",
    keys: "Ctrl+Shift+I",
    match: (e) =>
      (e.ctrlKey || e.metaKey) && e.shiftKey && keyOf(e) === "i"
        ? "goInbox"
        : false,
  },
];

const packs: Record<ShortcutPackId, PackBinding[]> = {
  gmail: gmailBindings,
  superhuman: superhumanBindings,
  outlook: outlookBindings,
};

export const packMeta: Record<
  ShortcutPackId,
  { name: string; blurb: string }
> = {
  gmail: {
    name: "Gmail",
    blurb: "J/K navigate · E archive · B snooze · G then I for Inbox",
  },
  superhuman: {
    name: "Superhuman",
    blurb: "J/K navigate · E done · H remind · U read · C compose",
  },
  outlook: {
    name: "Outlook",
    blurb: "Ctrl chords · Delete trash · Ctrl+R reply · Ctrl+Q read",
  },
};

const labels: Record<ShortcutAction, { label: string; group: ShortcutDef["group"] }> = {
  next: { label: "Newer / next conversation", group: "Navigate" },
  prev: { label: "Older / previous conversation", group: "Navigate" },
  open: { label: "Open conversation", group: "Navigate" },
  select: { label: "Select / multi-select (checkbox)", group: "Navigate" },
  archive: { label: "Archive / mark done", group: "Actions" },
  snooze: { label: "Snooze / remind me", group: "Actions" },
  trash: { label: "Delete", group: "Actions" },
  star: { label: "Star", group: "Actions" },
  toggleRead: { label: "Toggle read / unread", group: "Actions" },
  undo: { label: "Undo last action", group: "Actions" },
  reply: { label: "Reply", group: "Compose" },
  replyAll: { label: "Reply all", group: "Compose" },
  forward: { label: "Forward", group: "Compose" },
  compose: { label: "Compose", group: "Compose" },
  search: { label: "Search", group: "Compose" },
  askAi: { label: "Ask AI / command", group: "Compose" },
  goInbox: { label: "Go to Inbox", group: "Jump" },
  goSnoozed: { label: "Go to Snoozed", group: "Jump" },
  goSent: { label: "Go to Sent", group: "Jump" },
  goDrafts: { label: "Go to Drafts", group: "Jump" },
  help: { label: "Show shortcut cheat sheet", group: "Help" },
};

export function listShortcuts(pack: ShortcutPackId): ShortcutDef[] {
  const seen = new Set<ShortcutAction>();
  const out: ShortcutDef[] = [];
  for (const b of packs[pack]) {
    if (seen.has(b.action)) continue;
    // skip dead outlook search binding
    if (b.keys === "Ctrl+E" && b.action === "search") continue;
    if (b.action === "replyAll" && pack === "superhuman") {
      out.push({
        action: "replyAll",
        label: "Reply all (when reading)",
        group: "Compose",
        keys: "Enter",
      });
      seen.add(b.action);
      continue;
    }
    const meta = labels[b.action];
    out.push({ action: b.action, label: meta.label, group: meta.group, keys: b.keys });
    seen.add(b.action);
  }
  // Always document global Intray chords
  out.push({
    action: "askAi",
    label: "Ask AI",
    group: "Compose",
    keys: pack === "superhuman" ? "Ctrl+K" : "Ctrl+/",
  });
  out.push({
    action: "compose",
    label: "Compose (global)",
    group: "Compose",
    keys: "Ctrl+N",
  });
  return out;
}

export type ResolveResult =
  | { type: "action"; action: ShortcutAction }
  | { type: "chord"; chord: string }
  | { type: "none" };

export function resolveShortcut(
  pack: ShortcutPackId,
  e: KeyboardEvent,
  chord: string | null,
): ResolveResult {
  if (isTypingTarget(e.target) && !(e.ctrlKey || e.metaKey)) {
    return { type: "none" };
  }

  // Global always-on
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
    return { type: "action", action: "compose" };
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "/") {
    return { type: "action", action: "askAi" };
  }

  for (const b of packs[pack]) {
    const r = b.match(e, chord);
    if (r === false || r === null) continue;
    if (typeof r === "string" && r.startsWith("chord:")) {
      return { type: "chord", chord: r.slice(6) };
    }
    if (typeof r === "string") {
      return { type: "action", action: r as ShortcutAction };
    }
  }
  return { type: "none" };
}
