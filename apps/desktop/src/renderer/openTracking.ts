import type { OpenReceipt, OpenTracking } from "./data/mock";

const KEY = "intray.open-tracking.v1";

export type TrackedSend = {
  messageId: string;
  token: string;
  subject: string;
  to: string[];
  sentAtIso: string;
  opens: OpenReceipt[];
};

type Store = Record<string, TrackedSend>;

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
}

function save(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

function formatOpenedAt(d: Date): string {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function newTrackingToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  }
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function registerTrackedSend(input: {
  messageId: string;
  subject: string;
  to: string[];
  token?: string;
}): OpenTracking {
  const token = input.token ?? newTrackingToken();
  const store = load();
  store[input.messageId] = {
    messageId: input.messageId,
    token,
    subject: input.subject,
    to: input.to,
    sentAtIso: new Date().toISOString(),
    opens: [],
  };
  save(store);
  return { enabled: true, token, opens: [] };
}

export function getTrackingForMessage(messageId: string): OpenTracking | undefined {
  const row = load()[messageId];
  if (!row) return undefined;
  const first = row.opens[0];
  return {
    enabled: true,
    token: row.token,
    openedAt: first?.at,
    openedAtIso: first?.atIso,
    opens: row.opens,
  };
}

export function recordOpen(
  messageId: string,
  at = new Date(),
): OpenTracking | undefined {
  const store = load();
  const row = store[messageId];
  if (!row) return undefined;
  const receipt: OpenReceipt = {
    at: formatOpenedAt(at),
    atIso: at.toISOString(),
  };
  row.opens = [...row.opens, receipt];
  store[messageId] = row;
  save(store);
  return {
    enabled: true,
    token: row.token,
    openedAt: row.opens[0]?.at,
    openedAtIso: row.opens[0]?.atIso,
    opens: row.opens,
  };
}

/** Demo helper: schedule a simulated first open if still unopened. */
export function scheduleDemoOpen(
  messageId: string,
  delayMs = 12_000,
  onOpen?: (tracking: OpenTracking) => void,
): () => void {
  const timer = window.setTimeout(() => {
    const current = getTrackingForMessage(messageId);
    if (!current || current.opens.length > 0) return;
    const next = recordOpen(messageId);
    if (next) onOpen?.(next);
  }, delayMs);
  return () => window.clearTimeout(timer);
}

export function trackingSummary(tracking: OpenTracking): {
  title: string;
  detail: string;
} {
  if (!tracking.opens.length) {
    return {
      title: "Not opened yet",
      detail: "You’ll see the time here when a recipient opens this mail.",
    };
  }
  const first = tracking.opens[0]!;
  const n = tracking.opens.length;
  return {
    title: n === 1 ? `Opened · ${first.at}` : `Opened ${n}× · first ${first.at}`,
    detail:
      n === 1
        ? "First open recorded from the tracking pixel."
        : `Latest open ${tracking.opens[n - 1]!.at}.`,
  };
}
