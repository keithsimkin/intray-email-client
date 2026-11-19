import { ArrowUpRight } from "lucide-react";
import { BlurredEmails } from "./creatorBlur";
import type { Message } from "./data/mock";
import { quickMailBrief } from "./mailBrief";

function openLink(href: string) {
  const clean = href.trim().replace(/[),.;]+$/, "");
  if (!/^(https?:|mailto:)/i.test(clean)) return;
  void window.intray?.openExternal?.(clean);
}

/** A short read of the selected message, plus the links inside it. */
export function AgentBrief({
  message,
  loading,
}: {
  message: Message | null;
  loading: boolean;
}) {
  if (!message) {
    return loading ? <p className="day-mail-status">Reading this mail…</p> : null;
  }
  const brief = quickMailBrief(message);
  return (
    <div className="day-brief-mail">
      {brief.summary ? (
        <p className="day-summary">
          <BlurredEmails text={brief.summary} />
        </p>
      ) : (
        <p className="day-mail-status">
          {loading ? "Reading this mail…" : "No summary for this message."}
        </p>
      )}
      {brief.links.length > 0 ? (
        <div className="day-link-block">
          <p className="agent-brief-kicker">Links</p>
          <ul className="day-links">
            {brief.links.map((link) => (
              <li key={link.href}>
                <button type="button" onClick={() => openLink(link.href)}>
                  <span className="day-link-copy">
                    <span className="day-link-label">
                      <BlurredEmails text={link.label} />
                    </span>
                    {link.host && link.host !== link.label ? (
                      <span className="day-link-host">{link.host}</span>
                    ) : null}
                  </span>
                  <ArrowUpRight size={14} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
