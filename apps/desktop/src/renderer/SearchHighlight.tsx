import { BlurredEmails } from "./creatorBlur";
import { splitMatchMarkers } from "../shared/searchQuery";

/** Render an FTS snippet, highlighting the words that matched. */
export function MatchText({ text }: { text: string }) {
  const parts = splitMatchMarkers(text);
  if (parts.length === 1 && !parts[0]?.hit) {
    return <BlurredEmails text={parts[0]?.text ?? ""} />;
  }
  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index} className="search-hit-mark">
            <BlurredEmails text={part.text} />
          </mark>
        ) : (
          <BlurredEmails key={index} text={part.text} />
        ),
      )}
    </>
  );
}
