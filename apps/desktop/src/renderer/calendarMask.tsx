import type { ReactNode } from "react";
import type { CalendarEventDto } from "../shared/plugins";
import { BlurredEmails, useCreatorBlur } from "./creatorBlur";
import {
  looksLikeEmail,
  splitEmailParts,
  type CreatorBlurApi,
  type MailKind,
} from "./creatorMode";

type EventFace = Pick<
  CalendarEventDto,
  "title" | "description" | "organizer" | "attendees"
>;

/** Organizer, then the first guest, decides which creator filter the event follows. */
export function eventMailKind(blur: CreatorBlurApi, event: EventFace): MailKind {
  const email =
    event.organizer?.email?.trim() ||
    event.attendees?.find((person) => person.email?.includes("@"))?.email?.trim() ||
    "";
  return blur.kindForMessage({
    email,
    name: event.organizer?.name,
    subject: event.title,
    preview: event.description,
  });
}

export function textHidesAddress(blur: CreatorBlurApi, text: string): boolean {
  if (!blur.enabled || !text.includes("@")) return false;
  return splitEmailParts(text).some(
    (part) =>
      part.kind === "email" && blur.blurAddress(blur.kindForEmail(part.value)),
  );
}

/** One address. The surrounding label stays sharp. */
export function MaskedAddress({ email }: { email: string }) {
  const blur = useCreatorBlur();
  const value = email.trim();
  if (!looksLikeEmail(value)) return email;
  if (!blur.blurAddress(blur.kindForEmail(value))) return value;
  return <span className="creator-blur">{value}</span>;
}

/** Event title, treated like a subject. Addresses inside stay masked when the title itself is not. */
export function EventTitle({ event }: { event: EventFace }) {
  const blur = useCreatorBlur();
  const on = blur.blurSubject(eventMailKind(blur, event));
  if (on) return <span className="creator-blur">{event.title}</span>;
  return <BlurredEmails text={event.title} />;
}

/** Event notes, treated like a preview. Addresses inside stay masked when the note itself is not. */
export function EventNotes({ event }: { event: EventFace }) {
  const blur = useCreatorBlur();
  const text = event.description ?? "";
  const on = blur.blurPreview(eventMailKind(blur, event));
  return (
    <p className={on ? "cal-notes creator-blur" : "cal-notes"}>
      {on ? text : <BlurredEmails text={text} />}
    </p>
  );
}

/**
 * A person on an event. `both` shows the name and the address when they differ.
 * Otherwise the name wins, matching the calendar rows that already do that.
 */
export function PersonBits({
  name,
  email,
  both = false,
}: {
  name?: string;
  email?: string;
  both?: boolean;
}): ReactNode {
  const blur = useCreatorBlur();
  const display = name?.trim() ?? "";
  const address = email?.trim() ?? "";
  const kind = blur.kindForEmail(
    address || (looksLikeEmail(display) ? display : ""),
  );
  const nameOn = blur.blurName(kind);
  const addressOn = blur.blurAddress(kind);
  const same =
    display !== "" &&
    address !== "" &&
    display.toLowerCase() === address.toLowerCase();

  if (!display && !address) return "Someone";

  if (both && display && address && !same) {
    return (
      <>
        <span className={nameOn ? "creator-blur" : undefined}>{display}</span>
        {" · "}
        <span className={addressOn ? "creator-blur" : undefined}>{address}</span>
      </>
    );
  }

  const shown = display || address;
  const on = looksLikeEmail(shown) ? addressOn : nameOn;
  if (!on) return shown;
  return <span className="creator-blur">{shown}</span>;
}
