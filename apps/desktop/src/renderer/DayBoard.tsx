import { Mail } from "lucide-react";
import type { BriefKind } from "./agentBrief";
import { AgentBrief } from "./agentMail";
import type { Message } from "./data/mock";
import { shownWhen, type DayPiece } from "./dayScene";

const LABELS: Record<BriefKind, string> = {
  meeting: "Meetings",
  missed: "Missed",
  followup: "Follow up",
  today: "Also",
};

const EMPTY: Record<BriefKind, string> = {
  meeting: "Nothing scheduled in the inbox.",
  missed: "No missed meetings in today’s mail.",
  followup: "No one is waiting on a reply.",
  today: "Nothing else from the past day.",
};

export function DayBoard({
  lede,
  busy,
  note,
  groups,
  quiet,
  faces,
  lens,
  pickedId,
  layout,
  emptyHeadline,
  onLens,
  onPick,
}: {
  lede: string;
  busy: boolean;
  note: string;
  groups: { kind: BriefKind; items: DayPiece[] }[];
  quiet: string[];
  faces: Record<string, { initials: string; color: string }>;
  lens: BriefKind | "all";
  pickedId: string | null;
  layout: "stage" | "rail";
  emptyHeadline: string;
  onLens: (kind: BriefKind | "all") => void;
  onPick: (item: DayPiece) => void;
}) {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const visible = groups.filter((group) => lens === "all" || group.kind === lens);

  if (!total && !quiet.length) {
    return (
      <div className={`day-board ${layout}`}>
        <p className="agent-brief-kicker">Today</p>
        <h3 className="agent-welcome-title">{emptyHeadline}</h3>
        {note ? <p className="agent-brief-note">{note}</p> : null}
      </div>
    );
  }

  return (
    <div className={`day-board ${layout}`}>
      <div className="day-stats" role="toolbar" aria-label="Today">
        {groups.map((group) => (
          <button
            key={group.kind}
            type="button"
            className="day-stat"
            aria-pressed={lens === group.kind}
            onClick={() => onLens(lens === group.kind ? "all" : group.kind)}
          >
            <b>{group.items.length}</b>
            <span>{LABELS[group.kind]}</span>
          </button>
        ))}
      </div>
      {lede ? <p className="day-lede">{lede}</p> : null}
      {busy ? <p className="day-lede">Reading your mail…</p> : null}
      {note ? <p className="agent-brief-note">{note}</p> : null}
      {visible.map((group) =>
        group.items.length ? (
          <section key={group.kind} className="day-section" aria-label={LABELS[group.kind]}>
            <div className="day-section-head">
              <h3>{LABELS[group.kind]}</h3>
            </div>
            <div
              className={
                group.kind === "meeting" || group.kind === "missed"
                  ? "day-grid"
                  : "day-people"
              }
            >
              {group.items.map((item) => {
                const face = faces[item.messageId];
                const active = item.id === pickedId;
                const when = shownWhen(item.when);
                if (group.kind === "meeting" || group.kind === "missed") {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`day-card${active ? " active" : ""}`}
                      aria-pressed={active}
                      onClick={() => onPick(item)}
                    >
                      {when ? <span className="day-when">{when}</span> : null}
                      <strong className="day-what">{item.what}</strong>
                      <span className="day-who">{item.who}</span>
                    </button>
                  );
                }
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`day-person${active ? " active" : ""}`}
                    aria-pressed={active}
                    onClick={() => onPick(item)}
                  >
                    <span
                      className="day-face"
                      style={face?.color ? { background: face.color } : undefined}
                      aria-hidden
                    >
                      {face?.initials || item.who.slice(0, 1).toUpperCase() || "·"}
                    </span>
                    <span className="day-person-copy">
                      <strong>{item.what}</strong>
                      <small>
                        {item.who}
                        {item.note ? ` · ${item.note}` : ""}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : lens === group.kind ? (
          <p key={group.kind} className="agent-brief-empty">
            {EMPTY[group.kind]}
          </p>
        ) : null,
      )}
      {lens === "all" && quiet.length ? (
        <section className="day-section" aria-label="Newsletters">
          <div className="day-section-head">
            <h3>Newsletters</h3>
          </div>
          <div className="day-quiet">
            {quiet.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function DayFocus({
  item,
  message,
  bodyLoading,
  onAsk,
  onOpen,
}: {
  item: DayPiece | null;
  message: Message | null;
  bodyLoading: boolean;
  onAsk: (item: DayPiece) => void;
  onOpen: (messageId: string) => void;
}) {
  if (!item) {
    return (
      <div className="day-focus">
        <p className="agent-brief-kicker">Today</p>
        <p className="day-focus-empty">Nothing in the inbox needs you right now.</p>
      </div>
    );
  }
  const when = shownWhen(item.when);
  return (
    <div className="day-focus">
      <div className="day-focus-head">
        <p className="agent-brief-kicker">{LABELS[item.kind]}</p>
        {when ? <p className="day-focus-when">{when}</p> : null}
        <h2>{item.what}</h2>
        {item.who ? <p className="day-focus-who">{item.who}</p> : null}
      </div>
      <AgentBrief message={message} loading={bodyLoading} />
      <div className="day-focus-actions">
        <button type="button" className="day-ask" onClick={() => onAsk(item)}>
          Ask about this
        </button>
        <button type="button" className="day-open" onClick={() => onOpen(item.messageId)}>
          <Mail size={13} strokeWidth={1.75} />
          Open
        </button>
      </div>
    </div>
  );
}
